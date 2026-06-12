import { useMemo } from "react";
import { useAppStore } from "../../store/AppStore";
import { LoopPhase } from "../../types";

function phaseTitle(phase: LoopPhase): string {
  if (phase === "coding") return "Coding Notes";
  if (phase === "backtesting") return "Backtest Watch";
  if (phase === "risk_review") return "Risk Review";
  if (phase === "decision" || phase === "saved") return "Decision Log";
  if (phase === "data_check") return "Data Checks";
  if (phase === "debate") return "Desk Debate";
  return "Hypothesis";
}

export function InWorldWhiteboard(): JSX.Element {
  const { loop, currentExperiment, memory } = useAppStore();
  const notes = useMemo(() => {
    if (!currentExperiment) {
      return ["define universe", "propose factor", "audit timestamps", "run OOS split"];
    }
    if (loop.phase === "coding") {
      return currentExperiment.generatedCode.split("\n").filter(Boolean).slice(0, 5);
    }
    if (loop.phase === "backtesting") {
      return [
        `hold ${currentExperiment.backtestParameters.holdingPeriod}d`,
        `cost ${currentExperiment.backtestParameters.transactionCostBps} bps`,
        `benchmark ${currentExperiment.backtestParameters.benchmark}`,
        "watch split drift"
      ];
    }
    if (loop.phase === "risk_review") {
      return currentExperiment.riskReview.checks
        .filter((check) => check.status !== "pass")
        .slice(0, 5)
        .map((check) => `${check.status.toUpperCase()}: ${check.label}`);
    }
    if (loop.phase === "decision" || loop.phase === "saved") {
      return [
        currentExperiment.managerDecision,
        currentExperiment.nextIterationSuggestion,
        `${currentExperiment.riskReview.passedRiskChecks}/${currentExperiment.riskReview.checks.length} checks passed`
      ];
    }
    if (loop.phase === "debate") {
      return currentExperiment.debate.slice(0, 4).map((line) => `${line.speaker}: ${line.message}`);
    }
    return [
      currentExperiment.factorLogic,
      currentExperiment.dataUsed,
      ...memory.slice(0, 3).map((item) => item.text)
    ].slice(0, 6);
  }, [currentExperiment, loop.phase, memory]);

  return (
    <div className={`inworld-whiteboard phase-${loop.phase}`}>
      <div className="whiteboard-title">{phaseTitle(loop.phase)}</div>
      <p>{currentExperiment?.strategyHypothesis ?? "Find a robust, cost-aware signal before promoting it."}</p>
      <ul>
        {notes.slice(0, 6).map((note, index) => (
          <li key={`${note}-${index}`}>{note}</li>
        ))}
      </ul>
      <svg className="whiteboard-sketch" viewBox="0 0 220 92" aria-hidden="true">
        <path d="M12 58 C45 24 72 78 104 42 S167 50 207 18" />
        <path d="M24 72 H75 L96 53 L119 66 L156 30" />
        <path d="M164 30 l-8 2 l5 7" />
        <circle cx="48" cy="58" r="7" />
        <circle cx="111" cy="42" r="7" />
        <circle cx="177" cy="28" r="7" />
      </svg>
    </div>
  );
}
