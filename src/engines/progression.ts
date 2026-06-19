import { AgentMood, BossEvent, ExperimentRecord, Language, Settings } from "../types";
import { poolSharpe } from "./poolAnalytics";

// Boss progression: XP, levels with titles, and achievements - all derived
// deterministically from the run history so there is nothing to desync.

export interface BossLevel {
  level: number;
  xp: number;
  nextXp: number | null;
  title: { en: string; zh: string };
}

const LEVELS: Array<{ xp: number; en: string; zh: string }> = [
  { xp: 0, en: "Intern Boss", zh: "实习老板" },
  { xp: 120, en: "Junior PM", zh: "初级基金经理" },
  { xp: 320, en: "Desk Lead", zh: "交易台主管" },
  { xp: 650, en: "Portfolio Manager", zh: "投资组合经理" },
  { xp: 1100, en: "Head of Research", zh: "研究总监" },
  { xp: 1700, en: "Partner", zh: "合伙人" },
  { xp: 2500, en: "CIO", zh: "首席投资官" },
  { xp: 3600, en: "Fund Legend", zh: "基金传奇" },
  { xp: 5000, en: "Alpha Whisperer", zh: "Alpha 低语者" },
  { xp: 7000, en: "量化教父", zh: "量化教父" }
];

export interface ProgressionInput {
  experiments: ExperimentRecord[];
  bossEvents: BossEvent[];
  mood: Record<string, AgentMood>;
}

export function computeXp(input: ProgressionInput): number {
  const { experiments, bossEvents, mood } = input;
  // synthetic / not-backtestable runs are illustrative only — they must not farm XP
  const scored = experiments.filter((experiment) => !experiment.synthetic && experiment.status !== "not_backtestable");
  const candidates = scored.filter((experiment) => experiment.status === "candidate").length;
  const retests = scored.filter((experiment) => experiment.status === "retest_needed").length;
  const familiesTried = new Set(scored.map((experiment) => experiment.familyKey)).size;
  const directives = bossEvents.filter((event) => event.kind === "directive").length;
  const interactions = Object.values(mood).reduce((sum, entry) => sum + entry.praises + entry.scolds, 0);
  const realRuns = scored.filter((experiment) => experiment.dataSource === "real").length;
  return (
    scored.length * 8 +
    candidates * 60 +
    retests * 15 +
    familiesTried * 12 +
    directives * 10 +
    interactions * 4 +
    realRuns * 4
  );
}

export function computeLevel(xp: number): BossLevel {
  let index = 0;
  for (let i = 0; i < LEVELS.length; i += 1) {
    if (xp >= LEVELS[i].xp) index = i;
  }
  return {
    level: index + 1,
    xp,
    nextXp: index + 1 < LEVELS.length ? LEVELS[index + 1].xp : null,
    title: { en: LEVELS[index].en, zh: LEVELS[index].zh }
  };
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export interface AchievementDef {
  id: string;
  icon: string;
  name: { en: string; zh: string };
  detail: { en: string; zh: string };
  earned: (input: ProgressionInput & { settings: Settings }) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first-experiment",
    icon: "🧪",
    name: { en: "First Light", zh: "第一缕曙光" },
    detail: { en: "Run your first experiment", zh: "跑完第一个实验" },
    earned: ({ experiments }) => experiments.length >= 1
  },
  {
    id: "first-candidate",
    icon: "🏆",
    name: { en: "Signal in the Noise", zh: "噪音中的信号" },
    detail: { en: "Promote your first candidate strategy", zh: "晋升第一个候选策略" },
    earned: ({ experiments }) => experiments.some((experiment) => experiment.status === "candidate")
  },
  {
    id: "graveyard-keeper",
    icon: "🪦",
    name: { en: "Graveyard Keeper", zh: "墓园管理员" },
    detail: { en: "Collect 10 rejected strategies", zh: "收集 10 个被拒策略" },
    earned: ({ experiments }) => experiments.filter((experiment) => experiment.status === "rejected").length >= 10
  },
  {
    id: "pool-party",
    icon: "🏊",
    name: { en: "Pool Party", zh: "Alpha 池派对" },
    detail: { en: "Hold 5 candidates at once", zh: "同时持有 5 个候选策略" },
    earned: ({ experiments }) => experiments.filter((experiment) => experiment.status === "candidate").length >= 5
  },
  {
    id: "deflation-survivor",
    icon: "🛡️",
    name: { en: "Deflation Survivor", zh: "贬损幸存者" },
    detail: { en: "A candidate with deflated-Sharpe survival above 80%", zh: "候选策略贬损后存活率超过 80%" },
    earned: ({ experiments }) =>
      experiments.some((experiment) => experiment.status === "candidate" && experiment.outOfSampleResult.deflatedSharpe > 0.8)
  },
  {
    id: "whip-master",
    icon: "🪢",
    name: { en: "Tough Love", zh: "严厉的爱" },
    detail: { en: "Use the whip 10 times", zh: "挥鞭 10 次" },
    earned: ({ mood }) => Object.values(mood).reduce((sum, entry) => sum + entry.scolds, 0) >= 10
  },
  {
    id: "beloved-boss",
    icon: "❤️",
    name: { en: "Beloved Boss", zh: "人见人爱的老板" },
    detail: { en: "Give praise 10 times", zh: "送出 10 次表扬" },
    earned: ({ mood }) => Object.values(mood).reduce((sum, entry) => sum + entry.praises, 0) >= 10
  },
  {
    id: "marathon",
    icon: "🏃",
    name: { en: "Research Marathon", zh: "研究马拉松" },
    detail: { en: "Run 50 experiments", zh: "跑完 50 个实验" },
    earned: ({ experiments }) => experiments.filter((experiment) => !experiment.synthetic).length >= 50
  },
  {
    id: "factor-tourist",
    icon: "🗺️",
    name: { en: "Factor Zoo Tourist", zh: "因子动物园游客" },
    detail: { en: "Try 8 different strategy families", zh: "尝试 8 个不同的策略家族" },
    earned: ({ experiments }) =>
      new Set(experiments.filter((experiment) => !experiment.synthetic).map((experiment) => experiment.familyKey)).size >= 8
  },
  {
    id: "commander",
    icon: "👑",
    name: { en: "Commander in Chief", zh: "发号施令" },
    detail: { en: "Issue 5 boss directives", zh: "下达 5 道老板指令" },
    earned: ({ bossEvents }) => bossEvents.filter((event) => event.kind === "directive").length >= 5
  },
  {
    id: "hybrid-parent",
    icon: "🧬",
    name: { en: "Genetic Engineer", zh: "基因工程师" },
    detail: { en: "A recombined strategy reaches candidate", zh: "杂交策略晋升候选" },
    earned: ({ experiments }) =>
      experiments.some((experiment) => experiment.ideaMode === "recombine" && experiment.status === "candidate")
  },
  {
    id: "mechanic",
    icon: "🔧",
    name: { en: "The Mechanic", zh: "修理工" },
    detail: { en: "A repaired strategy reaches candidate", zh: "修复后的策略晋升候选" },
    earned: ({ experiments }) =>
      experiments.some((experiment) => experiment.ideaMode === "repair" && experiment.status === "candidate")
  },
  {
    id: "real-deal",
    icon: "📈",
    name: { en: "The Real Deal", zh: "动真格的" },
    detail: { en: "Promote a candidate on 20 years of real market data", zh: "在 20 年真实数据上晋升候选策略" },
    earned: ({ experiments }) =>
      experiments.some((experiment) => experiment.status === "candidate" && experiment.dataSource === "real")
  },
  {
    id: "fund-one",
    icon: "💰",
    name: { en: "Fund Sharpe > 1", zh: "基金 Sharpe 破 1" },
    detail: { en: "The candidate pool's combined Sharpe exceeds 1.0", zh: "候选池组合 Sharpe 超过 1.0" },
    earned: ({ experiments }) =>
      poolSharpe(experiments.filter((experiment) => experiment.status === "candidate")) > 1
  },
  {
    id: "polyglot",
    icon: "🌏",
    name: { en: "Polyglot Desk", zh: "双语交易台" },
    detail: { en: "Run the office in Chinese", zh: "用中文经营办公室" },
    earned: ({ settings }) => settings.language === "zh"
  },
  {
    id: "dynasty",
    icon: "🏯",
    name: { en: "Dynasty", zh: "王朝" },
    detail: { en: "A lineage reaches generation 3", zh: "一条血统传到第 3 代" },
    earned: ({ experiments }) => experiments.some((experiment) => (experiment.generation ?? 0) >= 3)
  }
];

export function fundNav(experiments: ExperimentRecord[]): number {
  const candidates = experiments.filter((experiment) => experiment.status === "candidate");
  const sharpe = poolSharpe(candidates);
  // toy NAV: $1M seed scaled by pool quality and size
  const base = 1_000_000;
  return Math.round(base * (1 + Math.max(-0.5, sharpe) * 0.35 + candidates.length * 0.08));
}
