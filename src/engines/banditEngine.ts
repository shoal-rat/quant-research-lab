import { ExperimentRecord, IdeaMode, Language } from "../types";
import { seededRandom } from "./random";

// RD-Agent(Q)-style Thompson-sampling direction bandit. Each research
// direction keeps a Gaussian posterior over its reward (the pool-level
// ΔSharpe realized by experiments launched under that arm, with status
// bonuses). Posteriors are derived deterministically from the experiment
// history, so there is no extra state to persist.

export type BanditArm = Exclude<IdeaMode, "boss_directive">;

export interface ArmPosterior {
  arm: BanditArm;
  pulls: number;
  mean: number;
  sampled: number;
}

const ARMS: BanditArm[] = ["explore", "refine", "repair", "recombine", "mine"];

// optimistic priors so unexplored arms get tried early
const PRIOR_MEAN: Record<BanditArm, number> = {
  explore: 0.05,
  refine: 0.06,
  repair: 0.03,
  recombine: 0.04,
  // Formula mining has many more effective trials than a hand-authored mutation,
  // so give it a conservative prior until it earns evidence in this desk.
  mine: 0.02
};
const PRIOR_STRENGTH = 2;

export function rewardOf(experiment: ExperimentRecord): number {
  // pool ΔSharpe when available (real mode), otherwise a status-based proxy
  const base =
    experiment.poolSharpeDelta !== undefined
      ? experiment.poolSharpeDelta
      : experiment.status === "candidate"
        ? 0.1
        : experiment.status === "retest_needed"
          ? 0.02
          : experiment.status === "rejected"
            ? -0.04
            : -0.01;
  const statusBonus = experiment.status === "candidate" ? 0.05 : 0;
  return base + statusBonus;
}

export function armPosteriors(experiments: ExperimentRecord[]): ArmPosterior[] {
  return ARMS.map((arm) => {
    const rewards = experiments
      .filter((experiment) => experiment.ideaMode === arm)
      .map((experiment) => rewardOf(experiment));
    const pulls = rewards.length;
    const sum = rewards.reduce((total, value) => total + value, 0);
    const mean = (PRIOR_MEAN[arm] * PRIOR_STRENGTH + sum) / (PRIOR_STRENGTH + pulls);
    return { arm, pulls, mean, sampled: mean };
  });
}

export interface BanditDecision {
  arm: BanditArm;
  posteriors: ArmPosterior[];
  narration: { en: string; zh: string };
}

interface BanditOptions {
  hasRefinable: boolean;
  hasRepairable: boolean;
  hasRecombinable: boolean;
  // Omitted means unavailable, preserving the four-arm behavior for callers
  // that have not connected the formula miner yet.
  hasMine?: boolean;
  explorationBias: number;
  seed: string;
}

export function chooseDirection(experiments: ExperimentRecord[], options: BanditOptions): BanditDecision {
  const rng = seededRandom(`bandit-${options.seed}`);
  // Filter before sampling so an unavailable mine arm does not consume RNG draws
  // or alter the deterministic choices of existing four-arm callers.
  const selectableArms = options.hasMine ? ARMS : ARMS.filter((arm) => arm !== "mine");
  const posteriors = armPosteriors(experiments)
    .filter((posterior) => selectableArms.includes(posterior.arm))
    .map((posterior) => {
      // Thompson sample: N(mean, sd) with sd shrinking in pulls
      const sd = 0.12 / Math.sqrt(1 + posterior.pulls);
      const a = Math.max(rng(), 1e-6);
      const b = rng();
      const gaussian = Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
      let sampled = posterior.mean + sd * gaussian;
      if (posterior.arm === "explore") sampled += options.explorationBias * 0.02;
      return { ...posterior, sampled };
    });

  const eligible = posteriors.filter((posterior) => {
    if (posterior.arm === "refine") return options.hasRefinable;
    if (posterior.arm === "repair") return options.hasRepairable;
    if (posterior.arm === "recombine") return options.hasRecombinable;
    if (posterior.arm === "mine") return options.hasMine === true;
    return true;
  });
  eligible.sort((a, b) => b.sampled - a.sampled);
  const chosen = eligible[0]?.arm ?? "explore";

  const fmt = (value: number) => value.toFixed(3);
  const winner = eligible[0];
  const labels: Record<BanditArm, string> = { explore: "探索", refine: "精修", repair: "修复", recombine: "杂交", mine: "挖掘" };
  const narration = {
    en: `Direction bandit sampled ${posteriors.map((posterior) => {
      return `${posterior.arm} ${fmt(posterior.sampled)}`;
    }).join(", ")} → ${chosen} wins (${winner ? `${winner.pulls} pulls, mean reward ${fmt(winner.mean)}` : "prior"}).`,
    zh: `方向老虎机抽样：${posteriors.map((posterior) => {
      return `${labels[posterior.arm]} ${fmt(posterior.sampled)}`;
    }).join("，")} → ${labels[chosen]}胜出（${winner ? `${winner.pulls} 次拉杆，平均奖励 ${fmt(winner.mean)}` : "先验"}）。`
  };

  return { arm: chosen, posteriors, narration };
}

export function armLabel(arm: BanditArm | IdeaMode, language: Language): string {
  const labels: Record<string, { en: string; zh: string }> = {
    explore: { en: "explore a new family", zh: "探索新家族" },
    refine: { en: "refine the best lineage", zh: "精修最强血统" },
    repair: { en: "repair a recent failure", zh: "修复最近的失败" },
    recombine: { en: "recombine two winners", zh: "杂交两个赢家" },
    mine: { en: "mine a formulaic alpha", zh: "挖掘公式因子" },
    boss_directive: { en: "follow the boss directive", zh: "执行老板指令" }
  };
  return labels[arm]?.[language] ?? String(arm);
}
