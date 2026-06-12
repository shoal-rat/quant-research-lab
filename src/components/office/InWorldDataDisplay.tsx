import { useAppStore } from "../../store/AppStore";

export function InWorldDataDisplay(): JSX.Element {
  const { currentExperiment, loop, settings } = useAppStore();
  const warnings =
    currentExperiment?.riskReview.checks.filter((check) => check.status !== "pass").length ??
    (loop.phase === "data_check" ? 1 : 0);

  return (
    <div className={`inworld-data-display ${warnings > 0 ? "warn" : "ready"}`}>
      <strong>{warnings > 0 ? "DATA WARN" : "DATA READY"}</strong>
      <span>{currentExperiment?.backtestParameters.universe.length ?? settings.stockUniverse.split(",").length} names</span>
      <span>{currentExperiment?.dataRange ?? `${settings.startDate} - ${settings.endDate}`}</span>
    </div>
  );
}
