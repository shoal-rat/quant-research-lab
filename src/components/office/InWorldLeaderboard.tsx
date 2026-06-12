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
    .slice(0, 5);
}

export function InWorldLeaderboard(): JSX.Element {
  const { experiments, currentExperiment, loop } = useAppStore();
  const leaders = useMemo(() => rankExperiments(experiments), [experiments]);
  const staged = currentExperiment ? [currentExperiment] : [];
  const rows = leaders.length > 0 ? leaders : staged;

  return (
    <div className="inworld-panel inworld-leaderboard">
      <div className="inworld-panel-head">
        <span>LIVE STRATEGY RANK</span>
        <strong>{loop.phase.replaceAll("_", " ")}</strong>
      </div>
      <div className="leaderboard-grid header">
        <span>#</span>
        <span>Strategy</span>
        <span>Sharpe</span>
        <span>Cost Ret</span>
        <span>DD</span>
        <span>Robust</span>
      </div>
      {rows.length === 0 ? (
        <div className="leaderboard-empty">
          <strong>Awaiting first candidate</strong>
          <span>Run the loop to populate the wall screen.</span>
        </div>
      ) : (
        rows.map((experiment, index) => (
          <div
            className={`leaderboard-grid row ${
              currentExperiment?.id === experiment.id ? "active" : ""
            } status-${experiment.status}`}
            key={experiment.id}
          >
            <span>{index + 1}</span>
            <span title={experiment.strategyName}>{experiment.strategyName}</span>
            <span>{number(experiment.outOfSampleResult.sharpeRatio)}</span>
            <span>{percent(experiment.outOfSampleResult.returnAfterCosts)}</span>
            <span>{percent(experiment.outOfSampleResult.maxDrawdown)}</span>
            <span>{number(experiment.outOfSampleResult.robustnessScore, 0)}</span>
          </div>
        ))
      )}
    </div>
  );
}
