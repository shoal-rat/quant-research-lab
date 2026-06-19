import { ExperimentStatus, RiskCheckStatus } from "../types";

const statusLabels: Record<ExperimentStatus, string> = {
  candidate: "Candidate",
  rejected: "Rejected",
  retest_needed: "Retest",
  failed_to_run: "Failed",
  archived: "Archived",
  not_backtestable: "Illustrative"
};

export function StatusBadge({ status }: { status: ExperimentStatus | RiskCheckStatus }): JSX.Element {
  const label = status in statusLabels ? statusLabels[status as ExperimentStatus] : status;
  return <span className={`status-badge status-${status}`}>{label}</span>;
}
