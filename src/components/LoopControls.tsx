import { CheckCircle2, CirclePause, Pencil, Play, XCircle } from "lucide-react";
import { useState } from "react";
import { phaseLabel } from "../i18n";
import { useAppStore } from "../store/AppStore";

// Compact HUD control for the ONE research+invest process (the strategy horse race,
// run by the bridge). The green play/pause is the single start: it begins the race
// (research -> validate -> paper-invest) and the office animation mirrors it. No
// second pipeline, so the LLM is never asked to research twice for the same aim.
export function LoopControls(): JSX.Element {
  const { loop, settings, cliStatus, raceState, startRace, stopRace, reviewDraft, approveReviewDraft, rejectReviewDraft, editReviewDraft } = useAppStore();
  const [editText, setEditText] = useState("");
  const lang = settings.language;
  const submitEdit = (): void => {
    const directive = editText.trim();
    if (!directive) return;
    editReviewDraft(directive);
    setEditText("");
  };
  const running = raceState.running;

  return (
    <div className="loop-controls">
      <span
        className={`cli-dot ${cliStatus.connected ? "ok" : cliStatus.checking ? "checking" : "off"}`}
        title={cliStatus.connected ? "Engine connected" : cliStatus.detail || "Engine offline"}
      />
      <span className={`phase-pill ${running ? "running" : ""}`} title={raceState.activity}>
        {running ? raceState.activity.slice(0, 28) || phaseLabel(lang, loop.phase) : phaseLabel(lang, loop.phase)}
      </span>
      {running ? (
        <button className="secondary-button compact" onClick={stopRace} title={lang === "zh" ? "停止" : "Stop"}>
          <CirclePause size={15} />
        </button>
      ) : (
        <button
          className="primary-button compact start-everything"
          onClick={startRace}
          title={lang === "zh" ? "一键开始：研究 + 赛马 + 模拟投资" : "Start: research + race + paper-invest"}
        >
          <Play size={15} />
        </button>
      )}
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
