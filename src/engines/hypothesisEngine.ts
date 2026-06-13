import { ExperimentRecord, HoldingPeriod, PortfolioType, ProposalContext, StrategySpec } from "../types";
import { chooseDirection } from "./banditEngine";
import { parseUniverse } from "./mockMarketData";
import { buildArchive, eliteScore } from "./poolAnalytics";
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
  [/low.?vol|低波|defensive|防御|\bbeta\b/i, "low_volatility"],
  [/quality|质量|profit|盈利/i, "quality"],
  [/season|季节|month|月末|calendar|日历/i, "seasonality"],
  [/pair|配对|spread|价差|statarb|套利/i, "pairs_statarb"],
  [/supply|供应链|spillover|lead.?lag|联动|peer/i, "lead_lag_spillover"],
  [/vol.?manag|波动率管理|target.?vol|risk.?parity/i, "vol_managed"],
  [/revision|评级|analyst|分析师/i, "earnings_revision"],
  [/trend|均线|moving average|(?<![a-z])ma\b/i, "trend_overlay"],
  [/\b52\b|高点|high anchor|breakout|突破/i, "fifty_two_week_high"]
];

// price-only stand-ins for news/fundamental families when running on real data
const REAL_MODE_FALLBACK: Record<string, string> = {
  pead: "xs_momentum",
  news_sentiment_momentum: "xs_momentum",
  crowded_news_fade: "short_term_reversal",
  earnings_revision: "xs_momentum"
};

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
  wide: boolean,
  onlyParameter?: string
): Record<string, number | string | boolean> {
  const parameters: Record<string, number | string | boolean> = {};
  family.parameters.forEach((parameter) => {
    const previous = typeof base?.[parameter.name] === "number" ? (base?.[parameter.name] as number) : parameter.default;
    const frozen = onlyParameter !== undefined && parameter.name !== onlyParameter;
    const span = parameter.max - parameter.min;
    const drift = frozen ? 0 : wide ? (rng() - 0.5) * span * 0.8 : (rng() - 0.5) * span * 0.25;
    // snap to a min-anchored grid and re-clamp so off-grid bounds never leak
    const clamped = clamp(previous + drift, parameter.min, parameter.max);
    const snapped = parameter.min + Math.round((clamped - parameter.min) / parameter.step) * parameter.step;
    parameters[parameter.name] = Number(clamp(snapped, parameter.min, parameter.max).toFixed(4));
  });
  return parameters;
}

function ucbScore(
  family: StrategyFamily,
  stats: FamilyStats | undefined,
  totalRuns: number,
  rng: () => number,
  nicheBonus: number
): number {
  const attempts = stats?.attempts ?? 0;
  const mean = stats ? stats.meanNetSharpe : (family.netSharpe[0] + family.netSharpe[1]) / 2;
  const exploration = Math.sqrt(Math.log(totalRuns + 2) / (attempts + 1)) * 0.55;
  const priorPull = attempts === 0 ? 0.15 : 0;
  return mean + exploration + priorPull + nicheBonus + rng() * 0.05;
}

function describeNewsThought(family: StrategyFamily, rng: () => number, realData: boolean): string {
  if (realData) {
    return pick(
      [
        "Running on 20 years of real daily closes; the signal must survive actual 2008, 2020, and 2022 regimes.",
        "Real-data mode: no synthetic edges to lean on - whatever the ranks earn is what we report.",
        "The dataset is real adjusted closes, so survivorship of the bundled universe is the main caveat to log."
      ],
      rng
    );
  }
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
  // A provider that exposes a computable-family list (any price dataset) keeps
  // the desk to price-derived signals; mock data (null) allows news families.
  const realData = Array.isArray(context.computableFamilies);
  const rng = seededRandom(`${settings.researchTaskName}-${iteration}-${experiments.length}-${bossDirective ?? ""}`);
  const eligibleFamilies = realData ? STRATEGY_FAMILIES.filter((family) => family.priceComputable) : STRATEGY_FAMILIES;
  const stats = computeFamilyStats(experiments);
  const hints = bossDirective ? parseBossDirective(bossDirective) : undefined;
  const reasoning: string[] = [];

  // candidate sets for the bandit's arms
  const refinable = experiments
    .filter(
      (experiment) =>
        (experiment.status === "candidate" || experiment.status === "retest_needed") &&
        (experiment.generation ?? 0) < 4 &&
        experiment.outOfSampleResult.sharpeRatio > 0.3 &&
        (!realData || getFamily(experiment.familyKey).priceComputable)
    )
    .sort((a, b) => b.outOfSampleResult.sharpeRatio - a.outOfSampleResult.sharpeRatio);

  const repairable = experiments
    .slice(-10)
    .filter(
      (experiment) =>
        (experiment.status === "rejected" || experiment.status === "retest_needed") &&
        (experiment.generation ?? 0) < 5 &&
        (!realData || getFamily(experiment.familyKey).priceComputable)
    )
    .reverse();

  const pool = experiments.filter(
    (experiment) => experiment.status === "candidate" && (!realData || getFamily(experiment.familyKey).priceComputable)
  );
  const recombinable = pool.length >= 2;

  let mode: StrategySpec["ideaMode"];
  let family: StrategyFamily;
  let parent: ExperimentRecord | undefined;
  let onlyParameter: string | undefined;
  let blendBase: Record<string, number | string | boolean> | undefined;

  if (hints && hints.familyKeys.length > 0) {
    mode = "boss_directive";
    let chosenKey = pick(hints.familyKeys, rng);
    if (realData && !getFamily(chosenKey).priceComputable) {
      const fallback = REAL_MODE_FALLBACK[chosenKey] ?? "xs_momentum";
      reasoning.push(
        `Boss asked for ${getFamily(chosenKey).name}, but real-data mode has no news feed - swapping to its price cousin ${getFamily(fallback).name}.`
      );
      chosenKey = fallback;
    }
    family = getFamily(chosenKey);
    reasoning.push(`Boss directive steered the desk toward ${family.name}: "${hints.raw}".`);
  } else {
    // Thompson-sampling direction bandit (RD-Agent(Q))
    const decision = chooseDirection(experiments, {
      hasRefinable: refinable.length > 0,
      hasRepairable: repairable.length > 0,
      hasRecombinable: recombinable,
      explorationBias,
      seed: `${iteration}-${experiments.length}`
    });
    mode = decision.arm;
    reasoning.push(decision.narration.en);

    if (mode === "refine") {
      parent = refinable[0];
      family = getFamily(parent.familyKey);
      reasoning.push(
        `Refining lineage ${parent.id} (gen ${parent.generation ?? 0}, OOS Sharpe ${parent.outOfSampleResult.sharpeRatio.toFixed(2)}): small mutations around a working recipe.`
      );
      if (parent.nextIterationSuggestion) {
        reasoning.push(`Carrying forward the desk note: ${parent.nextIterationSuggestion}`);
      }
    } else if (mode === "repair") {
      parent = repairable[0];
      family = getFamily(parent.familyKey);
      const worst = parent.riskReview.checks.find((check) => check.status === "fail") ??
        parent.riskReview.checks.find((check) => check.status === "warn");
      // targeted mutation (QuantaAlpha): blame ONE node and change only that
      if (worst?.id === "turnover" || worst?.id === "transaction_costs") {
        onlyParameter = family.parameters.find((parameter) => /turnover|rebalance|hold/i.test(parameter.name))?.name;
      }
      onlyParameter = onlyParameter ?? family.parameters[Math.floor(rng() * family.parameters.length)].name;
      reasoning.push(
        `Repairing ${parent.id}: the blocking gate was "${worst?.label ?? "out-of-sample decay"}". Changing only ${onlyParameter} and rerunning - one blamed node, one fix.`
      );
    } else if (mode === "recombine") {
      const ranked = [...pool].sort((a, b) => eliteScore(b) - eliteScore(a));
      const parentA = ranked[0];
      const parentB = ranked[1];
      parent = parentA;
      family = getFamily(parentA.familyKey);
      // crossover: average shared numeric parameters of both winners
      blendBase = { ...parentA.strategyParameters };
      for (const [key, value] of Object.entries(parentB.strategyParameters ?? {})) {
        const current = blendBase[key];
        if (typeof current === "number" && typeof value === "number") {
          blendBase[key] = (current + value) / 2;
        }
      }
      reasoning.push(
        `Recombining the pool's two best alphas: ${parentA.strategyName} × ${parentB.strategyName}. Shared parameters averaged, ${family.name} chassis retained.`
      );
    } else {
      // explore, with a MAP-Elites niche bonus for families without an elite yet
      const archive = buildArchive(experiments);
      const familiesWithElites = new Set(
        [...archive.values()].filter((niche) => niche.best).map((niche) => niche.familyKey)
      );
      const totalRuns = experiments.length;
      family = eligibleFamilies
        .map((candidate) => ({
          candidate,
          score: ucbScore(
            candidate,
            stats.get(candidate.key),
            totalRuns,
            rng,
            familiesWithElites.has(candidate.key) ? 0 : 0.12
          )
        }))
        .sort((a, b) => b.score - a.score)[0].candidate;
      const familyStat = stats.get(family.key);
      reasoning.push(
        familyStat
          ? `Explore policy picked ${family.name}: ${familyStat.attempts} attempts so far, mean OOS Sharpe ${familyStat.meanNetSharpe.toFixed(2)}, and its archive niche is still open.`
          : `Explore policy picked ${family.name}: untested here, literature prior net Sharpe ${family.netSharpe[0].toFixed(1)}-${family.netSharpe[1].toFixed(1)}.`
      );
    }
  }

  // economic reasoning trace (hypothesis-card style: claim, objective, risk)
  reasoning.push(`Economic story (${family.rationaleKind.replace("_", " ")}): ${family.rationale}`);
  reasoning.push(
    `Objective: net OOS Sharpe above ${Math.max(0.3, family.netSharpe[0]).toFixed(1)} with drawdown inside 18% and a deflated-Sharpe probability over 50%; failure still tells us whether the ${family.rationaleKind.replace("_", " ")} story holds here.`
  );
  reasoning.push(describeNewsThought(family, rng, realData));
  const lesson = memory.find((item) => item.text.length > 0);
  if (lesson) reasoning.push(`Memory check: ${lesson.text}`);
  reasoning.push(`Known failure mode to watch: ${pick(family.failureModes, rng)}`);

  const wide = mode === "explore" || mode === "boss_directive";
  const parameters = mutateParameters(family, blendBase ?? parent?.strategyParameters, rng, wide, onlyParameter);
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
      : mode === "repair"
        ? `Repair-${onlyParameter ?? "x"}`
        : mode === "recombine"
          ? "Hybrid"
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
