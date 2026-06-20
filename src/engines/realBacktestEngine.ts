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
import { annualizedReturn, annualizedSharpe, calmarRatio, maxDrawdown as maxDrawdownOf, probabilisticSharpe, sortinoRatio } from "./perfMetrics";
import { computeFactorAnalytics, FactorCrossSection } from "./factorAnalytics";
import { preprocessSignal } from "./signalPreprocess";
import { dailyBorrowFraction, rebalanceCostFraction } from "./costModel";

// assumed deployed book size used to size square-root market impact in the backtest
const REF_BOOK_USD = 5_000_000;

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
  // transient (NOT persisted to the record): the aligned benchmark series, dates,
  // and annualization factor, so the validation panel can run walk-forward /
  // regime / decay on the true per-bar daily series instead of the decimated curve.
  benchmarkReturns?: number[];
  dates?: string[];
  periodsPerYear?: number;
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

// Rolling market beta of a name vs the benchmark over `window` bars ending at `at`
// (using only data up to `at`), for cross-sectional beta neutralization. Returns
// 1 (market beta) when there is not enough clean overlap.
function rollingBeta(
  nameReturns: (number | null)[],
  benchReturns: (number | null)[],
  at: number,
  window: number
): number {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let index = at - window + 1; index <= at; index += 1) {
    const x = benchReturns[index];
    const y = nameReturns[index];
    if (index >= 0 && x !== null && y !== null) {
      xs.push(x);
      ys.push(y);
    }
  }
  if (xs.length < Math.max(10, window * 0.5)) return 1;
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let cov = 0;
  let varx = 0;
  for (let i = 0; i < xs.length; i += 1) {
    cov += (xs[i] - mx) * (ys[i] - my);
    varx += (xs[i] - mx) ** 2;
  }
  return varx > 1e-12 ? cov / varx : 1;
}

// average daily dollar volume (close x volume) over a window ending at `at`;
// null when the dataset has no volume (e.g. a close-only CSV upload)
function avgDollarVolume(data: RealMarketData, symbol: string, at: number, window: number): number | null {
  const volumes = data.tickers[symbol].volumes;
  const closes = data.tickers[symbol].closes;
  if (!volumes) return null;
  let sum = 0;
  let count = 0;
  for (let index = Math.max(0, at - window + 1); index <= at; index += 1) {
    const v = volumes[index];
    const c = closes[index];
    if (v !== null && v !== undefined && c) {
      sum += v * c;
      count += 1;
    }
  }
  return count >= Math.max(5, window * 0.5) ? sum / count : null;
}

// Amihud (2002) illiquidity: average of |return| / dollar-volume over a window.
// Higher = more price impact per dollar = more illiquid (illiquidity premium).
function amihudIlliquidity(data: RealMarketData, symbol: string, at: number, window: number): number | null {
  const volumes = data.tickers[symbol].volumes;
  const closes = data.tickers[symbol].closes;
  const returns = data.returns[symbol];
  if (!volumes) return null;
  let sum = 0;
  let count = 0;
  for (let index = Math.max(1, at - window + 1); index <= at; index += 1) {
    const r = returns[index];
    const v = volumes[index];
    const c = closes[index];
    if (r !== null && v !== null && v !== undefined && v > 0 && c) {
      sum += Math.abs(r) / (v * c);
      count += 1;
    }
  }
  return count >= Math.max(5, window * 0.5) ? (sum / count) * 1e9 : null; // scaled for readability (rank-invariant)
}

// average high-low range as a fraction of close (Parkinson-style range vol)
function avgHighLowRange(data: RealMarketData, symbol: string, at: number, window: number): number | null {
  const highs = data.tickers[symbol].highs;
  const lows = data.tickers[symbol].lows;
  const closes = data.tickers[symbol].closes;
  if (!highs || !lows) return null;
  let sum = 0;
  let count = 0;
  for (let index = Math.max(0, at - window + 1); index <= at; index += 1) {
    const h = highs[index];
    const l = lows[index];
    const c = closes[index];
    if (h !== null && h !== undefined && l !== null && l !== undefined && c) {
      sum += (h - l) / c;
      count += 1;
    }
  }
  return count >= Math.max(5, window * 0.5) ? sum / count : null;
}

// fundamentals AS KNOWN on day `at` — the latest quarterly report dated <= the
// current bar's date. No lookahead: never returns a report filed after `at`.
function asOfFundamentals(data: RealMarketData, symbol: string, at: number) {
  const series = data.tickers[symbol].fundamentals;
  if (!series || series.length === 0) return null;
  const asOf = data.dates[at];
  let found: (typeof series)[number] | null = null;
  for (const row of series) {
    if (row.date <= asOf) found = row;
    else break; // series is oldest -> newest
  }
  return found;
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
    case "amihud_illiquidity": {
      // long the more illiquid names (Amihud illiquidity premium)
      const window = Math.round(num(p.illiqWindow, 60));
      return amihudIlliquidity(data, symbol, at, window);
    }
    case "dollar_volume_liquidity": {
      // low-turnover / low-attention premium: long names with LOWER dollar volume
      const window = Math.round(num(p.volumeWindow, 60));
      const adv = avgDollarVolume(data, symbol, at, window);
      return adv === null ? null : -Math.log(Math.max(1, adv));
    }
    case "range_volatility": {
      // Parkinson-style range vol as a low-volatility variant: long LOW range
      const window = Math.round(num(p.rangeWindow, 20));
      const range = avgHighLowRange(data, symbol, at, window);
      return range === null ? null : -range;
    }
    case "fundamental_value": {
      // value + quality - leverage, from point-in-time fundamentals (no lookahead).
      // long cheap, profitable, low-debt names. null when no report is known yet.
      const f = asOfFundamentals(data, symbol, at);
      if (!f) return null;
      const earningsYield = f.pe && f.pe > 0 ? 1 / f.pe : 0;
      const bookYield = f.pb && f.pb > 0 ? 1 / f.pb : 0;
      const value = earningsYield + 0.5 * bookYield;
      const quality = (f.roe ?? 0) + (f.netMargin ?? 0);
      const leverage = Math.max(0, f.debtToEquity ?? 0);
      return value * num(p.valueWeight, 1) + quality * num(p.qualityWeight, 0.5) - leverage * num(p.leveragePenalty, 0.1);
    }
    default: {
      // Unknown / non-price family on real data: do NOT silently impersonate
      // momentum. Returning null means no signal -> no position; the family is
      // reported as not backtestable on this dataset rather than promoted under a
      // false name.
      return null;
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
  periodsPerYear: number = DEFAULT_PERIODS_PER_YEAR,
  randomBaselineOverride?: number
): PerformanceMetrics {
  const count = Math.max(1, returns.length);
  const cumulative = returns.reduce((value, next) => value * (1 + next), 1) - 1;
  const winRate = returns.filter((value) => value > 0).length / count;
  const turnover = turnoverSeries.reduce((value, next) => value + next, 0) / Math.max(1, turnoverSeries.length);
  // shared production metric functions (same code the golden test validates vs empyrical)
  const sharpe = annualizedSharpe(returns, periodsPerYear);
  const annualized = annualizedReturn(returns, periodsPerYear);
  const maxDrawdown = maxDrawdownOf(returns);

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
  // measured random-rank baseline (negative after costs) when provided; the old
  // hardcoded 0 made the "beat random" gate too easy and was not a real comparison.
  // When no measured baseline is available (e.g. the bridge return-series path),
  // it stays the sentinel 0 and is flagged unmeasured so the gate abstains.
  const randomBaselineMeasured = randomBaselineOverride !== undefined;
  const randomBaselineSharpe = randomBaselineOverride ?? 0;
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
    alphaPoolCorrelation: poolCorrelation,
    randomBaselineMeasured,
    sortino: round(sortinoRatio(returns, periodsPerYear), 2),
    calmar: round(calmarRatio(annualized, maxDrawdown), 2),
    probabilisticSharpe: round(probabilisticSharpe(sharpe, returns, periodsPerYear), 3)
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

// Measured random-rank baseline: run the SAME rebalance schedule, universe,
// bucket size, and cost model but assign long/short buckets at random, averaged
// over a few seeds, and return the realized out-of-sample Sharpe. After costs a
// random L/S portfolio nets slightly negative — a real, non-trivial bar that the
// strategy must beat (the old hardcoded 0 made the "beat random" check too easy).
function randomRankBaselineOosSharpe(
  data: RealMarketData,
  universe: string[],
  slice: Slice,
  holding: number,
  costRate: number,
  longOnly: boolean,
  periodsPerYear: number,
  splitFraction: number,
  seeds = 4
): number {
  const sharpes: number[] = [];
  for (let s = 0; s < seeds; s += 1) {
    const rng = seededRandom(`randrank-${s}-${universe.length}-${slice.start}-${holding}`);
    const rets: number[] = [];
    let weights = new Map<string, number>();
    let pending = 0;
    for (let day = slice.start; day < slice.end - 1; day += 1) {
      if ((day - slice.start) % holding === 0) {
        const order = universe.map((symbol) => [symbol, rng()] as [string, number]).sort((a, b) => b[1] - a[1]);
        const next = new Map<string, number>();
        const bucket = Math.max(2, Math.floor(order.length * 0.3));
        const longWeight = 1 / bucket;
        for (let index = 0; index < bucket; index += 1) next.set(order[index][0], longWeight);
        if (!longOnly) {
          for (let index = order.length - bucket; index < order.length; index += 1) {
            next.set(order[index][0], (next.get(order[index][0]) ?? 0) - 1 / bucket);
          }
        }
        let turnover = 0;
        new Set([...weights.keys(), ...next.keys()]).forEach((symbol) => {
          turnover += Math.abs((next.get(symbol) ?? 0) - (weights.get(symbol) ?? 0));
        });
        pending += turnover * 0.5 * 2 * costRate;
        weights = next;
      }
      let dayReturn = -pending;
      pending = 0;
      weights.forEach((weight, symbol) => {
        const ret = data.returns[symbol][day + 1];
        if (ret !== null) dayReturn += weight * ret;
      });
      rets.push(dayReturn);
    }
    const split = Math.floor(rets.length * splitFraction);
    const oos = rets.slice(split);
    if (oos.length < 5) continue;
    const mean = oos.reduce((sum, value) => sum + value, 0) / oos.length;
    const variance = oos.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, oos.length - 1);
    sharpes.push((mean / Math.sqrt(Math.max(variance, 1e-12))) * Math.sqrt(periodsPerYear));
  }
  if (sharpes.length === 0) return 0;
  return round(sharpes.reduce((sum, value) => sum + value, 0) / sharpes.length, 2);
}

// Current top-N long book for ANY family at the latest bar (data up to the last
// date only — no lookahead): rank names by the family's signal, take the top N,
// gated by the SPY-vs-200d-MA regime (cash when risk-off). Used by the live
// strategy tournament to know what each sleeve would hold right now.
export function latestTargets(
  strategy: StrategySpec,
  data: RealMarketData,
  top: number
): { targets: string[]; riskOn: boolean; asOf: string } {
  const available = realUniverse(data);
  const universe = strategy.universe.filter((s) => available.includes(s));
  const uni = universe.length >= 6 ? universe : available;
  const industryPeers: Record<string, string[]> = {};
  for (const s of uni) (industryPeers[data.tickers[s].industry] = industryPeers[data.tickers[s].industry] ?? []).push(s);
  const last = data.dates.length - 1;
  const ppy = data.periodsPerYear ?? DEFAULT_PERIODS_PER_YEAR;

  const spy = data.tickers[data.benchmark]?.closes ?? [];
  let sum = 0;
  let cnt = 0;
  for (let k = Math.max(0, last - 199); k <= last; k += 1) if (spy[k]) { sum += spy[k] as number; cnt += 1; }
  const ma = cnt > 0 ? sum / cnt : 0;
  const riskOn = !!(spy[last] && ma && (spy[last] as number) >= ma);

  const scored = uni
    .map((s) => ({ s, v: computeSignal(strategy, data, s, last, industryPeers, ppy) }))
    .filter((x) => x.v !== null && Number.isFinite(x.v as number))
    .sort((a, b) => (b.v as number) - (a.v as number));
  const targets = riskOn ? scored.slice(0, Math.max(1, top)).map((x) => x.s) : [];
  return { targets, riskOn, asOf: data.dates[last] };
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
  const crossSections: FactorCrossSection[] = [];
  const crossSectionReturnIndex: number[] = []; // returns-index at each capture (for IS/OOS split)
  let weights = new Map<string, number>();
  // rebalance cost is charged to the bar the NEW weights first earn (the executing
  // bar), accrued here and subtracted from the next earned return.
  let pendingCost = 0;

  for (let day = slice.start; day < slice.end - 1; day += 1) {
    // rebalance on schedule
    if ((day - slice.start) % holding === 0) {
      const raw: Array<[string, number]> = [];
      for (const symbol of universe) {
        const signal = computeSignal(strategy, data, symbol, day, industryPeers, periodsPerYear);
        if (signal !== null && Number.isFinite(signal)) raw.push([symbol, signal]);
      }
      // Cross-sectional neutralization (Alphalens/Qlib): winsorize then strip the
      // sector tilt and market-beta component, so the traded long/short book and
      // the IC we report are sector- & beta-neutral, not an uncontrolled tilt.
      // Time-series families (seasonality/trend overlay) are market-timing signals,
      // not cross-sectional ranks, so they are left untouched.
      let signals: Array<[string, number]> = raw;
      if (!isTimeSeriesFamily && raw.length >= 6) {
        const groups = raw.map(([symbol]) => data.tickers[symbol].industry);
        const betas = raw.map(([symbol]) => rollingBeta(data.returns[symbol], data.returns[data.benchmark], day, 60));
        const neutral = preprocessSignal(
          raw.map(([, value]) => value),
          { winsorize: 0.025, groups, betas }
        );
        signals = raw.map(([symbol], index) => [symbol, neutral[index]]);
      }
      // capture the (neutralized signal, forward-return) cross-section for
      // Alphalens-style factor analytics — signal uses data <= day, forward return
      // is after day. Record the returns-index so IS/OOS IC can be split later.
      if (signals.length >= 6) {
        const csSignal: number[] = [];
        const fwd: Record<number, number[]> = { 1: [], 5: [], 10: [], 20: [] };
        for (const [symbol, signal] of signals) {
          csSignal.push(signal);
          const c0 = data.tickers[symbol].closes[day];
          for (const h of [1, 5, 10, 20]) {
            const ch = data.tickers[symbol].closes[day + h];
            fwd[h].push(c0 && ch ? ch / c0 - 1 : NaN);
          }
        }
        crossSections.push({ signal: csSignal, forwardByHorizon: fwd });
        crossSectionReturnIndex.push(returns.length);
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
      // per-name turnover -> realistic cost (commission + spread + impact), accrued
      // to the executing bar
      let turnover = 0;
      const deltas = new Map<string, number>();
      const keys = new Set([...weights.keys(), ...next.keys()]);
      keys.forEach((symbol) => {
        const dw = Math.abs((next.get(symbol) ?? 0) - (weights.get(symbol) ?? 0));
        turnover += dw;
        if (dw > 0) deltas.set(symbol, dw);
      });
      turnover *= 0.5;
      turnoverSeries.push(turnover);
      weights = next;
      weightsHistory.push(next);
      // point-in-time ADV (data up to `day` only — no lookahead) for the cost model
      const advAt = new Map<string, number | null>();
      deltas.forEach((_, symbol) => advAt.set(symbol, avgDollarVolume(data, symbol, day, 60)));
      pendingCost += rebalanceCostFraction(deltas, advAt, params.transactionCostBps, REF_BOOK_USD);
    }

    // earn next-bar returns with current weights, net of pending rebalance cost and
    // the daily short-borrow drag on any short positions (point-in-time ADV)
    let borrowDrag = 0;
    if (!longOnly) {
      const borrowAdv = new Map<string, number | null>();
      weights.forEach((w, symbol) => { if (w < 0) borrowAdv.set(symbol, avgDollarVolume(data, symbol, day, 60)); });
      borrowDrag = dailyBorrowFraction(weights, borrowAdv);
    }
    let dayReturn = -pendingCost - borrowDrag;
    pendingCost = 0;
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
  // PURGE + EMBARGO the IS/OOS boundary (López de Prado): the strategy's labels are
  // holding-bar forward returns, so the first `holding` bars after the split share
  // return windows with the last in-sample rebalance — PURGE them. Then add a small
  // EMBARGO gap (serial-correlation buffer) before out-of-sample begins, so the OOS
  // metrics + OOS IC the admission gate trusts carry no leakage from in-sample.
  const embargo = Math.max(1, Math.round(returns.length * 0.01));
  const oosStart = Math.min(returns.length, splitIndex + holding + embargo);
  const trials = context.totalTrials;

  const extras: RealBacktestExtras = {
    dailyReturns: returns.map((value) => Number(value.toFixed(6))),
    returnsStartIndex: slice.start,
    benchmarkReturns: benchmarkReturns.slice(),
    dates: returns.map((_, index) => data.dates[slice.start + index + 1] ?? data.dates[data.dates.length - 1]),
    periodsPerYear
  };
  const poolCorrelation = realPoolCorrelation(extras, context.priorCandidates);
  const randomBaseline = randomRankBaselineOosSharpe(data, universe, slice, holding, costRate, longOnly, periodsPerYear, 0.58);

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
    periodsPerYear,
    randomBaseline
  );
  const outOfSample = computeRealMetrics(
    returns.slice(oosStart),
    turnoverSeries.slice(Math.ceil(oosStart / holding)),
    weightsHistory.slice(Math.ceil(oosStart / holding)),
    splitYears(oosStart, returns.length),
    trials,
    poolCorrelation,
    undefined,
    periodsPerYear,
    randomBaseline
  );
  const full = computeRealMetrics(returns, turnoverSeries, weightsHistory, yearsPnl, trials, poolCorrelation, undefined, periodsPerYear, randomBaseline);

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

  // OUT-OF-SAMPLE factor analytics: only cross-sections captured at/after the
  // PURGED+EMBARGOED OOS start (splitIndex + holding), so the admission gate's
  // "predictive skill" check cannot be satisfied by in-sample IC and carries no
  // label-window overlap with the last in-sample rebalance. Full-sample kept for display.
  const oosCrossSections = crossSections.filter((_, index) => crossSectionReturnIndex[index] >= oosStart);

  // MEASURED capacity input: median recent (~60-bar) daily dollar volume across the
  // traded universe, when the dataset carries volume. Drives a real ADV-based
  // capacity model instead of a turnover heuristic.
  const advValues = universe
    .map((symbol) => avgDollarVolume(data, symbol, slice.end - 1, 60))
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const medianDollarVolume = advValues.length > 0 ? advValues[Math.floor(advValues.length / 2)] : undefined;

  const result: BacktestResult = {
    inSample,
    outOfSample,
    full,
    equityCurve,
    generatedCode: "",
    dataUsed: `${universe.length} names, ${data.dates[slice.start]} to ${data.dates[slice.end - 1]}, ${data.frequency ?? "daily"} adjusted closes (${data.source}), benchmark ${data.benchmark}; cross-sectional signals winsorized + sector/beta-neutralized before ranking`,
    factorAnalytics: computeFactorAnalytics(crossSections, holding) ?? undefined,
    factorAnalyticsOOS: computeFactorAnalytics(oosCrossSections, holding) ?? undefined,
    medianDollarVolume
  };
  return { result, extras };
}
