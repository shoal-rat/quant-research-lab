import { CheckCircle2, CirclePause, FastForward, Loader, Pencil, Play, Telescope, XCircle, Zap } from "lucide-react";
import { useState } from "react";
import { phaseLabel, t } from "../i18n";
import { useAppStore } from "../store/AppStore";

// Compact floating loop controls for the game HUD.
export function LoopControls(): JSX.Element {
  const {
    loop,
    settings,
    startResearch,
    pauseResearch,
    nextIteration,
    toggleAutoRun,
    cliStatus,
    researching,
    researchStrategies,
    reviewDraft,
    approveReviewDraft,
    rejectReviewDraft,
    editReviewDraft
  } = useAppStore();
  const [editText, setEditText] = useState("");
  const lang = settings.language;
  const submitEdit = (): void => {
    const directive = editText.trim();
    if (!directive) return;
    editReviewDraft(directive);
    setEditText("");
  };

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
      <button
        className={`secondary-button compact ${researching ? "is-busy" : ""}`}
        onClick={() => researchStrategies()}
        disabled={researching}
        title={`${t(lang, "discover")} — ${t(lang, "discoverTip")}`}
      >
        {researching ? <Loader size={15} className="spin" /> : <Telescope size={15} />}
      </button>
      {reviewDraft && (
        <section className="review-draft hud-review-draft" aria-live="polite">
          <div className="review-draft-head">
            <div>
              <small>Human review</small>
              <strong>{reviewDraft.name}</strong>
            </div>
            <span>{reviewDraft.holdingPeriod}d</span>
          </div>
          <p>{reviewDraft.discoveryCard?.phenomenon ?? reviewDraft.hypothesis}</p>
          <dl className="mini-kv-list">
            <div>
              <dt>Feature</dt>
              <dd>{reviewDraft.compiledSignal?.feature ?? reviewDraft.factorLogic}</dd>
            </div>
            <div>
              <dt>Lag</dt>
              <dd>{reviewDraft.compiledSignal?.lag ?? "1 trading bar"}</dd>
            </div>
            <div>
              <dt>Hold</dt>
              <dd>{reviewDraft.compiledSignal?.hold ?? `${reviewDraft.holdingPeriod} trading bars`}</dd>
            </div>
          </dl>
          <textarea
            value={editText}
            placeholder="Edit note, e.g. require sector neutral version or longer lag"
            onChange={(event) => setEditText(event.target.value)}
          />
          <div className="control-row review-actions">
            <button className="primary-button" onClick={approveReviewDraft}>
              <CheckCircle2 size={15} /> Approve
            </button>
            <button className="secondary-button danger" onClick={rejectReviewDraft}>
              <XCircle size={15} /> Reject
            </button>
            <button className="secondary-button" onClick={submitEdit} disabled={!editText.trim()}>
              <Pencil size={15} /> Edit
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
