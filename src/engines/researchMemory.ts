import { ExperimentRecord, ResearchMemory } from "../types";
import { computeFamilyStats } from "./hypothesisEngine";
import { getFamily } from "./strategyKnowledge";

export function deriveResearchMemory(experiments: ExperimentRecord[]): ResearchMemory[] {
  const memories: ResearchMemory[] = [];
  const recent = experiments.slice(-30);

  const costFailures = recent.filter((exp) =>
    exp.riskReview.checks.some((check) => check.id === "transaction_costs" && check.status !== "pass")
  ).length;
  if (costFailures >= 2) {
    memories.push({
      id: "costs",
      text: `Transaction costs broke ${costFailures} of the last ${recent.length} runs; short-horizon signals need a turnover gate.`,
      weight: costFailures
    });
  }

  const overfit = recent.filter((exp) => exp.outOfSampleResult.deflatedSharpe !== undefined && exp.outOfSampleResult.deflatedSharpe < 0.5).length;
  if (overfit >= 2) {
    memories.push({
      id: "deflated",
      text: `${overfit} recent runs failed the deflated-Sharpe gate: the desk is data-mining; favor refinement over fresh trials.`,
      weight: overfit
    });
  }

  const stats = computeFamilyStats(recent);
  let bestFamily: { key: string; mean: number; attempts: number } | undefined;
  let worstFamily: { key: string; mean: number; attempts: number } | undefined;
  stats.forEach((stat) => {
    if (stat.attempts < 2) return;
    if (!bestFamily || stat.meanNetSharpe > bestFamily.mean) bestFamily = { key: stat.key, mean: stat.meanNetSharpe, attempts: stat.attempts };
    if (!worstFamily || stat.meanNetSharpe < worstFamily.mean) worstFamily = { key: stat.key, mean: stat.meanNetSharpe, attempts: stat.attempts };
  });
  if (bestFamily) {
    memories.push({
      id: "best-family",
      text: `${getFamily(bestFamily.key).name} is the strongest family so far: mean OOS Sharpe ${bestFamily.mean.toFixed(2)} over ${bestFamily.attempts} runs.`,
      weight: bestFamily.attempts
    });
  }
  if (worstFamily && worstFamily.mean < 0 && worstFamily.key !== bestFamily?.key) {
    memories.push({
      id: "worst-family",
      text: `${getFamily(worstFamily.key).name} keeps disappointing (mean OOS Sharpe ${worstFamily.mean.toFixed(2)}); deprioritize unless the construction changes.`,
      weight: worstFamily.attempts
    });
  }

  const candidates = recent.filter((exp) => exp.status === "candidate");
  if (candidates.length > 0) {
    const best = [...candidates].sort((a, b) => b.outOfSampleResult.robustnessScore - a.outOfSampleResult.robustnessScore)[0];
    memories.push({
      id: "best-candidate",
      text: `${best.strategyName} leads the pool: OOS Sharpe ${best.outOfSampleResult.sharpeRatio.toFixed(2)}, deflated-Sharpe probability ${(best.outOfSampleResult.deflatedSharpe * 100).toFixed(0)}%.`,
      weight: best.outOfSampleResult.robustnessScore
    });
    const refined = candidates.filter((exp) => exp.ideaMode === "refine").length;
    if (refined >= 2) {
      memories.push({
        id: "refinement-pays",
        text: "Refining promising lineages has produced more candidates than fresh exploration; keep mutation steps small.",
        weight: refined
      });
    }
  }

  const correlated = recent.filter((exp) => exp.outOfSampleResult.alphaPoolCorrelation > 0.7).length;
  if (correlated >= 2) {
    memories.push({
      id: "pool-correlation",
      text: "New signals keep duplicating the existing alpha pool; the next idea must come from an uncorrelated family.",
      weight: correlated
    });
  }

  if (memories.length === 0) {
    memories.push(
      {
        id: "baseline-costs",
        text: "The desk has not yet trusted any signal until costs and out-of-sample splits are checked.",
        weight: 1
      },
      {
        id: "baseline-timestamps",
        text: "Timestamp alignment is treated as a hard gate before backtest conclusions.",
        weight: 1
      }
    );
  }

  return memories.slice(0, 6);
}
