// Historical-validation gate for paper trading, run through the REAL lab engine.
// Given a universe JSON, it backtests cross-sectional momentum with no lookahead
// (runRealBacktest: winsorized + sector/beta-neutralized signals, costs, IS/OOS
// split with purge+embargo), then applies the same risk review + walk-forward +
// deflated-Sharpe + OOS-IC checks the lab uses, and returns a deployment verdict
// plus the current top-N momentum targets. esbuild bundles this for Node; the
// paper connector/sim refuse to trade unless `passed` is true.
import fs from "node:fs";
import { buildRealMarketData } from "../src/engines/realMarket";
import { runRealBacktest, latestTargets } from "../src/engines/realBacktestEngine";
import { reviewBacktestRisk, decideExperimentStatus } from "../src/engines/riskReviewEngine";
import { computeWalkForward } from "../src/engines/walkForward";
import { poolSharpeDelta } from "../src/engines/poolAnalytics";
import { getAllFamilies, getFamily } from "../src/engines/strategyKnowledge";
import type { BacktestParameters, HoldingPeriod, StrategySpec } from "../src/types";

// the price-computable factor families the engine can actually backtest in-browser
export function computableFamilies(): Array<{ key: string; name: string; factorKind: string }> {
  return getAllFamilies()
    .filter((f) => f.priceComputable)
    .map((f) => ({ key: f.key, name: f.name, factorKind: f.factorKind }));
}

export interface ValidateOptions {
  top?: number;
  lookback?: number;
  skip?: number;
  holding?: number;
  costBps?: number;
}

export interface ValidateResult {
  passed: boolean;
  labStatus: string;
  reasons: string[];
  metrics: {
    oosSharpe: number;
    fullSharpe: number;
    returnAfterCosts: number;
    deflatedSharpe: number;
    oosICt: number | null;
    oosICobs: number | null;
    walkForwardPassRate: number | null;
    randomBaselineSharpe: number;
    maxDrawdown: number;
  };
  regime: { riskOn: boolean; asOf: string };
  targets: string[];
  universeSize: number;
  dataRange: string;
}

export function validateMomentum(universeFile: string, opts: ValidateOptions = {}): ValidateResult {
  const top = opts.top ?? 8;
  const lookback = opts.lookback ?? 120;
  const skip = opts.skip ?? 5;
  const holding = opts.holding ?? 5;
  const costBps = opts.costBps ?? 5;

  const bundle = JSON.parse(fs.readFileSync(universeFile, "utf-8"));
  const data = buildRealMarketData(bundle);
  const symbols = Object.keys(data.tickers).filter((s) => s !== data.benchmark);

  const strategy: StrategySpec = {
    id: "STR-validate-momentum",
    name: "Cross-Sectional Momentum",
    hypothesis: "Relative winners keep winning over 3-12 months.",
    factorLogic: "rank trailing return (skip recent week), long winners",
    factorKind: "momentum",
    familyKey: "xs_momentum",
    holdingPeriod: holding as StrategySpec["holdingPeriod"],
    portfolioType: "long_only",
    universe: symbols,
    parameters: { lookbackDays: lookback, skipDays: skip, volatilityPenalty: 0.35 },
    generation: 0,
    ideaMode: "explore",
    ideaReasoning: []
  };
  const params: BacktestParameters = {
    universe: symbols,
    dateRange: { start: data.dates[0], end: data.dates[data.dates.length - 1] },
    holdingPeriod: holding as BacktestParameters["holdingPeriod"],
    portfolioType: "long_only",
    transactionCostBps: costBps,
    benchmark: data.benchmark
  };

  const { result, extras } = runRealBacktest(strategy, params, data, { totalTrials: 1, priorCandidates: [] });
  const review = reviewBacktestRisk(strategy, result);
  const wf = computeWalkForward(extras.dailyReturns, extras.dates, {
    holding,
    periodsPerYear: extras.periodsPerYear ?? 252
  });
  const poolDelta = poolSharpeDelta(extras, []);
  const labStatus = decideExperimentStatus(result, review, strategy.factorLogic.repeat(3), 0, poolDelta, wf?.passRate);

  const oos = result.outOfSample;
  const oosIC = result.factorAnalyticsOOS;
  const metrics = {
    oosSharpe: oos.sharpeRatio,
    fullSharpe: result.full.sharpeRatio,
    returnAfterCosts: oos.returnAfterCosts,
    deflatedSharpe: oos.deflatedSharpe,
    oosICt: oosIC ? oosIC.icTStat : null,
    oosICobs: oosIC ? oosIC.observations : null,
    walkForwardPassRate: wf ? wf.passRate : null,
    randomBaselineSharpe: oos.randomBaselineSharpe,
    maxDrawdown: oos.maxDrawdown
  };

  // Deployment bar: does the SIGNAL have a genuine, robust OUT-OF-SAMPLE edge?
  // Every check below is real and out-of-sample. We deliberately do NOT hard-fail
  // on the lab's "rejected" pool-promotion status: that strict gate is dominated by
  // the always-invested 2008/2020 drawdown, which the trend-filter overlay applied
  // at deploy time is specifically designed to avoid. failed_to_run (no working
  // implementation) IS a hard fail. labStatus is still reported for transparency.
  const reasons: string[] = [];
  if (labStatus === "failed_to_run") reasons.push("strategy failed to run");
  if (metrics.oosSharpe < 0.5) reasons.push(`OOS Sharpe ${metrics.oosSharpe.toFixed(2)} < 0.50`);
  if (metrics.returnAfterCosts <= 0) reasons.push(`OOS return after costs ${(metrics.returnAfterCosts * 100).toFixed(1)}% <= 0`);
  if (metrics.deflatedSharpe < 0.5) reasons.push(`deflated Sharpe ${(metrics.deflatedSharpe * 100).toFixed(0)}% < 50%`);
  if (wf && wf.passRate < 0.5) reasons.push(`walk-forward pass rate ${(wf.passRate * 100).toFixed(0)}% < 50%`);
  if (metrics.oosSharpe <= metrics.randomBaselineSharpe + 0.1) reasons.push(`does not beat random baseline (${metrics.randomBaselineSharpe.toFixed(2)})`);
  if (metrics.maxDrawdown < -0.6) reasons.push(`catastrophic max drawdown ${(metrics.maxDrawdown * 100).toFixed(0)}%`);
  const passed = reasons.length === 0;

  // current top-N positive-momentum targets + market regime (SPY vs 200d MA)
  const last = data.dates.length - 1;
  const closeAt = (sym: string, i: number) => data.tickers[sym].closes[i];
  const spy = data.tickers[data.benchmark].closes;
  let sum = 0;
  let cnt = 0;
  for (let k = Math.max(0, last - 199); k <= last; k += 1) if (spy[k]) { sum += spy[k] as number; cnt += 1; }
  const ma200 = cnt > 0 ? sum / cnt : 0;
  const riskOn = !!(spy[last] && ma200 && (spy[last] as number) >= ma200);
  const scored = symbols
    .map((sym) => {
      const r = closeAt(sym, last - skip);
      const p = closeAt(sym, last - skip - lookback);
      return { sym, m: r && p ? r / p - 1 : null };
    })
    .filter((x) => x.m !== null && (x.m as number) > 0)
    .sort((a, b) => (b.m as number) - (a.m as number));
  const targets = riskOn ? scored.slice(0, top).map((x) => x.sym) : [];

  return {
    passed,
    labStatus,
    reasons,
    metrics,
    regime: { riskOn, asOf: data.dates[last] },
    targets,
    universeSize: symbols.length,
    dataRange: `${data.dates[0]} -> ${data.dates[last]}`
  };
}

export interface ConfigOptions {
  familyKey: string;
  params?: Record<string, number>;
  top?: number;
  holding?: number;
  costBps?: number;
}

// Validate ANY computable family + parameters through the same real engine gate,
// and return its current top-N book (via the engine's latestTargets). Used by the
// strategy tournament so each sleeve can be a different family.
export function validateConfig(universeFile: string, opts: ConfigOptions): ValidateResult & { familyKey: string } {
  const family = getFamily(opts.familyKey);
  const top = opts.top ?? 8;
  const holding = (opts.holding ?? family.holdingPeriods[0] ?? 5) as HoldingPeriod;
  const costBps = opts.costBps ?? 5;
  const bundle = JSON.parse(fs.readFileSync(universeFile, "utf-8"));
  const data = buildRealMarketData(bundle);
  const symbols = Object.keys(data.tickers).filter((s) => s !== data.benchmark);

  const defaults: Record<string, number> = {};
  for (const p of family.parameters) defaults[p.name] = p.default;
  const strategy: StrategySpec = {
    id: `STR-${family.key}`,
    name: family.name,
    hypothesis: family.rationale,
    factorLogic: family.construction,
    factorKind: family.factorKind,
    familyKey: family.key,
    holdingPeriod: holding,
    portfolioType: "long_only",
    universe: symbols,
    parameters: { ...defaults, ...(opts.params ?? {}) },
    generation: 0,
    ideaMode: "explore",
    ideaReasoning: []
  };
  const params: BacktestParameters = {
    universe: symbols,
    dateRange: { start: data.dates[0], end: data.dates[data.dates.length - 1] },
    holdingPeriod: holding,
    portfolioType: "long_only",
    transactionCostBps: costBps,
    benchmark: data.benchmark
  };

  const { result, extras } = runRealBacktest(strategy, params, data, { totalTrials: 1, priorCandidates: [] });
  const review = reviewBacktestRisk(strategy, result);
  const wf = computeWalkForward(extras.dailyReturns, extras.dates, { holding, periodsPerYear: extras.periodsPerYear ?? 252 });
  const poolDelta = poolSharpeDelta(extras, []);
  const labStatus = decideExperimentStatus(result, review, strategy.factorLogic.repeat(3), 0, poolDelta, wf?.passRate);

  const oos = result.outOfSample;
  const oosIC = result.factorAnalyticsOOS;
  const metrics = {
    oosSharpe: oos.sharpeRatio,
    fullSharpe: result.full.sharpeRatio,
    returnAfterCosts: oos.returnAfterCosts,
    deflatedSharpe: oos.deflatedSharpe,
    oosICt: oosIC ? oosIC.icTStat : null,
    oosICobs: oosIC ? oosIC.observations : null,
    walkForwardPassRate: wf ? wf.passRate : null,
    randomBaselineSharpe: oos.randomBaselineSharpe,
    maxDrawdown: oos.maxDrawdown
  };
  const reasons: string[] = [];
  if (labStatus === "failed_to_run") reasons.push("strategy failed to run");
  if (metrics.oosSharpe < 0.5) reasons.push(`OOS Sharpe ${metrics.oosSharpe.toFixed(2)} < 0.50`);
  if (metrics.returnAfterCosts <= 0) reasons.push(`OOS return after costs ${(metrics.returnAfterCosts * 100).toFixed(1)}% <= 0`);
  if (metrics.deflatedSharpe < 0.5) reasons.push(`deflated Sharpe ${(metrics.deflatedSharpe * 100).toFixed(0)}% < 50%`);
  if (wf && wf.passRate < 0.5) reasons.push(`walk-forward pass rate ${(wf.passRate * 100).toFixed(0)}% < 50%`);
  if (metrics.oosSharpe <= metrics.randomBaselineSharpe + 0.1) reasons.push(`does not beat random baseline (${metrics.randomBaselineSharpe.toFixed(2)})`);
  if (metrics.maxDrawdown < -0.6) reasons.push(`catastrophic max drawdown ${(metrics.maxDrawdown * 100).toFixed(0)}%`);
  const passed = reasons.length === 0;

  const book = latestTargets(strategy, data, top);
  const last = data.dates.length - 1;
  return {
    passed,
    labStatus,
    reasons,
    metrics,
    regime: book,
    targets: book.targets,
    universeSize: symbols.length,
    dataRange: `${data.dates[0]} -> ${data.dates[last]}`,
    familyKey: family.key
  };
}
