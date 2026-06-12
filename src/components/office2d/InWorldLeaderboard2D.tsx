import { useMemo } from "react";
import { useAppStore } from "../../store/AppStore";
import { ExperimentRecord } from "../../types";
import { number, percent } from "../format";

function rankExperiments(experiments: ExperimentRecord[]): ExperimentRecord[] {
  return [...experiments]
    .sort((a, b) => {
      const scoreA =
        a.outOfSampleResult.sharpeRatio * 35 +
        a.outOfSampleResult.returnAfterCosts * 100 +
        a.outOfSampleResult.robustnessScore -
        a.outOfSampleResult.overfittingRiskScore * 0.35;
      const scoreB =
        b.outOfSampleResult.sharpeRatio * 35 +
        b.outOfSampleResult.returnAfterCosts * 100 +
        b.outOfSampleResult.robustnessScore -
        b.outOfSampleResult.overfittingRiskScore * 0.35;
      return scoreB - scoreA;
    })
    .slice(0, 4);
}

export function InWorldLeaderboard2D(): JSX.Element {
  const { experiments, currentExperiment, loop } = useAppStore();
  const leaders = useMemo(() => rankExperiments(experiments), [experiments]);
  const rows = leaders.length > 0 ? leaders : currentExperiment ? [currentExperiment] : [];

  return (
    <div className="display-2d leaderboard-2d">
      <div className="display-2d-head">
        <span>LIVE RANK</span>
        <strong>{loop.phase.replaceAll("_", " ")}</strong>
      </div>
      <div className="leaderboard-2d-row header">
        <span>#</span>
        <span>Name</span>
        <span>Sh</span>
        <span>Ret</span>
        <span>DD</span>
        <span>R</span>
      </div>
      {rows.length === 0 ? (
        <div className="display-2d-empty">Awaiting first candidate</div>
      ) : (
        rows.map((experiment, index) => (
          <div
            key={experiment.id}
            className={`leaderboard-2d-row ${currentExperiment?.id === experiment.id ? "active" : ""} status-${experiment.status}`}
          >
            <span>{index + 1}</span>
            <span title={experiment.strategyName}>{experiment.strategyName}</span>
            <span>{number(experiment.outOfSampleResult.sharpeRatio)}</span>
            <span>{percent(experiment.outOfSampleResult.returnAfterCosts, 0)}</span>
            <span>{percent(experiment.outOfSampleResult.maxDrawdown, 0)}</span>
            <span>{number(experiment.outOfSampleResult.robustnessScore, 0)}</span>
          </div>
        ))
      )}
    </div>
  );
}

