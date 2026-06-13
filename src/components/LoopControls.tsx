import { CirclePause, FastForward, Play, Zap } from "lucide-react";
import { phaseLabel, t } from "../i18n";
import { useAppStore } from "../store/AppStore";

// Compact floating loop controls for the game HUD.
export function LoopControls(): JSX.Element {
  const { loop, settings, startResearch, pauseResearch, nextIteration, toggleAutoRun, cliStatus } = useAppStore();
  const lang = settings.language;

  return (
    <div className="loop-controls">
      <span
        className={`cli-dot ${cliStatus.connected ? "ok" : cliStatus.checking ? "checking" : "off"}`}
        title={cliStatus.connected ? t(lang, "cliConnected") : cliStatus.detail || t(lang, "cliOffline")}
      />
      <span className={`phase-pill ${loop.running ? "running" : ""}`}>
        {phaseLabel(lang, loop.phase)}
      </span>
      {loop.running ? (
        <button className="secondary-button compact" onClick={pauseResearch} title={t(lang, "pause")}>
          <CirclePause size={15} />
        </button>
      ) : (
        <button className="primary-button compact" onClick={startResearch} title={t(lang, "start")}>
          <Play size={15} />
        </button>
      )}
      <button className="secondary-button compact" onClick={nextIteration} title={t(lang, "nextStep")}>
        <FastForward size={15} />
      </button>
      <button
        className={loop.autoRun ? "primary-button compact" : "secondary-button compact"}
        onClick={toggleAutoRun}
        title={t(lang, "autoRun")}
      >
        <Zap size={15} />
      </button>
    </div>
  );
}
