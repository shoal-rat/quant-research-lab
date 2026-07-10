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

// A deployment check is itself a selection event, not a single innocent
// backtest. Count a conservative number of effective trials by default so the
// deflated-Sharpe bar cannot be relaxed merely because this wrapper used to pass
// `1` into the real engine.
export const DEFAULT_VALIDATION_TRIALS = 50;
export const MIN_VALIDATION_TRIALS = 20;
const MAX_VALIDATION_TRIALS = 10_000;
const MIN_OOS_IC_OBSERVATIONS = 10;
const MIN_OOS_IC_HAC_T_STAT = 1.5;

export function resolveValidationTrials(value?: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_VALIDATION_TRIALS;
  return Math.min(MAX_VALIDATION_TRIALS, Math.max(MIN_VALIDATION_TRIALS, Math.floor(parsed)));
}

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
  // Bypasses only the lab-candidate-status requirement. It never bypasses the
  // explicit OOS IC, risk, or performance checks and cannot place an order.
  force?: boolean;
  trials?: number;
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
    trials: number;
  };
  regime: { riskOn: boolean; asOf: string };
  targets: string[];
  universeSize: number;
  dataRange: string;
}

// The displayed `oosICt` is the engine's Newey-West/HAC-corrected IC t-stat.
// Keep this wrapper's deployment gate pinned to the exact same OOS evidence
// rather than relying on the lab-status side effect or an in-sample fallback.
export function deploymentGateReasons(input: {
  labStatus: string;
  metrics: ValidateResult["metrics"];
  force?: boolean;
}): string[] {
  const { labStatus, metrics } = input;
  const reasons: string[] = [];
  if (labStatus === "failed_to_run") reasons.push("strategy failed to run");
  if (labStatus !== "candidate" && input.force !== true) {
    reasons.push(`real lab status ${labStatus} is not candidate`);
  }
  if (metrics.oosSharpe < 0.5) reasons.push(`OOS Sharpe ${metrics.oosSharpe.toFixed(2)} < 0.50`);
  if (metrics.returnAfterCosts <= 0) reasons.push(`OOS return after costs ${(metrics.returnAfterCosts * 100).toFixed(1)}% <= 0`);
  if (metrics.deflatedSharpe < 0.5) reasons.push(`deflated Sharpe ${(metrics.deflatedSharpe * 100).toFixed(0)}% < 50% over ${metrics.trials} trials`);
  if (metrics.walkForwardPassRate !== null && metrics.walkForwardPassRate < 0.5) {
    reasons.push(`walk-forward pass rate ${(metrics.walkForwardPassRate * 100).toFixed(0)}% < 50%`);
  }
  // Fail closed: missing/null/non-finite OOS IC data cannot satisfy a paper
  // deployment gate. `icTStat` is HAC corrected in factorAnalytics.ts.
  if (metrics.oosICobs === null || !Number.isFinite(metrics.oosICobs) || metrics.oosICobs < MIN_OOS_IC_OBSERVATIONS) {
    reasons.push(`OOS IC observations ${metrics.oosICobs ?? "n/a"} < ${MIN_OOS_IC_OBSERVATIONS}`);
  }
  if (metrics.oosICt === null || !Number.isFinite(metrics.oosICt) || metrics.oosICt < MIN_OOS_IC_HAC_T_STAT) {
    const shown = metrics.oosICt === null ? "n/a" : metrics.oosICt.toFixed(2);
    reasons.push(`HAC OOS IC t-stat ${shown} < ${MIN_OOS_IC_HAC_T_STAT.toFixed(1)}`);
  }
  if (metrics.oosSharpe <= metrics.randomBaselineSharpe + 0.1) {
    reasons.push(`does not beat random baseline (${metrics.randomBaselineSharpe.toFixed(2)})`);
  }
  if (metrics.maxDrawdown < -0.6) reasons.push(`catastrophic max drawdown ${(metrics.maxDrawdown * 100).toFixed(0)}%`);
  return reasons;
}

export function validateMomentum(universeFile: string, opts: ValidateOptions = {}): ValidateResult {
  const top = opts.top ?? 8;
  const lookback = opts.lookback ?? 120;
  const skip = opts.skip ?? 5;
  const holding = opts.holding ?? 5;
  const costBps = opts.costBps ?? 5;
  const trials = resolveValidationTrials(opts.trials);

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
    parameters: { lookbackDays: lookback, skipDays: skip, volatilityPenalty: 0.35, regimeGate: "riskon", targetCount: top },
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
    benchmark: data.benchmark,
    executionLag: 1,
    delistingHaircutBps: 30
  };

  const { result, extras } = runRealBacktest(strategy, params, data, {
    totalTrials: trials,
    priorCandidates: [],
    evaluateLockbox: true
  });
  const review = reviewBacktestRisk(strategy, result);
  const wf = computeWalkForward(extras.dailyReturns, extras.dates, {
    holding,
    periodsPerYear: extras.periodsPerYear ?? 252
  });
  const poolDelta =
    extras.oosDailyReturns && extras.oosReturnsStartIndex !== undefined
      ? poolSharpeDelta({ dailyReturns: extras.oosDailyReturns, returnsStartIndex: extras.oosReturnsStartIndex }, [])
      : undefined;
  const labStatus = decideExperimentStatus(result, review, strategy.factorLogic.repeat(3), 0, poolDelta, wf?.passRate, undefined, true);

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
    maxDrawdown: oos.maxDrawdown,
    trials
  };

  // Deployment is fail-closed: it must have cleared the real lab's candidate
  // gate and independently show the same displayed OOS HAC-IC evidence. `force`
  // is intentionally narrow: it can waive only the status requirement.
  const reasons = deploymentGateReasons({ labStatus, metrics, force: opts.force === true });
  const passed = reasons.length === 0;

  // Use the engine's exact neutralized ranking / regime implementation — the
  // deployed book must not be a different raw-momentum portfolio.
  const book = latestTargets(strategy, data, top);
  const last = data.dates.length - 1;

  return {
    passed,
    labStatus,
    reasons,
    metrics,
    regime: { riskOn: book.riskOn, asOf: book.asOf },
    targets: book.targets,
    universeSize: symbols.length,
    dataRange: `${data.dates[0]} -> ${data.dates[last]}`
  };
}

export interface ConfigOptions {
  familyKey: string;
  params?: Record<string, number | string | boolean>;
  top?: number;
  holding?: number;
  costBps?: number;
  // Narrow override: waive only the lab-status requirement, never the direct
  // OOS HAC-IC / risk / performance evidence.
  force?: boolean;
  trials?: number;
}

// Validate ANY computable family + parameters through the same real engine gate,
// and return its current top-N book (via the engine's latestTargets). Used by the
// strategy tournament so each sleeve can be a different family.
export function validateConfig(universeFile: string, opts: ConfigOptions): ValidateResult & { familyKey: string } {
  const family = getFamily(opts.familyKey);
  const top = opts.top ?? 8;
  const holding = (opts.holding ?? family.holdingPeriods[0] ?? 5) as HoldingPeriod;
  const costBps = opts.costBps ?? 5;
  const trials = resolveValidationTrials(opts.trials);
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
    parameters: { ...defaults, regimeGate: "riskon", ...(opts.params ?? {}), targetCount: top },
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
    benchmark: data.benchmark,
    executionLag: 1,
    delistingHaircutBps: 30
  };

  const { result, extras } = runRealBacktest(strategy, params, data, {
    totalTrials: trials,
    priorCandidates: [],
    evaluateLockbox: true
  });
  const review = reviewBacktestRisk(strategy, result);
  const wf = computeWalkForward(extras.dailyReturns, extras.dates, { holding, periodsPerYear: extras.periodsPerYear ?? 252 });
  const poolDelta =
    extras.oosDailyReturns && extras.oosReturnsStartIndex !== undefined
      ? poolSharpeDelta({ dailyReturns: extras.oosDailyReturns, returnsStartIndex: extras.oosReturnsStartIndex }, [])
      : undefined;
  const labStatus = decideExperimentStatus(result, review, strategy.factorLogic.repeat(3), 0, poolDelta, wf?.passRate, undefined, true);

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
    maxDrawdown: oos.maxDrawdown,
    trials
  };
  const reasons = deploymentGateReasons({ labStatus, metrics, force: opts.force === true });
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
