import {
  BacktestParameters,
  BacktestResult,
  EquityPoint,
  ExperimentRecord,
  HoldingPeriod,
  MarketRow,
  PerformanceMetrics,
  PortfolioType,
  StrategySpec
} from "../types";
import { clamp, hashString, normalLike, round, seededRandom } from "./random";
import { getFamily } from "./strategyKnowledge";

const TRADING_DAYS = 252;

export interface BacktestContext {
  familyAttempts: number;
  totalTrials: number;
  priorCandidates: ExperimentRecord[];
}

function strategyEdge(strategy: StrategySpec, familyAttempts: number): number {
  const family = getFamily(strategy.familyKey);
  const holdingBonus: Record<HoldingPeriod, number> = {
    1: -0.00011,
    3: 0.00005,
    5: 0.00014,
    20: 0.00002
  };
  const portfolioBonus: Record<PortfolioType, number> = {
    long_short: 0.0001,
    long_only: -0.00002
  };
  // Alpha decay: the more the desk re-mines one family, the thinner the edge
  // (McLean-Pontiff style post-discovery decay, modeled per research desk).
  const decay = Math.pow(0.5, familyAttempts / Math.max(2, family.decayHalfLifeRuns));
  const refinementRecovery = strategy.ideaMode === "refine" ? 1.18 : 1;
  return (
    family.baseEdgeDaily * (0.55 + 0.45 * decay) * refinementRecovery +
    holdingBonus[strategy.holdingPeriod] +
    portfolioBonus[strategy.portfolioType]
  );
}

export function normCdf(z: number): number {
  // Abramowitz-Stegun approximation, plenty for display purposes
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return p;
}

function normInv(p: number): number {
  // Acklam-lite inverse CDF, adequate for N in [2, 500]
  const clamped = clamp(p, 0.0001, 0.9999);
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const pLow = 0.02425;
  let q: number;
  let r: number;
  if (clamped < pLow) {
    q = Math.sqrt(-2 * Math.log(clamped));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (clamped <= 1 - pLow) {
    q = clamped - 0.5;
    r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - clamped));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

// Bailey & Lopez de Prado deflated Sharpe ratio: probability the observed
// Sharpe beats the expected maximum Sharpe from `trials` random tries,
// adjusting for sample length, skewness, and kurtosis.
export function deflatedSharpeProbability(
  sharpeAnnual: number,
  returns: number[],
  trials: number,
  periodsPerYear: number = TRADING_DAYS
): number {
  const T = returns.length;
  if (T < 20) return 0;
  // the input Sharpe is annualized with periodsPerYear, so de-annualize with
  // the same factor to recover the per-period Sharpe (works for hourly /
  // weekly / monthly data, not just daily)
  const srDaily = sharpeAnnual / Math.sqrt(Math.max(1, periodsPerYear));
  const mean = returns.reduce((sum, value) => sum + value, 0) / T;
  const sd = Math.sqrt(returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, T - 1)) || 1e-9;
  const skew = returns.reduce((sum, value) => sum + ((value - mean) / sd) ** 3, 0) / T;
  const kurt = returns.reduce((sum, value) => sum + ((value - mean) / sd) ** 4, 0) / T;
  const n = Math.max(2, trials);
  const gamma = 0.5772156649;
  const srVariance = (1 - skew * srDaily + ((kurt - 1) / 4) * srDaily * srDaily) / Math.max(1, T - 1);
  const srStd = Math.sqrt(Math.max(srVariance, 1e-12));
  const sr0 = srStd * ((1 - gamma) * normInv(1 - 1 / n) + gamma * normInv(1 - 1 / (n * Math.E)));
  const z = ((srDaily - sr0) * Math.sqrt(T - 1)) / Math.sqrt(Math.max(1e-12, 1 - skew * srDaily + ((kurt - 1) / 4) * srDaily * srDaily));
  return clamp(normCdf(z), 0, 1);
}

// WorldQuant-style pool penalty: how correlated is this signal with the
// alphas already promoted to the candidate pool. Deterministic similarity
// proxy from family, factor kind, horizon, and parameter distance.
export function alphaPoolCorrelation(strategy: StrategySpec, priorCandidates: ExperimentRecord[]): number {
  let maxCorrelation = 0;
  priorCandidates.forEach((candidate) => {
    let corr = 0.08;
    if (candidate.familyKey === strategy.familyKey) {
      corr = 0.62;
      const params = candidate.strategyParameters ?? {};
      const names = Object.keys(strategy.parameters);
      if (names.length > 0) {
        const distance =
          names.reduce((sum, name) => {
            const a = Number(strategy.parameters[name]);
            const b = Number(params[name]);
            if (!Number.isFinite(a) || !Number.isFinite(b)) return sum + 0.5;
            const scale = Math.max(1e-9, Math.abs(a) + Math.abs(b));
            return sum + Math.abs(a - b) / scale;
          }, 0) / names.length;
        corr += clamp(0.3 - distance * 0.4, -0.1, 0.3);
      }
    } else if (getFamily(candidate.familyKey).factorKind === strategy.factorKind) {
      corr = 0.42;
    }
    if (candidate.backtestParameters.holdingPeriod === strategy.holdingPeriod) corr += 0.06;
    maxCorrelation = Math.max(maxCorrelation, clamp(corr, 0, 0.97));
  });
  return round(maxCorrelation, 2);
}

function computeMetrics(
  returns: number[],
  turnoverSeries: number[],
  concentration: number,
  yearDependency: number,
  trials: number,
  poolCorrelation: number
): PerformanceMetrics {
  const cumulative = returns.reduce((value, next) => value * (1 + next), 1) - 1;
  const mean = returns.reduce((value, next) => value + next, 0) / Math.max(1, returns.length);
  const variance =
    returns.reduce((value, next) => value + (next - mean) ** 2, 0) / Math.max(1, returns.length - 1);
  const volatility = Math.sqrt(Math.max(variance, 0.0000001));
  const sharpe = (mean / volatility) * Math.sqrt(TRADING_DAYS);
  const annualized = (1 + cumulative) ** (TRADING_DAYS / Math.max(returns.length, 1)) - 1;
  const winRate = returns.filter((item) => item > 0).length / Math.max(returns.length, 1);
  const turnover = turnoverSeries.reduce((value, next) => value + next, 0) / Math.max(1, turnoverSeries.length);

  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  returns.forEach((ret) => {
    equity *= 1 + ret;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity / peak - 1);
  });

  // the mock simulator is daily; pass TRADING_DAYS explicitly so the de-annualization
  // matches the Math.sqrt(TRADING_DAYS) used to annualize `sharpe` above
  const deflated = deflatedSharpeProbability(sharpe, returns, trials, TRADING_DAYS);
  const randomBaselineSharpe = clamp(sharpe * 0.26 + concentration * 0.8 - yearDependency * 0.6, -0.8, 1.1);
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
    randomBaselineSharpe: round(randomBaselineSharpe, 2),
    concentrationScore: round(concentration, 3),
    yearDependencyScore: round(yearDependency, 3),
    deflatedSharpe: round(deflated, 3),
    trialsAtDiscovery: trials,
    alphaPoolCorrelation: poolCorrelation
  };
}

function benchmarkReturn(dayIndex: number): number {
  return 0.00022 + Math.sin(dayIndex / 31) * 0.0014 + Math.sin(dayIndex / 101) * 0.0009;
}

function makeReturnSeries(
  strategy: StrategySpec,
  params: BacktestParameters,
  rows: MarketRow[],
  generatedCode: string,
  familyAttempts: number
): { returns: number[]; benchmarkReturns: number[]; turnoverSeries: number[]; concentration: number; yearDependency: number } {
  // the seed must NOT depend on the cost level, so that cost comparisons see
  // identical noise and the drag stays strictly monotonic
  const rng = seededRandom(`${strategy.id}-${generatedCode.length}`);
  const days = Math.min(330, Math.max(180, Math.floor(rows.length / Math.max(strategy.universe.length, 1))));
  const baseEdge = strategyEdge(strategy, familyAttempts);
  const complexity = Object.keys(strategy.parameters).length + (generatedCode.length % 7);
  const codeSeed = hashString(generatedCode) % 19;
  const concentration =
    clamp(0.18 + (strategy.factorKind === "quality_proxy" || strategy.factorKind === "lead_lag" ? 0.2 : 0) + rng() * 0.32 + codeSeed / 120, 0, 1);
  const yearDependency =
    clamp(0.12 + (strategy.factorKind === "news_sentiment" || strategy.factorKind === "seasonality" ? 0.2 : 0) + rng() * 0.42 + complexity / 75, 0, 1);
  const turnoverBase =
    strategy.holdingPeriod === 1 ? 0.95 : strategy.holdingPeriod === 3 ? 0.76 : strategy.holdingPeriod === 5 ? 0.52 : 0.24;
  const portfolioNoise = strategy.portfolioType === "long_short" ? 0.012 : 0.009;
  const costDrag = (params.transactionCostBps / 10000) * turnoverBase * (strategy.portfolioType === "long_short" ? 1.35 : 0.95);
  const regimeDecay = clamp(0.86 - yearDependency * 0.42 + rng() * 0.22, 0.34, 1.04);
  const returns: number[] = [];
  const benchmarkReturns: number[] = [];
  const turnoverSeries: number[] = [];

  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const split = dayIndex < days * 0.58 ? "in" : "out";
    const regime = Math.sin(dayIndex / 19 + concentration * 3) * 0.0019;
    const eventPulse =
      strategy.factorKind === "event_drift" && dayIndex % 31 < strategy.holdingPeriod ? 0.0018 : 0;
    const newsPulse =
      strategy.factorKind === "news_sentiment" ? Math.sin(dayIndex / 11 + yearDependency) * 0.0015 : 0;
    const seasonPulse = strategy.factorKind === "seasonality" && dayIndex % 21 >= 18 ? 0.0021 : 0;
    const rawEdge = baseEdge * (split === "in" ? 1 + yearDependency * 0.72 : regimeDecay);
    const slippageShock = split === "out" && dayIndex % 47 === 0 ? -0.006 * (0.5 + concentration) : 0;
    const noise = normalLike(rng) * portfolioNoise;
    const dailyTurnover = clamp(turnoverBase + normalLike(rng) * 0.08, 0.04, 1.25);
    const ret = rawEdge + regime + eventPulse + newsPulse + seasonPulse + noise + slippageShock - costDrag;
    returns.push(ret);
    benchmarkReturns.push(benchmarkReturn(dayIndex) + normalLike(rng) * 0.0065);
    turnoverSeries.push(dailyTurnover);
  }

  return { returns, benchmarkReturns, turnoverSeries, concentration, yearDependency };
}

function makeEquityCurve(returns: number[], benchmarkReturns: number[]): EquityPoint[] {
  const points: EquityPoint[] = [];
  let equity = 1;
  let benchmark = 1;
  let peak = 1;
  const baseDate = new Date("2021-01-04T00:00:00Z");

  returns.forEach((ret, index) => {
    equity *= 1 + ret;
    benchmark *= 1 + benchmarkReturns[index];
    peak = Math.max(peak, equity);
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() + index * 1.45);
    points.push({
      date: date.toISOString().slice(0, 10),
      equity: round(equity, 4),
      benchmark: round(benchmark, 4),
      drawdown: round(equity / peak - 1, 4),
      split: index < returns.length * 0.58 ? "in_sample" : "out_of_sample"
    });
  });
  return points;
}

export function runBacktest(
  strategy: StrategySpec,
  params: BacktestParameters,
  rows: MarketRow[],
  generatedCode: string,
  context: BacktestContext = { familyAttempts: 0, totalTrials: 1, priorCandidates: [] }
): BacktestResult {
  const { returns, benchmarkReturns, turnoverSeries, concentration, yearDependency } = makeReturnSeries(
    strategy,
    params,
    rows,
    generatedCode,
    context.familyAttempts
  );
  const splitIndex = Math.floor(returns.length * 0.58);
  const inSampleReturns = returns.slice(0, splitIndex);
  const outOfSampleReturns = returns.slice(splitIndex);
  const inTurnover = turnoverSeries.slice(0, splitIndex);
  const outTurnover = turnoverSeries.slice(splitIndex);
  // Bailey-Lopez de Prado N: every backtest the desk has ever run counts as a
  // trial; the deflated Sharpe must beat the expected max of that many tries.
  const trials = Math.max(context.totalTrials, context.familyAttempts + 1);
  const poolCorrelation = alphaPoolCorrelation(strategy, context.priorCandidates);

  const inSample = computeMetrics(inSampleReturns, inTurnover, concentration * 0.85, yearDependency * 0.9, trials, poolCorrelation);
  const outOfSample = computeMetrics(outOfSampleReturns, outTurnover, concentration, yearDependency, trials, poolCorrelation);
  const full = computeMetrics(returns, turnoverSeries, concentration, yearDependency, trials, poolCorrelation);

  return {
    inSample,
    outOfSample,
    full,
    equityCurve: makeEquityCurve(returns, benchmarkReturns),
    generatedCode,
    // honest provenance: this path does NOT read any real prices/news — it is a
    // deterministic synthetic series for illustration only, never a real backtest.
    dataUsed: `SYNTHETIC illustrative series — deterministic mock simulator, no real prices/news read (${params.universe.length} ${strategy.factorKind.replaceAll("_", " ")} names, benchmark ${params.benchmark})`,
    synthetic: true
  };
}
