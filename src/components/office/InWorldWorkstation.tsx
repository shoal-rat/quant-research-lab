import { useMemo } from "react";
import { useAppStore } from "../../store/AppStore";
import { number, percent } from "../format";

export function InWorldWorkstation(): JSX.Element {
  const { loop, currentExperiment } = useAppStore();
  const lines = useMemo(() => {
    if (!currentExperiment) {
      return ["def build_factor(data):", "  clean timestamps", "  rank universe", "  apply cost model"];
    }
    if (loop.phase === "coding") {
      return currentExperiment.generatedCode.split("\n").filter(Boolean).slice(0, 7);
    }
    if (loop.phase === "backtesting") {
      return [
        "running walk-forward split...",
        `universe: ${currentExperiment.backtestParameters.universe.join(", ")}`,
        `period: ${currentExperiment.dataRange}`,
        "writing equity curve"
      ];
    }
    if (loop.phase === "risk_review" || loop.phase === "debate") {
      return currentExperiment.riskReview.checks.slice(0, 5).map((check) => `${check.status}: ${check.label}`);
    }
    return [
      `sharpe = ${number(currentExperiment.outOfSampleResult.sharpeRatio)}`,
      `after_cost = ${percent(currentExperiment.outOfSampleResult.returnAfterCosts)}`,
      `drawdown = ${percent(currentExperiment.outOfSampleResult.maxDrawdown)}`,
      currentExperiment.status
    ];
  }, [currentExperiment, loop.phase]);

  return (
    <div className="inworld-monitor-cluster workstation-display">
      <div className="monitor-pane code-pane">
        <div className="monitor-toolbar">
          <span />
          <span />
          <span />
        </div>
        <pre>
          {lines.map((line, index) => (
            <code key={`${line}-${index}`}>
              <em>{String(index + 1).padStart(2, "0")}</em>
              {line}
            </code>
          ))}
        </pre>
      </div>
      <div className="monitor-pane status-pane">
        <strong>{loop.phase.replaceAll("_", " ")}</strong>
        <span>{currentExperiment?.strategyName ?? "No active strategy"}</span>
        <div className="terminal-pulse" />
      </div>
    </div>
  );
}
