import { useMemo, useState } from "react";
import { navigate } from "../App";
import { LeaderboardBarChart } from "../components/Charts";
import { MetricCard } from "../components/MetricCard";
import { StatusBadge } from "../components/StatusBadge";
import { number, percent, shortDate } from "../components/format";
import { useAppStore } from "../store/AppStore";
import { ExperimentRecord } from "../types";

type SortKey =
  | "sharpe"
  | "returnAfterCosts"
  | "maxDrawdown"
  | "robustness"
  | "passedRiskChecks"
  | "overfitting"
  | "lastUpdated";

function scoreConclusion(experiment: ExperimentRecord): string {
  if (experiment.outOfSampleResult.returnAfterCosts < 0) return "Good raw story, but costs erase the edge.";
  if (experiment.outOfSampleResult.overfittingRiskScore > 70) return "Promising curve with serious overfitting risk.";
  if (experiment.status === "candidate") return "Candidate signal with useful out-of-sample behavior.";
  if (experiment.riskReview.passedRiskChecks < 5) return "Too many risk checks failed for promotion.";
  return "Informative run, but not desk-leading yet.";
}

export function LeaderboardPage(): JSX.Element {
  const { experiments } = useAppStore();
  const [sortKey, setSortKey] = useState<SortKey>("sharpe");

  const sorted = useMemo(() => {
    const list = [...experiments];
    return list.sort((a, b) => {
      if (sortKey === "sharpe") return b.outOfSampleResult.sharpeRatio - a.outOfSampleResult.sharpeRatio;
      if (sortKey === "returnAfterCosts") return b.outOfSampleResult.returnAfterCosts - a.outOfSampleResult.returnAfterCosts;
      if (sortKey === "maxDrawdown") return b.outOfSampleResult.maxDrawdown - a.outOfSampleResult.maxDrawdown;
      if (sortKey === "robustness") return b.outOfSampleResult.robustnessScore - a.outOfSampleResult.robustnessScore;
      if (sortKey === "passedRiskChecks") return b.riskReview.passedRiskChecks - a.riskReview.passedRiskChecks;
      if (sortKey === "overfitting") return a.outOfSampleResult.overfittingRiskScore - b.outOfSampleResult.overfittingRiskScore;
      return new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime();
    });
  }, [experiments, sortKey]);

  return (
    <div className="leaderboard-page">
      <div className="page-heading">
        <div>
          <small>Strategy candidate pool</small>
          <h1>Leaderboard</h1>
          <p>Ranked by risk-adjusted, cost-aware, out-of-sample evidence.</p>
        </div>
        <label className="field compact-field">
          <span>Sort by</span>
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
            <option value="sharpe">Out-of-sample Sharpe</option>
            <option value="returnAfterCosts">Return after transaction costs</option>
            <option value="maxDrawdown">Maximum drawdown</option>
            <option value="robustness">Robustness score</option>
            <option value="passedRiskChecks">Passed risk checks</option>
            <option value="overfitting">Overfitting risk score</option>
            <option value="lastUpdated">Last updated time</option>
          </select>
        </label>
      </div>

      {sorted.length > 0 && <LeaderboardBarChart experiments={sorted} />}

      <div className="strategy-grid">
        {sorted.length === 0 ? (
          <article className="page-card">
            <h2>No strategies yet</h2>
            <p>Start the research loop from the Office page.</p>
          </article>
        ) : (
          sorted.map((experiment) => (
            <article key={experiment.id} className="strategy-card" onClick={() => navigate(`/experiment/${experiment.id}`)}>
              <div className="strategy-card-head">
                <div>
                  <small>{experiment.id}</small>
                  <h2>{experiment.strategyName}</h2>
                </div>
                <StatusBadge status={experiment.status} />
              </div>
              <p>{scoreConclusion(experiment)}</p>
              <div className="metric-grid four">
                <MetricCard label="Sharpe" value={number(experiment.outOfSampleResult.sharpeRatio)} />
                <MetricCard label="After Cost" value={percent(experiment.outOfSampleResult.returnAfterCosts)} />
                <MetricCard label="Drawdown" value={percent(experiment.outOfSampleResult.maxDrawdown)} />
                <MetricCard label="Risk" value={`${experiment.riskReview.passedRiskChecks}/${experiment.riskReview.checks.length}`} />
              </div>
              <small className="updated-line">Updated {shortDate(experiment.lastUpdatedAt)}</small>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
