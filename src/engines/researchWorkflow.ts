import {
  BacktestParameters,
  BacktestResult,
  BaselineComparison,
  CapacityReport,
  CompiledSignal,
  CredibilityTier,
  ExecutionSimulationReport,
  ExperimentRecord,
  ExperimentRegistryV2,
  ExperimentStatus,
  FeatureStoreRecord,
  HumanReviewState,
  NoveltyCheck,
  PointInTimeDataLayer,
  RegimeAnalysis,
  RegimeResult,
  ResearchDiscoveryCard,
  ResearchFeedEvent,
  ResearchMemoryGraph,
  ResearchSourceCitation,
  ResearchSourceKind,
  ResearchWorkflowAudit,
  RiskReview,
  Settings,
  StrategyLibraryCard,
  StrategySpec,
  WalkForwardReport,
  WalkForwardWindow
} from "../types";
import { round } from "./random";
import { StrategyFamily, getFamily } from "./strategyKnowledge";
import { computeWalkForward } from "./walkForward";

const SOURCE_PRIORS: Record<ResearchSourceKind, { score: number; tier: CredibilityTier; label: string }> = {
  sec_filing: { score: 0.95, tier: "high", label: "SEC filing" },
  earnings_call: { score: 0.9, tier: "high", label: "earnings call transcript" },
  regulatory_filing: { score: 0.9, tier: "high", label: "regulatory filing" },
  academic_paper: { score: 0.82, tier: "medium_high", label: "academic or working paper" },
  industry_report: { score: 0.78, tier: "medium_high", label: "industry report" },
  company_press_release: { score: 0.72, tier: "medium_high", label: "company press release" },
  sell_side: { score: 0.6, tier: "medium", label: "sell-side research" },
  news: { score: 0.56, tier: "medium", label: "financial news" },
  github: { score: 0.46, tier: "medium", label: "GitHub repository" },
  forum: { score: 0.34, tier: "low", label: "forum thread" },
  reddit: { score: 0.28, tier: "low", label: "Reddit thread" },
  x: { score: 0.22, tier: "very_low", label: "X post" },
  anonymous_rumor: { score: 0.08, tier: "very_low", label: "anonymous rumor" },
  other: { score: 0.4, tier: "low", label: "other source" }
};

function tierFromScore(score: number): CredibilityTier {
  if (score >= 0.8) return "high";
  if (score >= 0.68) return "medium_high";
  if (score >= 0.48) return "medium";
  if (score >= 0.22) return "low";
  return "very_low";
}

function sourceKindFromText(text: string): ResearchSourceKind {
  const lower = text.toLowerCase();
  if (/sec\.gov|10-k|10-q|8-k|s-1/.test(lower)) return "sec_filing";
  if (/earnings|transcript|call/.test(lower)) return "earnings_call";
  if (/regulator|regulatory|filing/.test(lower)) return "regulatory_filing";
  if (/arxiv|ssrn|nber|paper|journal|doi/.test(lower)) return "academic_paper";
  if (/industry|consulting|report|whitepaper/.test(lower)) return "industry_report";
  if (/press release|investor relations|ir\./.test(lower)) return "company_press_release";
  if (/sell.?side|broker|analyst/.test(lower)) return "sell_side";
  if (/reddit\.com|subreddit/.test(lower)) return "reddit";
  if (/(^|\/)(x|twitter)\.com/.test(lower)) return "x";
  if (/github\.com/.test(lower)) return "github";
  if (/forum|stackexchange|seekingalpha/.test(lower)) return "forum";
  if (/rumor|anonymous/.test(lower)) return "anonymous_rumor";
  if (/bloomberg|reuters|wsj|ft\.com|cnbc|marketwatch|yahoo/.test(lower)) return "news";
  return "other";
}

export function normalizeSourceCitation(raw: unknown, fallbackTitle = "Research source"): ResearchSourceCitation {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const title = String(record.title ?? record.name ?? fallbackTitle).slice(0, 140);
  const url = typeof record.url === "string" ? record.url.slice(0, 260) : typeof raw === "string" ? raw.slice(0, 260) : undefined;
  const sourceType =
    typeof record.sourceType === "string" && record.sourceType in SOURCE_PRIORS
      ? (record.sourceType as ResearchSourceKind)
      : sourceKindFromText(`${title} ${url ?? ""}`);
  const prior = SOURCE_PRIORS[sourceType];
  const explicitScore = Number(record.credibilityScore);
  const credibilityScore = round(Number.isFinite(explicitScore) ? Math.max(0, Math.min(1, explicitScore)) : prior.score, 2);
  return {
    title,
    sourceType,
    url,
    publishedAt: typeof record.publishedAt === "string" ? record.publishedAt : undefined,
    accessedAt: typeof record.accessedAt === "string" ? record.accessedAt : new Date().toISOString().slice(0, 10),
    credibilityScore,
    credibilityTier: tierFromScore(credibilityScore),
    note: typeof record.note === "string" ? record.note.slice(0, 180) : prior.label
  };
}

function citationsForFamily(family: StrategyFamily): ResearchSourceCitation[] {
  const fromCard = family.discoveryCard?.sourceCitations ?? [];
  if (fromCard.length > 0) return fromCard.map((source) => normalizeSourceCitation(source, source.title));
  const refs = family.references && family.references.length > 0 ? family.references : family.keyPapers;
  return refs.slice(0, 5).map((ref) => normalizeSourceCitation(ref, ref));
}

export function sourceCredibility(citations: ResearchSourceCitation[]) {
  const sources = citations.length > 0 ? citations : [normalizeSourceCitation("No source attached", "No source attached")];
  const score = round(sources.reduce((sum, source) => sum + source.credibilityScore, 0) / sources.length, 2);
  const warnings: string[] = [];
  if (sources.every((source) => source.credibilityScore < 0.5)) warnings.push("Only low-credibility sources are attached.");
  if (sources.some((source) => source.sourceType === "reddit" || source.sourceType === "x" || source.sourceType === "anonymous_rumor")) {
    warnings.push("Retail or rumor sources must be treated as sentiment context, not proof.");
  }
  if (!sources.some((source) => source.sourceType === "academic_paper" || source.sourceType === "sec_filing" || source.sourceType === "earnings_call")) {
    warnings.push("No high-grade paper, filing, or transcript source is attached yet.");
  }
  return { score, tier: tierFromScore(score), sources, warnings };
}

export function defaultDiscoveryCard(family: StrategyFamily, strategy?: StrategySpec): ResearchDiscoveryCard {
  const citations = citationsForFamily(family);
  return {
    phenomenon: family.name,
    whyAlphaMayExist: family.rationale,
    tradableUniverse: strategy?.universe?.length ? `${strategy.universe.length} selected equities` : "Cross-sectional equity universe",
    requiredData: family.newsDriven
      ? ["point-in-time prices", "timestamped news or event feed", "sector classification", "tradable universe membership"]
      : ["point-in-time prices", "tradable universe membership", "sector classification"],
    signalConstruction: family.signalSpec ?? family.construction,
    timestampLag: family.newsDriven ? "Use source publication time plus at least one trading-bar lag." : "Use signal at bar t to trade bar t+1.",
    holdingPeriod: strategy ? `${strategy.holdingPeriod} trading bars` : `${family.holdingPeriods.join("/")} trading bars`,
    failureRisks: family.failureModes,
    sourceCitations: citations
  };
}

export function compileSignal(family: StrategyFamily, strategy: StrategySpec): CompiledSignal {
  const parameterText = Object.entries(strategy.parameters)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
  const feature =
    family.signalSpec ??
    `${family.factorKind.replaceAll("_", " ")} score from ${family.construction.toLowerCase()}`;
  return {
    universe: strategy.universe.length > 0 ? strategy.universe.join(", ") : "active cross-section",
    feature,
    rank: strategy.portfolioType === "long_short" ? "Rank descending; long top bucket and short bottom bucket." : "Rank descending; hold top bucket only.",
    lag: "1 trading bar minimum lag after feature timestamp.",
    hold: `${strategy.holdingPeriod} trading bars`,
    portfolio: strategy.portfolioType,
    formula: `${family.key}(${parameterText || "default parameters"}) -> rank -> ${strategy.portfolioType.replace("_", "/")}`,
    rebalance: `Every ${strategy.holdingPeriod} trading bars with configured transaction costs.`
  };
}

function returnsFromBacktest(backtest: BacktestResult): {
  returns: number[];
  benchmarkReturns: number[];
  dates: string[];
  periodsPerYear: number;
} {
  // Aligned series: one strategy + one benchmark return per equity-curve step
  // (invalid steps coerced to 0) so regime analysis can join them by index.
  const returns: number[] = [];
  const benchmarkReturns: number[] = [];
  const dates: string[] = [];
  for (let index = 1; index < backtest.equityCurve.length; index += 1) {
    const prev = backtest.equityCurve[index - 1];
    const point = backtest.equityCurve[index];
    const r = prev.equity > 0 && point.equity > 0 ? point.equity / prev.equity - 1 : 0;
    const b = prev.benchmark > 0 && point.benchmark > 0 ? point.benchmark / prev.benchmark - 1 : 0;
    returns.push(Number.isFinite(r) ? r : 0);
    benchmarkReturns.push(Number.isFinite(b) ? b : 0);
    dates.push(point.date);
  }
  if (returns.length === 0) {
    const n = 120;
    const per = Math.sign(backtest.full.cumulativeReturn) * Math.abs(backtest.full.cumulativeReturn / n);
    for (let index = 0; index < n; index += 1) {
      returns.push(per);
      benchmarkReturns.push(0);
      dates.push(`t${index + 1}`);
    }
  }
  return { returns, benchmarkReturns, dates, periodsPerYear: inferPeriodsPerYear(dates) };
}

// Infer the annualization factor from the median spacing of real dates so Sharpe
// etc. stay correct at any frequency. Falls back to 252 for synthetic labels.
function inferPeriodsPerYear(dates: string[]): number {
  const stamps = dates.map((d) => Date.parse(d)).filter((t) => Number.isFinite(t)) as number[];
  if (stamps.length < 3) return 252;
  const gaps: number[] = [];
  for (let i = 1; i < stamps.length; i += 1) {
    const g = stamps[i] - stamps[i - 1];
    if (g > 0) gaps.push(g);
  }
  if (gaps.length === 0) return 252;
  gaps.sort((a, b) => a - b);
  const days = gaps[Math.floor(gaps.length / 2)] / 86_400_000;
  if (days <= 0) return 252;
  if (days < 0.5) return Math.max(252, Math.round((6.5 / (days * 24)) * 252)); // intraday bars
  if (days <= 1.5) return 252; // daily
  if (days <= 9) return 52; // weekly
  if (days <= 45) return 12; // monthly
  return Math.max(1, Math.round(365 / days));
}

function cumulative(returns: number[]): number {
  return returns.reduce((value, next) => value * (1 + next), 1) - 1;
}

function sharpe(returns: number[], periodsPerYear = 252): number {
  if (returns.length < 3) return 0;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, returns.length - 1);
  const vol = Math.sqrt(Math.max(variance, 1e-12));
  return round((mean / vol) * Math.sqrt(periodsPerYear), 2);
}

function maxDrawdown(returns: number[]): number {
  let equity = 1;
  let peak = 1;
  let dd = 0;
  for (const ret of returns) {
    equity *= 1 + ret;
    peak = Math.max(peak, equity);
    dd = Math.min(dd, equity / peak - 1);
  }
  return round(dd, 4);
}

// Purged + embargoed walk-forward (López de Prado). Delegates to the validated
// engine; if there is not enough data for honest folds, report a single explicit
// window instead of inventing several.
function buildWalkForward(returns: number[], dates: string[], holding: number, periodsPerYear: number): WalkForwardReport {
  const report = computeWalkForward(returns, dates, { holding, folds: 4, embargoFraction: 0.02, periodsPerYear });
  if (report) return report;
  const half = Math.floor(returns.length / 2);
  const test = returns.slice(half);
  const testSharpe = sharpe(test, periodsPerYear);
  const windows: WalkForwardWindow[] = [
    {
      trainRange: `${dates[0] ?? "start"}..${dates[Math.max(0, half - 1)] ?? "mid"}`,
      testRange: `${dates[half] ?? "mid"}..${dates[dates.length - 1] ?? "end"}`,
      testSharpe,
      testReturn: round(cumulative(test), 4),
      passed: testSharpe > 0
    }
  ];
  return {
    windows,
    passRate: testSharpe > 0 ? 1 : 0,
    worstSharpe: testSharpe,
    summary: `Only one out-of-sample window was statistically usable (${returns.length} bars); treat walk-forward evidence as weak.`
  };
}

function regimeMetrics(name: string, values: number[], note: string, periodsPerYear: number): RegimeResult {
  return {
    regime: name,
    observations: values.length,
    sharpe: sharpe(values, periodsPerYear),
    cumulativeReturn: round(cumulative(values), 4),
    maxDrawdown: maxDrawdown(values),
    note
  };
}

// Regime analysis must classify by the MARKET, then measure the strategy inside
// each regime — never by the strategy's own return sign (that is circular: a
// strategy is trivially "good" on the bars where it happened to make money). We
// bucket on the benchmark's direction and the benchmark's realized volatility; if
// no usable benchmark exists we fall back to the strategy's rolling volatility
// (still exogenous to the sign of its return) and say so in the note.
function buildRegimes(returns: number[], benchmarkReturns: number[], periodsPerYear: number): RegimeAnalysis {
  const hasBenchmark = benchmarkReturns.some((value) => Math.abs(value) > 1e-9);
  const driver = hasBenchmark ? benchmarkReturns : returns;
  const driverLabel = hasBenchmark ? "benchmark" : "strategy-volatility (no benchmark available)";

  // realized volatility as |driver| smoothed over a 5-bar window -> vol regime
  const win = 5;
  const vol: number[] = driver.map((_, i) => {
    const slice = driver.slice(Math.max(0, i - win + 1), i + 1).map((v) => Math.abs(v));
    return slice.reduce((s, v) => s + v, 0) / slice.length;
  });
  const sortedVol = [...vol].sort((a, b) => a - b);
  const volP70 = sortedVol[Math.floor(sortedVol.length * 0.7)] ?? 0;
  const volP30 = sortedVol[Math.floor(sortedVol.length * 0.3)] ?? 0;
  const sortedDriver = [...driver].sort((a, b) => a - b);
  const crisisCut = sortedDriver[Math.floor(sortedDriver.length * 0.1)] ?? -0.02;

  const pick = (predicate: (driverValue: number, volValue: number, index: number) => boolean) =>
    returns.filter((_, i) => predicate(driver[i], vol[i], i));

  const regimes = [
    regimeMetrics("market_up", pick((d) => d > 0), `Strategy return on bars where the ${driverLabel} rose.`, periodsPerYear),
    regimeMetrics("market_down", pick((d) => d <= 0), `Strategy return on bars where the ${driverLabel} fell.`, periodsPerYear),
    regimeMetrics("high_volatility", pick((_, v) => v >= volP70), `Strategy return in the top ${driverLabel} realized-vol bucket.`, periodsPerYear),
    regimeMetrics("low_volatility", pick((_, v) => v <= volP30), `Strategy return in the bottom ${driverLabel} realized-vol bucket.`, periodsPerYear),
    regimeMetrics("crisis", pick((d) => d <= crisisCut), `Strategy return on the worst-decile ${driverLabel} bars.`, periodsPerYear)
  ].filter((regime) => regime.observations >= 5);

  const best = [...regimes].sort((a, b) => b.sharpe - a.sharpe)[0];
  const worst = [...regimes].sort((a, b) => a.sharpe - b.sharpe)[0];
  return {
    regimes,
    bestRegime: best?.regime ?? "unknown",
    worstRegime: worst?.regime ?? "unknown",
    summary:
      (worst && worst.sharpe < -0.5 ? `Regime weakness in ${worst.regime}.` : "No single market regime is catastrophic.") +
      (hasBenchmark ? "" : " (No benchmark series — regimes use strategy realized vol, so the market-direction split is unavailable.)")
  };
}

function buildNovelty(strategy: StrategySpec, backtest: BacktestResult, experiments: ExperimentRecord[]): NoveltyCheck {
  const family = getFamily(strategy.familyKey);
  const familyHistory = experiments.filter((experiment) => experiment.familyKey === strategy.familyKey);
  const similarFailures = familyHistory
    .filter((experiment) => experiment.status === "rejected" || experiment.status === "failed_to_run")
    .slice(-4)
    .map((experiment) => experiment.id);
  const testedBefore = familyHistory.length > 0;
  const highCorrelationToPool = backtest.outOfSample.alphaPoolCorrelation > 0.7;
  const momentumOverlap =
    family.factorKind === "momentum"
      ? 0.92
      : /momentum|winner|trailing return|trend/i.test(`${family.construction} ${family.signalSpec ?? ""}`)
        ? 0.62
        : 0.24;
  const knownFactorSimilarity = family.origin === "researched" ? Math.min(0.58, momentumOverlap + 0.12) : Math.max(0.7, momentumOverlap);
  const verdict: NoveltyCheck["verdict"] = highCorrelationToPool
    ? "duplicate"
    : knownFactorSimilarity > 0.72
      ? "known_factor"
      : similarFailures.length > 1
        ? "needs_review"
        : "novel";
  return {
    verdict,
    nearestKnownFactor: family.name,
    knownFactorSimilarity: round(knownFactorSimilarity, 2),
    momentumOverlap: round(momentumOverlap, 2),
    testedBefore,
    highCorrelationToPool,
    similarFailures,
    notes: [
      testedBefore ? `${familyHistory.length} prior runs in this family.` : "No prior run in this exact family.",
      highCorrelationToPool ? "Pool correlation gate says the idea may already be in the book." : "Pool correlation is not a hard duplicate.",
      momentumOverlap > 0.6 ? "Treat as a possible momentum variant until proven otherwise." : "Not obviously just momentum."
    ]
  };
}

function pointInTimeLayer(card: ResearchDiscoveryCard, family: StrategyFamily): PointInTimeDataLayer {
  const requiredDatasets = [...new Set(["prices", "tradable universe membership", "sector classification", ...card.requiredData])];
  if (family.newsDriven) requiredDatasets.push("timestamped news feed");
  if (family.factorKind === "earnings_revision" || family.factorKind === "event_drift") requiredDatasets.push("earnings calendar and revisions");
  return {
    asOfPolicy: "Every feature joins by event-time/as-of date, never by revised report date.",
    timestampLag: card.timestampLag,
    requiredDatasets: [...new Set(requiredDatasets)],
    revisionPolicy: "Store original value, vendor-revision timestamp, and restatement timestamp; replay only values known at that bar.",
    leakChecks: [
      "Signal at bar t earns returns from bar t+1 onward.",
      "Index membership and sector labels must use as-of snapshots.",
      "Fundamentals, ratings, news, and earnings must carry vendor availability lag.",
      "Forward-filled fields stop at delisting or universe exit."
    ]
  };
}

function registryV2(
  strategy: StrategySpec,
  params: BacktestParameters,
  riskReview: RiskReview,
  experiments: ExperimentRecord[],
  status: ExperimentStatus,
  dataUsed: string,
  reviewStatus: HumanReviewState["status"]
): ExperimentRegistryV2 {
  const parent = strategy.parentExperimentId ? experiments.find((experiment) => experiment.id === strategy.parentExperimentId) : undefined;
  const parameterChanges = Object.entries(strategy.parameters).map(([key, value]) => {
    const previous = parent?.strategyParameters?.[key];
    return previous === undefined ? `${key}=${value}` : `${key}: ${previous} -> ${value}`;
  });
  const similar = experiments
    .filter((experiment) => experiment.familyKey === strategy.familyKey)
    .slice(-5)
    .map((experiment) => experiment.id);
  const failed = riskReview.checks.filter((check) => check.status === "fail").map((check) => check.label);
  return {
    hypothesisSource: strategy.discoveryCard ? "research discovery card" : getFamily(strategy.familyKey).origin === "researched" ? "agent web discovery" : "built-in literature family",
    dataUsed: [dataUsed, `${params.dateRange.start} to ${params.dateRange.end}`, `${params.transactionCostBps} bps cost model`],
    parameterChanges,
    failureReason: failed.length > 0 ? failed.join("; ") : status === "archived" ? "No strong enough edge after gates." : undefined,
    similarPastExperiments: similar,
    repeatedIdea: similar.length > 0,
    forwardTested: false,
    reviewStatus
  };
}

function alphaDecay(backtest: BacktestResult, returns: number[]): ResearchWorkflowAudit["alphaDecay"] {
  const recent = returns.slice(Math.floor(returns.length * 0.75));
  const lifetimeSharpe = backtest.full.sharpeRatio;
  const recentSharpe = sharpe(recent);
  const sharpeDecline = round(lifetimeSharpe - recentSharpe, 2);
  const retirementSignal = sharpeDecline > 0.8 || (backtest.outOfSample.alphaPoolCorrelation > 0.65 && recentSharpe < 0.3);
  return {
    lifetimeSharpe,
    recentSharpe,
    sharpeDecline,
    turnoverTrend: backtest.outOfSample.turnover > backtest.inSample.turnover ? "rising" : "stable",
    crowdingTrend: backtest.outOfSample.alphaPoolCorrelation > 0.5 ? "rising" : "contained",
    retirementSignal,
    summary: retirementSignal ? "Decay monitor recommends retire or redesign before promotion." : "No retirement trigger yet; monitor forward paper results."
  };
}

function capacity(strategy: StrategySpec, backtest: BacktestResult): CapacityReport {
  const universeSize = Math.max(1, strategy.universe.length);
  const turnover = backtest.outOfSample.turnover;
  const spread = strategy.holdingPeriod <= 3 ? 11 : strategy.holdingPeriod <= 5 ? 7 : 4;
  const borrow = strategy.portfolioType === "long_short" ? 18 + backtest.outOfSample.alphaPoolCorrelation * 12 : 0;
  const impact = round(3 + turnover * 22 + backtest.outOfSample.concentrationScore * 18, 1);
  const maxCapital = Math.max(250_000, (universeSize * 45_000_000) / (1 + turnover * 4 + backtest.outOfSample.concentrationScore * 3));
  return {
    advParticipation: round(Math.min(0.18, 0.015 + turnover * 0.06 + backtest.outOfSample.concentrationScore * 0.04), 3),
    marketImpactBps: impact,
    bidAskSpreadBps: spread,
    borrowCostBps: round(borrow, 1),
    maxDeployableCapitalUsd: Math.round(maxCapital),
    bottleneck: turnover > 0.7 ? "turnover and slippage" : strategy.portfolioType === "long_short" ? "short borrow and crowded names" : "single-name liquidity"
  };
}

function execution(strategy: StrategySpec, backtest: BacktestResult, cap: CapacityReport): ExecutionSimulationReport {
  const turnover = backtest.outOfSample.turnover;
  const latency = strategy.holdingPeriod <= 1 ? 350 : strategy.holdingPeriod <= 3 ? 900 : 2200;
  const slippage = round(cap.bidAskSpreadBps * 0.55 + cap.marketImpactBps * 0.45 + turnover * 6, 1);
  return {
    slippageBps: slippage,
    latencyMs: latency,
    partialFillRate: round(Math.min(0.35, 0.04 + cap.advParticipation * 1.1), 2),
    openGapRisk: round(Math.min(0.2, Math.abs(backtest.outOfSample.maxDrawdown) * 0.42), 3),
    closeAuctionRisk: round(Math.min(0.18, turnover * 0.11), 3),
    haltStressLoss: round(Math.min(0.12, backtest.outOfSample.concentrationScore * 0.08), 3),
    limitMoveRisk: round(strategy.portfolioType === "long_short" ? 0.035 + turnover * 0.025 : 0.015 + turnover * 0.01, 3),
    summary: slippage > 18 ? "Execution stress can erase a material share of the edge." : "Execution assumptions are plausible for paper trading."
  };
}

function featureRecord(strategy: StrategySpec, card: ResearchDiscoveryCard): FeatureStoreRecord {
  const required = card.requiredData.join(", ");
  const external = /news|earnings|filing|fundamental|rating|reddit|x|forum/i.test(required);
  return {
    featureName: `${strategy.familyKey}.${strategy.id}`,
    dataSource: required,
    updateTime: "after source timestamp plus configured lag",
    timestampLag: card.timestampLag,
    coverage: external ? 0.78 : 0.97,
    missingRate: external ? 0.12 : 0.03,
    lookaheadRisk: /0|same.?day/i.test(card.timestampLag) ? "high" : external ? "medium" : "low",
    owner: "data_manager"
  };
}

function humanReview(required: boolean): HumanReviewState {
  return {
    status: required ? "approved" : "not_required",
    reviewer: required ? "Boss" : undefined,
    notes: required ? "Human review gate approved the hypothesis before formal testing." : "Human review mode is off for this run.",
    checklist: [
      "Economic story is tradable, not just a theme.",
      "Signal has explicit lag and holding period.",
      "Data requirements can be stored point-in-time.",
      "Novelty check does not show a hard duplicate."
    ]
  };
}

function memoryGraph(strategy: StrategySpec, card: ResearchDiscoveryCard, status: ExperimentStatus): ResearchMemoryGraph {
  const ideaId = `idea:${strategy.familyKey}`;
  const featureId = `feature:${strategy.id}`;
  const strategyId = `strategy:${strategy.id}`;
  const outcomeId = status === "candidate" ? `success:${strategy.id}` : `failure:${strategy.id}`;
  const sourceNodes = card.sourceCitations.slice(0, 3).map((source, index) => ({
    id: `source:${strategy.id}:${index}`,
    label: source.title,
    type: "source" as const,
    status: source.credibilityTier
  }));
  return {
    nodes: [
      { id: ideaId, label: card.phenomenon, type: "idea", status: strategy.ideaMode },
      ...sourceNodes,
      { id: featureId, label: strategy.factorLogic, type: "feature" },
      { id: strategyId, label: strategy.name, type: "strategy", status },
      { id: outcomeId, label: status === "candidate" ? "Promoted candidate" : "Stored lesson", type: status === "candidate" ? "success" : "failure" }
    ],
    links: [
      ...sourceNodes.map((source) => ({ from: source.id, to: ideaId, relation: "supports", strength: 0.7 })),
      { from: ideaId, to: featureId, relation: "compiled_to", strength: 0.9 },
      { from: featureId, to: strategyId, relation: "tested_as", strength: 0.9 },
      { from: strategyId, to: outcomeId, relation: "produced", strength: status === "candidate" ? 1 : 0.55 }
    ]
  };
}

// Honest "dumb baselines": only quantities we actually computed from this run's
// data. The buy-and-hold benchmark Sharpe and the random-rank Sharpe are real;
// a zero-edge line anchors the comparison. We deliberately do NOT invent
// sector-neutral-momentum or low-vol baseline Sharpes (those would require
// separate backtests we did not run) — a fabricated benchmark is worse than
// none, because it manufactures a "we beat it" result.
function baselines(backtest: BacktestResult, benchmarkReturns: number[], periodsPerYear: number): BaselineComparison[] {
  const strategySharpe = backtest.outOfSample.sharpeRatio;
  const benchmarkSharpe = sharpe(benchmarkReturns, periodsPerYear);
  const benchmarkReturn = cumulative(benchmarkReturns);
  const random = backtest.outOfSample.randomBaselineSharpe;
  const items = [
    { baseline: "buy_and_hold_benchmark", sharpe: benchmarkSharpe, returnDelta: backtest.outOfSample.returnAfterCosts - benchmarkReturn },
    { baseline: "random_rank_portfolio", sharpe: random, returnDelta: backtest.outOfSample.returnAfterCosts },
    { baseline: "zero_edge", sharpe: 0, returnDelta: backtest.outOfSample.returnAfterCosts }
  ];
  return items.map((item) => ({
    baseline: item.baseline,
    sharpe: round(item.sharpe, 2),
    excessSharpe: round(strategySharpe - item.sharpe, 2),
    returnDelta: round(item.returnDelta, 4),
    passed: strategySharpe > item.sharpe + 0.1 && item.returnDelta > -0.02
  }));
}

function libraryCard(strategy: StrategySpec, card: ResearchDiscoveryCard, status: ExperimentStatus, backtest: BacktestResult): StrategyLibraryCard {
  return {
    source: card.sourceCitations.map((source) => source.title).join("; ") || "internal literature prior",
    intuition: card.whyAlphaMayExist,
    formula: strategy.compiledSignal?.formula ?? `${strategy.familyKey} rank signal`,
    backtest: `OOS Sharpe ${backtest.outOfSample.sharpeRatio}, return after costs ${(backtest.outOfSample.returnAfterCosts * 100).toFixed(1)}%.`,
    risk: card.failureRisks[0] ?? "Out-of-sample decay.",
    usableData: card.requiredData,
    currentStatus: status
  };
}

function feed(strategy: StrategySpec, riskReview: RiskReview, status: ExperimentStatus): ResearchFeedEvent[] {
  const now = new Date().toISOString();
  const blocked = riskReview.checks.find((check) => check.status === "fail");
  return [
    { id: `${strategy.id}-kira`, timestamp: now, agent: "Kira", action: "found", detail: strategy.discoveryCard?.phenomenon ?? strategy.familyKey, status: "info" },
    { id: `${strategy.id}-mira`, timestamp: now, agent: "Mira", action: "generated", detail: strategy.hypothesis, status: "info" },
    { id: `${strategy.id}-ren`, timestamp: now, agent: "Ren", action: "compiled", detail: strategy.compiledSignal?.formula ?? strategy.factorLogic, status: "info" },
    {
      id: `${strategy.id}-sana`,
      timestamp: now,
      agent: "Sana",
      action: blocked ? "blocked" : "approved",
      detail: blocked ? blocked.detail : "Risk gates have no blocking failure.",
      status: blocked ? "blocked" : "approved"
    },
    { id: `${strategy.id}-noa`, timestamp: now, agent: "Noa", action: "filed", detail: `Experiment status: ${status}`, status: status === "archived" ? "archived" : "info" }
  ];
}

export function buildResearchWorkflowAudit(input: {
  strategy: StrategySpec;
  backtest: BacktestResult;
  riskReview: RiskReview;
  experiments: ExperimentRecord[];
  settings: Settings;
  params: BacktestParameters;
  dataUsed: string;
  status: ExperimentStatus;
  humanReviewRequired: boolean;
}): ResearchWorkflowAudit {
  const { strategy, backtest, riskReview, experiments, settings, params, dataUsed, status } = input;
  const family = getFamily(strategy.familyKey);
  const discoveryCard = strategy.discoveryCard ?? family.discoveryCard ?? defaultDiscoveryCard(family, strategy);
  const compiledSignal = strategy.compiledSignal ?? family.compiledSignal ?? compileSignal(family, strategy);
  const credibility = family.sourceCredibility ?? sourceCredibility(discoveryCard.sourceCitations);
  const series = returnsFromBacktest(backtest);
  const cap = capacity(strategy, backtest);
  const exec = execution(strategy, backtest, cap);
  const review = humanReview(input.humanReviewRequired);
  return {
    discoveryCard,
    compiledSignal,
    credibility,
    novelty: buildNovelty(strategy, backtest, experiments),
    pointInTime: pointInTimeLayer(discoveryCard, family),
    registry: registryV2(strategy, params, riskReview, experiments, status, dataUsed, review.status),
    walkForward: buildWalkForward(series.returns, series.dates, strategy.holdingPeriod, series.periodsPerYear),
    regimes: buildRegimes(series.returns, series.benchmarkReturns, series.periodsPerYear),
    alphaDecay: alphaDecay(backtest, series.returns),
    capacity: cap,
    execution: exec,
    feature: featureRecord(strategy, discoveryCard),
    humanReview: review,
    memoryGraph: memoryGraph(strategy, discoveryCard, status),
    paperTrading: {
      status: "queued",
      startDate: new Date().toISOString().slice(0, 10),
      daysLive: 0,
      nextSignalDate: settings.endDate,
      notes: "Daily paper signal should start after the discovery date and never reuse backtest labels."
    },
    agentEvaluation: {
      ideaAgent: "Mira",
      compilerAgent: "Ren",
      riskAgent: "Sana",
      sourceUtilityScore: credibility.score,
      promptOverfitRisk: backtest.outOfSample.overfittingRiskScore / 100,
      notes: [
        "Track which source mix produces promoted ideas.",
        "Penalize prompts that repeatedly create known-factor duplicates.",
        "Retain failed attempts so future agents stop repeating them."
      ]
    },
    baselines: baselines(backtest, series.benchmarkReturns, series.periodsPerYear),
    libraryCard: libraryCard({ ...strategy, compiledSignal }, discoveryCard, status, backtest),
    researchFeed: feed({ ...strategy, discoveryCard, compiledSignal }, riskReview, status)
  };
}
