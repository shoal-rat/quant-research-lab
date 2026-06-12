import { useMemo } from "react";
import { useAppStore } from "../../store/AppStore";
import { number, percent } from "../format";

export function InWorldWorkstation2D(): JSX.Element {
  const { loop, currentExperiment } = useAppStore();
  const lines = useMemo(() => {
    if (!currentExperiment) return ["def factor(data):", "  clean()", "  rank()", "  apply_costs()"];
    if (loop.phase === "coding") return currentExperiment.generatedCode.split("\n").filter(Boolean).slice(0, 6);
    if (currentExperiment.status === "failed_to_run") return ["BUG: run failed", "check columns", "patch loader", "retry"];
    if (loop.phase === "backtesting") return ["running backtest...", `universe ${currentExperiment.backtestParameters.universe.length}`, "equity curve -> rig"];
    if (loop.phase === "risk_review" || loop.phase === "debate") {
      return currentExperiment.riskReview.checks.slice(0, 4).map((check) => `${check.status}: ${check.label}`);
    }
    return [
      `sharpe ${number(currentExperiment.outOfSampleResult.sharpeRatio)}`,
      `costRet ${percent(currentExperiment.outOfSampleResult.returnAfterCosts)}`,
      `drawdown ${percent(currentExperiment.outOfSampleResult.maxDrawdown)}`,
      currentExperiment.status
    ];
  }, [currentExperiment, loop.phase]);

  return (
    <div className="display-2d workstation-2d">
      <div className="code-2d-lines">
        {lines.slice(0, 6).map((line, index) => (
          <code key={`${line}-${index}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {line}
          </code>
        ))}
      </div>
      <div className="terminal-2d-status">
        <strong>{loop.phase === "coding" ? "EDIT" : currentExperiment?.status ?? "IDLE"}</strong>
        <span />
      </div>
    </div>
  );
}

