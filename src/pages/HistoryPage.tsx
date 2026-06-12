import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { navigate } from "../App";
import { StatusBadge } from "../components/StatusBadge";
import { number, percent, shortDate } from "../components/format";
import { useAppStore } from "../store/AppStore";
import { ExperimentStatus } from "../types";

export function HistoryPage(): JSX.Element {
  const { experiments, clearExperiments } = useAppStore();
  const [filter, setFilter] = useState<ExperimentStatus | "all">("all");
  const filtered = useMemo(
    () => (filter === "all" ? experiments : experiments.filter((experiment) => experiment.status === filter)),
    [experiments, filter]
  );

  return (
    <div className="history-page">
      <div className="page-heading">
        <div>
          <small>Experiment memory</small>
          <h1>History</h1>
          <p>Every run is preserved with hypothesis, metrics, risk review, debate, and final decision.</p>
        </div>
        <div className="heading-actions">
          <label className="field compact-field">
            <span>Status</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value as ExperimentStatus | "all")}>
              <option value="all">All</option>
              <option value="candidate">Candidate</option>
              <option value="retest_needed">Retest needed</option>
              <option value="rejected">Rejected</option>
              <option value="failed_to_run">Failed to run</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <button className="secondary-button danger" onClick={clearExperiments}>
            <Trash2 size={15} /> Clear
          </button>
        </div>
      </div>

      <div className="history-list">
        {filtered.length === 0 ? (
          <article className="page-card">
            <h2>No experiments in this view</h2>
            <p>Use Start Research or Auto Run in the office.</p>
          </article>
        ) : (
          filtered
            .slice()
            .reverse()
            .map((experiment) => (
              <button
                key={experiment.id}
                className="history-row"
                onClick={() => navigate(`/experiment/${experiment.id}`)}
              >
                <div>
                  <small>{shortDate(experiment.createdAt)} · {experiment.id}</small>
                  <strong>{experiment.strategyName}</strong>
                  <span>{experiment.managerDecision}</span>
                </div>
                <div className="history-metrics">
                  <span>Sharpe {number(experiment.outOfSampleResult.sharpeRatio)}</span>
                  <span>After costs {percent(experiment.outOfSampleResult.returnAfterCosts)}</span>
                </div>
                <StatusBadge status={experiment.status} />
              </button>
            ))
        )}
      </div>
    </div>
  );
}
