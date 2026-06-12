import { useMemo } from "react";
import { useAppStore } from "../../store/AppStore";
import { LoopPhase } from "../../types";

function titleForPhase(phase: LoopPhase): string {
  if (phase === "coding") return "Coding Notes";
  if (phase === "backtesting") return "Backtest Flow";
  if (phase === "risk_review") return "Risk Marks";
  if (phase === "debate") return "Desk Debate";
  if (phase === "decision" || phase === "saved") return "Decision";
  if (phase === "data_check") return "Data Check";
  return "Hypothesis";
}

export function InWorldWhiteboard2D(): JSX.Element {
  const { loop, currentExperiment, memory } = useAppStore();
  const notes = useMemo(() => {
    if (!currentExperiment) return ["Universe -> clean sample", "Build factor", "Cost audit", "OOS split"];
    if (loop.phase === "coding") return currentExperiment.generatedCode.split("\n").filter(Boolean).slice(0, 5);
    if (loop.phase === "backtesting") {
      return [
        `hold ${currentExperiment.backtestParameters.holdingPeriod}d`,
        `cost ${currentExperiment.backtestParameters.transactionCostBps} bps`,
        "walk-forward OOS",
        "watch drawdown"
      ];
    }
    if (loop.phase === "risk_review") {
      return currentExperiment.riskReview.checks
        .filter((check) => check.status !== "pass")
        .slice(0, 5)
        .map((check) => `${check.status.toUpperCase()}: ${check.label}`);
    }
    if (loop.phase === "debate") return currentExperiment.debate.slice(0, 4).map((line) => `${line.speaker}: ${line.message}`);
    if (loop.phase === "decision" || loop.phase === "saved") {
      return [
        currentExperiment.managerDecision,
        currentExperiment.nextIterationSuggestion,
        `${currentExperiment.riskReview.passedRiskChecks}/${currentExperiment.riskReview.checks.length} risk checks`
      ];
    }
    return [currentExperiment.factorLogic, currentExperiment.dataUsed, ...memory.slice(0, 3).map((item) => item.text)].slice(0, 5);
  }, [currentExperiment, loop.phase, memory]);

  const hypothesis = currentExperiment?.strategyHypothesis ?? "Find a cost-aware signal that survives risk review.";
  const rejected = currentExperiment?.status === "rejected" || currentExperiment?.status === "failed_to_run";

  return (
    <div className={`display-2d whiteboard-2d phase-${loop.phase} ${rejected ? "rejected" : ""}`}>
      <strong>{titleForPhase(loop.phase)}</strong>
      <p>{hypothesis}</p>
      <ul>
        {notes.slice(0, 5).map((note, index) => (
          <li key={`${note}-${index}`}>{note}</li>
        ))}
      </ul>
      <svg className="whiteboard-2d-sketch" viewBox="0 0 160 70" aria-hidden="true">
        <path d="M8 50 C34 22 54 62 78 34 S118 42 151 12" />
        <path d="M18 58 H52 L70 42 L91 53 L122 26" />
        <path d="M125 26 l-7 2 l5 6" />
        {rejected && <path className="reject-mark" d="M18 10 L142 62 M142 10 L18 62" />}
      </svg>
    </div>
  );
}

