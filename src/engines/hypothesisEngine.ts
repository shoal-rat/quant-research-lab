import { ExperimentRecord, HoldingPeriod, PortfolioType, ProposalContext, StrategySpec } from "../types";
import { parseUniverse } from "./mockMarketData";
import { clamp, pick, seededRandom } from "./random";
import { getFamily, STRATEGY_FAMILIES, StrategyFamily } from "./strategyKnowledge";

export interface FamilyStats {
  key: string;
  attempts: number;
  candidates: number;
  meanNetSharpe: number;
  bestNetSharpe: number;
  bestExperiment?: ExperimentRecord;
  lastStatus?: ExperimentRecord["status"];
}

export interface DirectiveHints {
  familyKeys: string[];
  holdingPeriod?: HoldingPeriod;
  portfolioType?: PortfolioType;
  stricter: boolean;
  bolder: boolean;
  raw: string;
}

export function computeFamilyStats(experiments: ExperimentRecord[]): Map<string, FamilyStats> {
  const stats = new Map<string, FamilyStats>();
  experiments.forEach((experiment) => {
    const key = experiment.familyKey ?? "xs_momentum";
    const entry = stats.get(key) ?? {
      key,
      attempts: 0,
      candidates: 0,
      meanNetSharpe: 0,
      bestNetSharpe: -Infinity
    };
    const net = experiment.outOfSampleResult.sharpeRatio;
    entry.meanNetSharpe = (entry.meanNetSharpe * entry.attempts + net) / (entry.attempts + 1);
    entry.attempts += 1;
    if (experiment.status === "candidate") entry.candidates += 1;
    if (net > entry.bestNetSharpe) {
      entry.bestNetSharpe = net;
      entry.bestExperiment = experiment;
    }
    entry.lastStatus = experiment.status;
    stats.set(key, entry);
  });
  return stats;
}

const DIRECTIVE_FAMILY_KEYWORDS: Array<[RegExp, string]> = [
  [/momentum|动量|趋势追|winner/i, "xs_momentum"],
  [/revers|反转|超跌|bounce|rebound/i, "short_term_reversal"],
  [/earning|盈余|财报|drift|pead/i, "pead"],
  [/news|新闻|sentiment|情绪|舆情/i, "news_sentiment_momentum"],
  [/fade|拥挤|crowd|过热/i, "crowded_news_fade"],
  [/low.?vol|低波|defensive|防御|beta/i, "low_volatility"],
  [/quality|质量|profit|盈利/i, "quality"],
  [/season|季节|month|月末|calendar|日历/i, "seasonality"],
  [/pair|配对|spread|价差|statarb|套利/i, "pairs_statarb"],
  [/supply|供应链|spillover|lead.?lag|联动|peer/i, "lead_lag_spillover"],
  [/vol.?manag|波动率管理|target.?vol|risk.?parity/i, "vol_managed"],
  [/revision|评级|analyst|分析师/i, "earnings_revision"],
  [/trend|均线|moving average|ma\b/i, "trend_overlay"],
  [/52|高点|high anchor|breakout|突破/i, "fifty_two_week_high"]
];

export function parseBossDirective(text: string): DirectiveHints {
  const hints: DirectiveHints = { familyKeys: [], stricter: false, bolder: false, raw: text };
  DIRECTIVE_FAMILY_KEYWORDS.forEach(([pattern, key]) => {
    if (pattern.test(text) && !hints.familyKeys.includes(key)) hints.familyKeys.push(key);
  });
  const holdingMatch = text.match(/(\d+)\s*(day|天|日)/i);
  if (holdingMatch) {
    const days = Number(holdingMatch[1]);
    const valid: HoldingPeriod[] = [1, 3, 5, 20];
    hints.holdingPeriod = valid.reduce((best, current) =>
      Math.abs(current - days) < Math.abs(best - days) ? current : best
    );
  }
  if (/long.?only|只做多|不要做空|no short/i.test(text)) hints.portfolioType = "long_only";
  if (/long.?short|多空|对冲|hedge/i.test(text)) hints.portfolioType = "long_short";
  if (/strict|严格|保守|careful|risk|风控|稳/i.test(text)) hints.stricter = true;
  if (/bold|大胆|激进|aggressive|创新|new idea|换个思路/i.test(text)) hints.bolder = true;
  return hints;
}

function mutateParameters(
  family: StrategyFamily,
  base: Record<string, number | string | boolean> | undefined,
  rng: () => number,
  wide: boolean
): Record<string, number | string | boolean> {
  const parameters: Record<string, number | string | boolean> = {};
  family.parameters.forEach((parameter) => {
    const previous = typeof base?.[parameter.name] === "number" ? (base?.[parameter.name] as number) : parameter.default;
    const span = parameter.max - parameter.min;
    const drift = wide ? (rng() - 0.5) * span * 0.8 : (rng() - 0.5) * span * 0.25;
    const steps = Math.round(clamp(previous + drift, parameter.min, parameter.max) / parameter.step);
    parameters[parameter.name] = Number((steps * parameter.step).toFixed(4));
  });
  return parameters;
}

function ucbScore(family: StrategyFamily, stats: FamilyStats | undefined, totalRuns: number, rng: () => number): number {
  const attempts = stats?.attempts ?? 0;
  const mean = stats ? stats.meanNetSharpe : (family.netSharpe[0] + family.netSharpe[1]) / 2;
  const exploration = Math.sqrt(Math.log(totalRuns + 2) / (attempts + 1)) * 0.55;
  const priorPull = attempts === 0 ? 0.15 : 0;
  return mean + exploration + priorPull + rng() * 0.05;
}

function describeNewsThought(family: StrategyFamily, rng: () => number): string {
  const observations = family.newsDriven
    ? [
        "Recent mock headlines cluster around earnings tone shifts, which this signal is built to exploit.",
        "News flow in the universe has been timestamp-clean this week, so the event window is usable.",
        "Sentiment dispersion across the universe widened, which usually feeds this family."
      ]
    : [
        "Price action, not headlines, drives this one, so the news desk only needs to verify timestamps.",
        "The factor reads market structure directly; news is just a contamination check here.",
        "Cross-sectional spreads widened recently, which is when this family historically pays."
      ];
  return pick(observations, rng);
}

export function proposeStrategy(context: ProposalContext): StrategySpec {
  const { settings, memory, iteration, experiments, bossDirective, explorationBias } = context;
  const rng = seededRandom(`${settings.researchTaskName}-${iteration}-${experiments.length}-${bossDirective ?? ""}`);
  const stats = computeFamilyStats(experiments);
  const hints = bossDirective ? parseBossDirective(bossDirective) : undefined;
  const reasoning: string[] = [];

  // 1. pick mode: refine the best living lineage, or explore via UCB over families
  const refinable = experiments
    .filter(
      (experiment) =>
        (experiment.status === "candidate" || experiment.status === "retest_needed") &&
        (experiment.generation ?? 0) < 4 &&
        experiment.outOfSampleResult.sharpeRatio > 0.3
    )
    .sort((a, b) => b.outOfSampleResult.sharpeRatio - a.outOfSampleResult.sharpeRatio);

  const refineProbability = clamp(0.5 - explorationBias * 0.15 + (hints?.bolder ? -0.25 : 0), 0.1, 0.8);
  let mode: StrategySpec["ideaMode"] = "explore";
  let family: StrategyFamily;
  let parent: ExperimentRecord | undefined;

  if (hints && hints.familyKeys.length > 0) {
    mode = "boss_directive";
    family = getFamily(pick(hints.familyKeys, rng));
    reasoning.push(`Boss directive steered the desk toward ${family.name}: "${hints.raw}".`);
  } else if (refinable.length > 0 && rng() < refineProbability) {
    mode = "refine";
    parent = refinable[0];
    family = getFamily(parent.familyKey);
    reasoning.push(
      `Refining lineage ${parent.id} (gen ${parent.generation ?? 0}, OOS Sharpe ${parent.outOfSampleResult.sharpeRatio.toFixed(2)}): mutate parameters instead of starting over.`
    );
    if (parent.nextIterationSuggestion) {
      reasoning.push(`Carrying forward the desk note: ${parent.nextIterationSuggestion}`);
    }
  } else {
    const totalRuns = experiments.length;
    family = STRATEGY_FAMILIES.map((candidate) => ({
      candidate,
      score: ucbScore(candidate, stats.get(candidate.key), totalRuns, rng)
    })).sort((a, b) => b.score - a.score)[0].candidate;
    const familyStat = stats.get(family.key);
    reasoning.push(
      familyStat
        ? `Explore policy picked ${family.name}: ${familyStat.attempts} attempts so far, mean OOS Sharpe ${familyStat.meanNetSharpe.toFixed(2)}, still under-sampled relative to its prior.`
        : `Explore policy picked ${family.name}: untested here, literature prior net Sharpe ${family.netSharpe[0].toFixed(1)}-${family.netSharpe[1].toFixed(1)}.`
    );
  }

  // 2. economic reasoning trace (hypothesis-card style: claim, objective, risk)
  reasoning.push(`Economic story (${family.rationaleKind.replace("_", " ")}): ${family.rationale}`);
  reasoning.push(
    `Objective: net OOS Sharpe above ${Math.max(0.3, family.netSharpe[0]).toFixed(1)} with drawdown inside 18% and a deflated-Sharpe probability over 50%; failure still tells us whether the ${family.rationaleKind.replace("_", " ")} story holds here.`
  );
  reasoning.push(describeNewsThought(family, rng));
  const lesson = memory.find((item) => item.text.length > 0);
  if (lesson) reasoning.push(`Memory check: ${lesson.text}`);
  reasoning.push(`Known failure mode to watch: ${pick(family.failureModes, rng)}`);

  // 3. parameters + horizon
  const wide = mode !== "refine";
  const parameters = mutateParameters(family, parent?.strategyParameters, rng, wide);
  const holdingPeriod =
    hints?.holdingPeriod ??
    (parent ? parent.backtestParameters.holdingPeriod : pick(family.holdingPeriods, rng));
  const portfolioType: PortfolioType =
    hints?.portfolioType ??
    (family.key === "low_volatility" || family.key === "quality" || family.key === "trend_overlay" || rng() > 0.6
      ? "long_only"
      : "long_short");

  const generation = parent ? (parent.generation ?? 0) + 1 : 0;
  const flavor =
    mode === "refine"
      ? `v${generation + 1}`
      : pick(["Alpha", "Probe", "Patient", "Strict-Cost", "Sector-Neutral", "Fresh"], rng);

  return {
    id: `strategy-${iteration}-${Math.floor(rng() * 100000)}`,
    name: `${family.name} ${flavor}`,
    hypothesis: family.rationale,
    factorLogic: family.construction,
    factorKind: family.factorKind,
    familyKey: family.key,
    holdingPeriod,
    portfolioType,
    universe: parseUniverse(settings.stockUniverse),
    parameters,
    parentExperimentId: parent?.id,
    generation,
    ideaMode: mode,
    ideaReasoning: reasoning,
    bossDirective: hints?.raw
  };
}
