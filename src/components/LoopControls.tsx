import { CirclePause, FastForward, Play, Zap } from "lucide-react";
import { useAppStore } from "../store/AppStore";

// Compact floating loop controls for the game HUD.
export function LoopControls(): JSX.Element {
  const { loop, startResearch, pauseResearch, nextIteration, toggleAutoRun } = useAppStore();

  return (
    <div className="loop-controls">
      <span className={`phase-pill ${loop.running ? "running" : ""}`}>
        {loop.phase.replaceAll("_", " ")}
      </span>
      {loop.running ? (
        <button className="secondary-button compact" onClick={pauseResearch} title="Pause">
          <CirclePause size={15} />
        </button>
      ) : (
        <button className="primary-button compact" onClick={startResearch} title="Start research">
          <Play size={15} />
        </button>
      )}
      <button className="secondary-button compact" onClick={nextIteration} title="Next step">
        <FastForward size={15} />
      </button>
      <button
        className={loop.autoRun ? "primary-button compact" : "secondary-button compact"}
        onClick={toggleAutoRun}
        title="Auto run"
      >
        <Zap size={15} />
      </button>
    </div>
  );
}
