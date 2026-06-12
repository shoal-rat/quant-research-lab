import { CirclePause, FastForward, Play, RotateCcw, Zap } from "lucide-react";
import { useAppStore } from "../store/AppStore";
import { MetricCard } from "./MetricCard";
import { StatusBadge } from "./StatusBadge";
import { number, percent } from "./format";

export function LoopPanel(): JSX.Element {
  const { loop, startResearch, pauseResearch, nextIteration, toggleAutoRun, currentExperiment, memory, settings } =
    useAppStore();

  return (
    <aside className="loop-panel">
      <div className="panel-header">
        <div>
          <small>Research loop</small>
          <h2>{loop.phase.replaceAll("_", " ")}</h2>
        </div>
        <span className={`phase-pill ${loop.running ? "running" : ""}`}>{loop.running ? "running" : "paused"}</span>
      </div>
      <p className="status-message">{loop.statusMessage}</p>
      <div className="control-row">
        <button className="primary-button" onClick={startResearch}>
          <Play size={16} /> Start
        </button>
        <button className="secondary-button" onClick={pauseResearch}>
          <CirclePause size={16} /> Pause
        </button>
        <button className="secondary-button" onClick={nextIteration}>
          <FastForward size={16} /> Next
        </button>
        <button className={loop.autoRun ? "primary-button compact" : "secondary-button compact"} onClick={toggleAutoRun}>
          <Zap size={16} /> Auto
        </button>
      </div>

      <div className="phase-rail">
        {["proposing", "data_check", "coding", "backtesting", "risk_review", "debate", "decision", "saved"].map((phase) => (
          <span key={phase} className={loop.phase === phase ? "active" : ""} title={phase} />
        ))}
      </div>

      {currentExperiment ? (
        <>
          <div className="current-experiment-mini">
            <div>
              <small>{currentExperiment.id}</small>
              <strong>{currentExperiment.strategyName}</strong>
            </div>
            <StatusBadge status={currentExperiment.status} />
          </div>
          <div className="metric-grid two">
            <MetricCard label="OOS Sharpe" value={number(currentExperiment.outOfSampleResult.sharpeRatio)} />
            <MetricCard label="After Costs" value={percent(currentExperiment.outOfSampleResult.returnAfterCosts)} />
            <MetricCard label="Max Drawdown" value={percent(currentExperiment.outOfSampleResult.maxDrawdown)} />
            <MetricCard label="Passed Checks" value={`${currentExperiment.riskReview.passedRiskChecks}/${currentExperiment.riskReview.checks.length}`} />
          </div>
        </>
      ) : (
        <div className="empty-panel">
          <strong>No experiment yet</strong>
          <span>Start the loop to create the first strategy record.</span>
        </div>
      )}

      <section className="memory-panel">
        <h3>Research Memory</h3>
        {memory.map((item) => (
          <p key={item.id}>{item.text}</p>
        ))}
      </section>

      <div className="disclaimer">
        Historical simulations only. No brokerage connection. Not investment advice. Mock LLM:{" "}
        {settings.mockLLMEnabled ? "enabled" : "bridge mode"}.
      </div>
    </aside>
  );
}
