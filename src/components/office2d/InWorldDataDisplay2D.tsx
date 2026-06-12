import { useAppStore } from "../../store/AppStore";

export function InWorldDataDisplay2D(): JSX.Element {
  const { currentExperiment, loop, settings } = useAppStore();
  const warnings =
    currentExperiment?.riskReview.checks.filter((check) => check.status !== "pass").length ??
    (loop.phase === "data_check" ? 1 : 0);
  const names = currentExperiment?.backtestParameters.universe.length ?? settings.stockUniverse.split(",").filter(Boolean).length;

  return (
    <div className={`display-2d data-display-2d ${warnings > 0 ? "warn" : "ready"}`}>
      <strong>{warnings > 0 ? "WARN" : "READY"}</strong>
      <span>{names} names</span>
      <span>{loop.phase === "data_check" ? "timestamp audit" : "coverage ok"}</span>
    </div>
  );
}

