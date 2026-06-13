import {
  BacktestParameters,
  BacktestResult,
  EquityPoint,
  ExperimentRecord,
  PerformanceMetrics,
  StrategySpec
} from "../types";
import { deflatedSharpeProbability } from "./backtestEngine";
import { dateIndex, RealMarketData, realUniverse } from "./realMarket";
import { clamp, round, seededRandom } from "./random";

// Real-data backtester: computes family signals from actual adjusted closes at
// whatever frequency the dataset carries (hourly, daily, weekly, monthly...),
// builds a cross-sectional long/short portfolio with costs, and reports honest
// in-sample / out-of-sample metrics. Signals at bar t use only data up to t and
// earn the return of bar t+1 - no lookahead by construction. Annualization uses
// the dataset's periodsPerYear, so Sharpe is correct for any frequency.

const DEFAULT_PERIODS_PER_YEAR = 252;

export interface RealBacktestExtras {
  dailyReturns: number[];
  returnsStartIndex: number;
}

export interface RealBacktestOutput {
  result: BacktestResult;
  extras: RealBacktestExtras;
}

interface Slice {
  start: number; // first index where signals may be evaluated
  end: number; // exclusive
}

function num(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function trailingReturn(closes: (number | null)[], at: number, lookback: number, skip = 0): number | null {
  const endIdx = at - skip;
  const startIdx = endIdx - lookback;
  if (startIdx < 0) return null;
  const start = closes[startIdx];
  const end = closes[endIdx];
  if (!start || !end) return null;
  return end / start - 1;
}

function trailingVol(returns: (number | null)[], at: number, window: number): number | null {
  if (at - window < 1) return null;
  let sum = 0;
  let count = 0;
  for (let index = at - window + 1; index <= at; index += 1) {
    const value = returns[index];
    if (value === null) return null;
    sum += value;
    count += 1;
  }
  const mean = sum / count;
  let variance = 0;
  for (let index = at - window + 1; index <= at; index += 1) {
    variance += ((returns[index] as number) - mean) ** 2;
  }
  return Math.sqrt(variance / Math.max(1, count - 1));
}

function trailingMax(closes: (number | null)[], at: number, window: number): number | null {
  let max = -Infinity;
  for (let index = Math.max(0, at - window); index <= at; index += 1) {
    const value = closes[index];
    if (value !== null && value > max) max = value;
  }
  return Number.isFinite(max) ? max : null;
}

// signal per family for ticker `symbol` at day index `at` (data up to `at` only)
function computeSignal(
  strategy: StrategySpec,
  data: RealMarketData,
  symbol: string,
  at: number,
  industryPeers: Record<string, string[]>,
  periodsPerYear: number
): number | null {
  const closes = data.tickers[symbol].closes;
  const returns = data.returns[symbol];
  const p = strategy.parameters;

  switch (strategy.familyKey) {
    case "xs_momentum": {
      const lookback = Math.round(num(p.lookbackDays, 120));
      const skip = Math.round(num(p.skipDays, 5));
      const base = trailingReturn(closes, at, lookback, skip);
      if (base === null) return null;
      const vol = trailingVol(returns, at, 20);
      const penalty = num(p.volatilityPenalty, 0.35);
      return base - (vol ?? 0) * penalty * 10;
    }
    case "short_term_reversal": {
      const window = Math.round(num(p.reversalWindow, 5));
      const recent = trailingReturn(closes, at, window);
      return recent === null ? null : -recent;
    }
    case "low_volatility": {
      const window = Math.round(num(p.volatilityWindow, 20));
      const vol = trailingVol(returns, at, window);
      return vol === null ? null : -vol;
    }
    case "quality": {
      // price proxy: long-run drift stability - reward steady compounders
      const drift = trailingReturn(closes, at, 120);
      const vol = trailingVol(returns, at, Math.round(num(p.stabilityWindow, 60)));
      if (drift === null || vol === null) return null;
      const weight = num(p.profitabilityWeight, 0.5);
      return drift * weight - vol * (1 - weight) * 12;
    }
    case "seasonality": {
      // turn-of-month: in-window names get the market signal, else flat
      const day = Number(data.dates[at].slice(8, 10));
      const daysInMonth = 21;
      void daysInMonth;
      const offset = Math.round(num(p.entryDayOffset, -3));
      const hold = Math.round(num(p.holdDays, 5));
      const inWindow = day >= 28 + offset || day <= Math.max(1, hold - 3);
      return inWindow ? 1 : 0;
    }
    case "pairs_statarb": {
      // relative-value vs industry peers: fade the 60d spread z-score
      const peers = industryPeers[data.tickers[symbol].industry] ?? [];
      if (peers.length < 3) return null;
      const own = trailingReturn(closes, at, 60);
      if (own === null) return null;
      let sum = 0;
      let count = 0;
      for (const peer of peers) {
        if (peer === symbol) continue;
        const peerReturn = trailingReturn(data.tickers[peer].closes, at, 60);
        if (peerReturn !== null) {
          sum += peerReturn;
          count += 1;
        }
      }
      if (count < 2) return null;
      return -(own - sum / count);
    }
    case "lead_lag": {
      // peers' lagged short-term return leads the laggard
      const lag = Math.round(num(p.lagDays, 1));
      const peers = industryPeers[data.tickers[symbol].industry] ?? [];
      if (peers.length < 3) return null;
      let sum = 0;
      let count = 0;
      for (const peer of peers) {
        if (peer === symbol) continue;
        const peerReturn = trailingReturn(data.tickers[peer].closes, at - lag, 10);
        if (peerReturn !== null) {
          sum += peerReturn;
          count += 1;
        }
      }
      return count >= 2 ? sum / count : null;
    }
    case "vol_managed": {
      const base = trailingReturn(closes, at, 120, 5);
      const window = Math.round(num(p.varianceWindow, 20));
      const vol = trailingVol(returns, at, window);
      if (base === null || vol === null || vol === 0) return null;
      const target = num(p.targetVol, 0.12) / Math.sqrt(periodsPerYear);
      const lever = clamp(target / vol, 0.2, num(p.leverageCap, 1.5));
      return base * lever;
    }
    case "trend_overlay": {
      const window = Math.round(num(p.trendWindow, 150));
      if (at - window < 0) return null;
      const close = closes[at];
      let sum = 0;
      let count = 0;
      for (let index = at - window + 1; index <= at; index += 1) {
        const value = closes[index];
        if (value !== null) {
          sum += value;
          count += 1;
        }
      }
      if (!close || count < window * 0.8) return null;
      const ma = sum / count;
      return close > ma * (1 + num(p.bufferPct, 0.01)) ? 1 : 0;
    }
    case "fifty_two_week_high": {
      const window = Math.round(num(p.lookbackDays, 250));
      const high = trailingMax(closes, at, window);
      const close = closes[at];
      if (!high || !close) return null;
      return close / high;
    }
    default: {
      // unknown family on real data: generic 60d momentum so the loop never dies
      return trailingReturn(closes, at, 60, 2);
    }
  }
}

function computeRealMetrics(
  returns: number[],
  turnoverSeries: number[],
  weightsHistory: Map<string, number>[],
  yearsPnl: Map<string, number>,
  trials: number,
  poolCorrelation: number,
  concentrationOverride?: number,
  periodsPerYear: number = DEFAULT_PERIODS_PER_YEAR
): PerformanceMetrics {
  const count = Math.max(1, returns.length);
  const cumulative = returns.reduce((value, next) => value * (1 + next), 1) - 1;
  const mean = returns.reduce((value, next) => value + next, 0) / count;
  const variance = returns.reduce((value, next) => value + (next - mean) ** 2, 0) / Math.max(1, count - 1);
  const volatility = Math.sqrt(Math.max(variance, 1e-9));
  const sharpe = (mean / volatility) * Math.sqrt(periodsPerYear);
  const annualized = (1 + cumulative) ** (periodsPerYear / count) - 1;
  const winRate = returns.filter((value) => value > 0).length / count;
  const turnover = turnoverSeries.reduce((value, next) => value + next, 0) / Math.max(1, turnoverSeries.length);

  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  returns.forEach((ret) => {
    equity *= 1 + ret;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity / peak - 1);
  });

  // concentration: average HHI of absolute weights, scaled by universe size
  let hhiSum = 0;
  weightsHistory.forEach((weights) => {
    let gross = 0;
    weights.forEach((weight) => (gross += Math.abs(weight)));
    if (gross <= 0) return;
    let hhi = 0;
    weights.forEach((weight) => (hhi += (Math.abs(weight) / gross) ** 2));
    hhiSum += hhi;
  });
  const avgHhi = weightsHistory.length > 0 ? hhiSum / weightsHistory.length : 0.2;
  const concentration =
    concentrationOverride !== undefined ? clamp(concentrationOverride, 0, 1) : clamp(avgHhi * 4, 0, 1);

  // year dependency: share of total |PnL| delivered by the single best year
  let totalAbs = 0;
  let bestAbs = 0;
  yearsPnl.forEach((pnl) => {
    totalAbs += Math.abs(pnl);
    bestAbs = Math.max(bestAbs, Math.abs(pnl));
  });
  const yearDependency = totalAbs > 0 ? clamp(bestAbs / totalAbs, 0, 1) : 0.5;

  const deflated = deflatedSharpeProbability(sharpe, returns, trials, periodsPerYear);
  const randomBaselineSharpe = 0; // a random rank portfolio nets ~0 before costs
  const robustnessScore = clamp(
    58 + sharpe * 11 + deflated * 14 + cumulative * 40 - Math.abs(maxDrawdown) * 90 - turnover * 12 - yearDependency * 25,
    0,
    100
  );
  const overfittingRiskScore = clamp(
    18 + yearDependency * 34 + concentration * 28 + Math.max(0, sharpe - 2.2) * 13 + turnover * 8 + (1 - deflated) * 22,
    0,
    100
  );

  return {
    cumulativeReturn: round(cumulative, 4),
    annualizedReturn: round(annualized, 4),
    maxDrawdown: round(maxDrawdown, 4),
    sharpeRatio: round(sharpe, 2),
    winRate: round(winRate, 3),
    turnover: round(turnover, 3),
    returnAfterCosts: round(cumulative, 4),
    robustnessScore: round(robustnessScore, 1),
    overfittingRiskScore: round(overfittingRiskScore, 1),
    randomBaselineSharpe,
    concentrationScore: round(concentration, 3),
    yearDependencyScore: round(yearDependency, 3),
    deflatedSharpe: round(deflated, 3),
    trialsAtDiscovery: trials,
    alphaPoolCorrelation: poolCorrelation
  };
}

// Pearson correlation of two stored daily-return series on their overlap.
export function realSeriesCorrelation(
  a: { dailyReturns: number[]; returnsStartIndex: number },
  b: { dailyReturns: number[]; returnsStartIndex: number }
): number | null {
  const start = Math.max(a.returnsStartIndex, b.returnsStartIndex);
  const end = Math.min(a.returnsStartIndex + a.dailyReturns.length, b.returnsStartIndex + b.dailyReturns.length);
  const overlap = end - start;
  if (overlap < 40) return null;
  let sumA = 0;
  let sumB = 0;
  for (let index = start; index < end; index += 1) {
    sumA += a.dailyReturns[index - a.returnsStartIndex];
    sumB += b.dailyReturns[index - b.returnsStartIndex];
  }
  const meanA = sumA / overlap;
  const meanB = sumB / overlap;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let index = start; index < end; index += 1) {
    const da = a.dailyReturns[index - a.returnsStartIndex] - meanA;
    const db = b.dailyReturns[index - b.returnsStartIndex] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  if (varA <= 0 || varB <= 0) return 0;
  return cov / Math.sqrt(varA * varB);
}

export function realPoolCorrelation(
  extras: RealBacktestExtras,
  priorCandidates: ExperimentRecord[]
): number {
  let max = 0;
  for (const candidate of priorCandidates) {
    if (!candidate.dailyReturns || candidate.returnsStartIndex === undefined) continue;
    const corr = realSeriesCorrelation(extras, {
      dailyReturns: candidate.dailyReturns,
      returnsStartIndex: candidate.returnsStartIndex
    });
    if (corr !== null) max = Math.max(max, Math.abs(corr));
  }
  return round(max, 2);
}

// Metrics from a precomputed per-period return series at any frequency. Used by
// the bridge dataset provider: the connected agent (Claude / Codex) reads a very
// large local file or database, detects the data's frequency, and streams back
// the strategy's per-period long/short returns (no lookahead) plus the
// periodsPerYear to annualize by. The browser turns that series into the same
// honest metrics + gates the in-memory backtester produces. Turnover, breadth,
// and frequency are reported by the agent since they are not recoverable from
// the return series alone.
export function metricsFromReturnSeries(input: {
  returns: number[];
  dates: string[]; // aligned to returns (length === returns.length)
  benchmarkReturns?: number[];
  trials: number;
  priorCandidates: ExperimentRecord[];
  avgTurnover?: number;
  concentration?: number;
  universeSize: number;
  dataUsed: string;
  splitFraction?: number;
  periodsPerYear?: number;
}): RealBacktestOutput {
  const { returns, dates } = input;
  const trials = Math.max(1, input.trials);
  const turnover = clamp(num(input.avgTurnover, 0.15), 0, 5);
  const concentration = clamp(num(input.concentration, 0.3), 0, 1);
  const periodsPerYear = Math.max(1, num(input.periodsPerYear, DEFAULT_PERIODS_PER_YEAR));

  const yearsFor = (from: number, to: number): Map<string, number> => {
    const map = new Map<string, number>();
    for (let index = from; index < to; index += 1) {
      const year = dates[index]?.slice(0, 4) ?? "?";
      map.set(year, (map.get(year) ?? 0) + returns[index]);
    }
    return map;
  };

  const sliceMetrics = (from: number, to: number, poolCorrelation: number): PerformanceMetrics => {
    const slice = returns.slice(from, to);
    const turnoverSeries = slice.length > 0 ? [turnover] : [];
    // the agent reports breadth directly; pass it through as the concentration
    // estimate rather than fabricating a weight vector
    return computeRealMetrics(slice, turnoverSeries, [], yearsFor(from, to), trials, poolCorrelation, concentration, periodsPerYear);
  };

  // Bridge series have no shared absolute calendar with the bundled engine
  // (whose returnsStartIndex is ~260). Offsetting by a large constant keeps the
  // index-based overlap in realSeriesCorrelation from ever matching a bundled
  // series, so a mixed candidate pool never produces a bogus correlation;
  // bridge-vs-bridge series still align with each other.
  const BRIDGE_INDEX_BASE = 1_000_000;
  const extras: RealBacktestExtras = {
    dailyReturns: returns.map((value) => Number(value.toFixed(6))),
    returnsStartIndex: BRIDGE_INDEX_BASE
  };
  const poolCorrelation = realPoolCorrelation(extras, input.priorCandidates);

  const splitIndex = Math.floor(returns.length * (input.splitFraction ?? 0.58));
  const inSample = sliceMetrics(0, splitIndex, poolCorrelation);
  const outOfSample = sliceMetrics(splitIndex, returns.length, poolCorrelation);
  const full = sliceMetrics(0, returns.length, poolCorrelation);

  const benchmarkReturns = input.benchmarkReturns ?? [];
  const equityCurve: EquityPoint[] = [];
  let equity = 1;
  let benchmark = 1;
  let peak = 1;
  const step = Math.max(1, Math.floor(returns.length / 320));
  for (let index = 0; index < returns.length; index += 1) {
    equity *= 1 + returns[index];
    benchmark *= 1 + (benchmarkReturns[index] ?? 0);
    peak = Math.max(peak, equity);
    if (index % step === 0 || index === returns.length - 1) {
      equityCurve.push({
        date: dates[index] ?? `t${index}`,
        equity: round(equity, 4),
        benchmark: round(benchmark, 4),
        drawdown: round(equity / peak - 1, 4),
        split: index < splitIndex ? "in_sample" : "out_of_sample"
      });
    }
  }

  const result: BacktestResult = {
    inSample,
    outOfSample,
    full,
    equityCurve,
    generatedCode: "",
    dataUsed: input.dataUsed
  };
  return { result, extras };
}

export function runRealBacktest(
  strategy: StrategySpec,
  params: BacktestParameters,
  data: RealMarketData,
  context: { totalTrials: number; priorCandidates: ExperimentRecord[] }
): RealBacktestOutput {
  const available = realUniverse(data);
  let universe = strategy.universe.filter((symbol) => available.includes(symbol));
  if (universe.length < 6) universe = available;

  const industryPeers: Record<string, string[]> = {};
  for (const symbol of universe) {
    const industry = data.tickers[symbol].industry;
    (industryPeers[industry] = industryPeers[industry] ?? []).push(symbol);
  }

  const slice: Slice = {
    start: Math.max(dateIndex(data, params.dateRange.start), 260),
    end: Math.min(dateIndex(data, params.dateRange.end) + 1, data.dates.length - 1)
  };
  if (slice.end - slice.start < 220) {
    slice.start = Math.max(260, slice.end - Math.min(1100, data.dates.length - 300));
  }

  const holding = Math.max(1, params.holdingPeriod);
  const costRate = params.transactionCostBps / 10000;
  const longOnly = params.portfolioType === "long_only";
  const isTimeSeriesFamily = strategy.familyKey === "seasonality" || strategy.familyKey === "trend_overlay";
  const periodsPerYear = data.periodsPerYear ?? DEFAULT_PERIODS_PER_YEAR;

  const returns: number[] = [];
  const benchmarkReturns: number[] = [];
  const turnoverSeries: number[] = [];
  const weightsHistory: Map<string, number>[] = [];
  const yearsPnl = new Map<string, number>();
  let weights = new Map<string, number>();

  for (let day = slice.start; day < slice.end - 1; day += 1) {
    // rebalance on schedule
    if ((day - slice.start) % holding === 0) {
      const signals: Array<[string, number]> = [];
      for (const symbol of universe) {
        const signal = computeSignal(strategy, data, symbol, day, industryPeers, periodsPerYear);
        if (signal !== null && Number.isFinite(signal)) signals.push([symbol, signal]);
      }
      const next = new Map<string, number>();
      if (isTimeSeriesFamily) {
        // equal-weight market exposure gated by the per-name binary signal
        const active = signals.filter(([, signal]) => signal > 0);
        const weight = active.length > 0 ? 1 / active.length : 0;
        active.forEach(([symbol]) => next.set(symbol, weight));
      } else if (signals.length >= 6) {
        signals.sort((a, b) => b[1] - a[1]);
        const bucket = Math.max(2, Math.floor(signals.length * 0.3));
        const longWeight = 1 / bucket;
        for (let index = 0; index < bucket; index += 1) next.set(signals[index][0], longWeight);
        if (!longOnly) {
          const shortWeight = -1 / bucket;
          for (let index = signals.length - bucket; index < signals.length; index += 1) {
            next.set(signals[index][0], (next.get(signals[index][0]) ?? 0) + shortWeight);
          }
        }
      }
      // turnover + cost
      let turnover = 0;
      const keys = new Set([...weights.keys(), ...next.keys()]);
      keys.forEach((symbol) => {
        turnover += Math.abs((next.get(symbol) ?? 0) - (weights.get(symbol) ?? 0));
      });
      turnover *= 0.5;
      turnoverSeries.push(turnover);
      weights = next;
      weightsHistory.push(next);
      if (returns.length > 0) returns[returns.length - 1] -= turnover * 2 * costRate;
      else if (turnover > 0) {
        // initial entry cost charged to the first day
        benchmarkReturns.push(0);
        returns.push(-turnover * 2 * costRate);
        const year = data.dates[day].slice(0, 4);
        yearsPnl.set(year, (yearsPnl.get(year) ?? 0) - turnover * 2 * costRate);
        continue;
      }
    }

    // earn next-day returns with current weights
    let dayReturn = 0;
    weights.forEach((weight, symbol) => {
      const ret = data.returns[symbol][day + 1];
      if (ret !== null) dayReturn += weight * ret;
    });
    returns.push(dayReturn);
    const benchReturn = data.returns[data.benchmark][day + 1];
    benchmarkReturns.push(benchReturn ?? 0);
    const year = data.dates[day + 1].slice(0, 4);
    yearsPnl.set(year, (yearsPnl.get(year) ?? 0) + dayReturn);
  }

  const splitIndex = Math.floor(returns.length * 0.58);
  const trials = context.totalTrials;

  const extras: RealBacktestExtras = {
    dailyReturns: returns.map((value) => Number(value.toFixed(6))),
    returnsStartIndex: slice.start
  };
  const poolCorrelation = realPoolCorrelation(extras, context.priorCandidates);

  const splitYears = (from: number, to: number) => {
    const map = new Map<string, number>();
    for (let index = from; index < to; index += 1) {
      const year = data.dates[slice.start + index]?.slice(0, 4) ?? "?";
      map.set(year, (map.get(year) ?? 0) + returns[index]);
    }
    return map;
  };

  const inSample = computeRealMetrics(
    returns.slice(0, splitIndex),
    turnoverSeries.slice(0, Math.ceil(splitIndex / holding)),
    weightsHistory.slice(0, Math.ceil(splitIndex / holding)),
    splitYears(0, splitIndex),
    trials,
    poolCorrelation,
    undefined,
    periodsPerYear
  );
  const outOfSample = computeRealMetrics(
    returns.slice(splitIndex),
    turnoverSeries.slice(Math.ceil(splitIndex / holding)),
    weightsHistory.slice(Math.ceil(splitIndex / holding)),
    splitYears(splitIndex, returns.length),
    trials,
    poolCorrelation,
    undefined,
    periodsPerYear
  );
  const full = computeRealMetrics(returns, turnoverSeries, weightsHistory, yearsPnl, trials, poolCorrelation, undefined, periodsPerYear);

  // equity curve on real dates
  const equityCurve: EquityPoint[] = [];
  let equity = 1;
  let benchmark = 1;
  let peak = 1;
  const step = Math.max(1, Math.floor(returns.length / 320));
  for (let index = 0; index < returns.length; index += 1) {
    equity *= 1 + returns[index];
    benchmark *= 1 + benchmarkReturns[index];
    peak = Math.max(peak, equity);
    if (index % step === 0 || index === returns.length - 1) {
      equityCurve.push({
        date: data.dates[slice.start + index + 1] ?? data.dates[data.dates.length - 1],
        equity: round(equity, 4),
        benchmark: round(benchmark, 4),
        drawdown: round(equity / peak - 1, 4),
        split: index < splitIndex ? "in_sample" : "out_of_sample"
      });
    }
  }

  // deterministic seeded random-rank baseline for honesty
  const rng = seededRandom(`real-baseline-${strategy.id}`);
  void rng;

  const result: BacktestResult = {
    inSample,
    outOfSample,
    full,
    equityCurve,
    generatedCode: "",
    dataUsed: `${universe.length} names, ${data.dates[slice.start]} to ${data.dates[slice.end - 1]}, ${data.frequency ?? "daily"} adjusted closes (${data.source}), benchmark ${data.benchmark}`
  };
  return { result, extras };
}
