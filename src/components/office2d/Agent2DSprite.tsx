import { CSSProperties } from "react";
import { getGeneratedAgent2DManifest, resolveAgent2DSprite } from "../../lib/assets/agent2dAssetManifest";
import { Agent2DRenderState } from "../../lib/office2d/agentMovement";
import { office2DMapSize } from "../../lib/office2d/mapLayout";
import { AgentProfile } from "../../types";
import { SpeechBubble2D } from "./SpeechBubble2D";

interface Agent2DSpriteProps {
  agent: AgentProfile;
  state: Agent2DRenderState;
  reducedMotion: boolean;
  onClick: () => void;
}

// Positions come from the OfficeDirector ticks (~9Hz); a short linear CSS
// transition smooths the in-between frames into continuous walking.
export function Agent2DSprite({ agent, state, reducedMotion, onClick }: Agent2DSpriteProps): JSX.Element {
  const manifest = getGeneratedAgent2DManifest(agent.role);
  const sprite = resolveAgent2DSprite(agent.role, state.spriteName, state.facing, state.expression);
  const style = {
    left: `${(state.x / office2DMapSize.width) * 100}%`,
    top: `${(state.y / office2DMapSize.height) * 100}%`,
    zIndex: state.zIndex,
    transition: reducedMotion ? "none" : "left 0.13s linear, top 0.13s linear",
    "--agent-anchor-x": manifest?.anchor.x ?? 0.5,
    "--agent-anchor-y": manifest?.anchor.y ?? 0.9,
    "--agent-scale": manifest?.scale ?? 1
  } as CSSProperties;

  // Long lines get a bigger bubble; near stage edges the bubble shifts inward
  // or drops below the sprite so it is not clipped offscreen.
  const cjkCount = (state.message?.match(/[\u3400-\u9fff]/g) ?? []).length;
  const messageLength = (state.message?.length ?? 0) + cjkCount * 0.9;
  const bubbleSize = messageLength > 72 ? "bubble-xl" : messageLength > 34 ? "bubble-lg" : "";
  const vertical = state.y < office2DMapSize.height * 0.36 ? "bubble-below" : "";
  const edge =
    state.x < office2DMapSize.width * 0.16
      ? "bubble-edge-left"
      : state.x > office2DMapSize.width * 0.84
        ? "bubble-edge-right"
        : state.bubbleShift
          ? `bubble-push-${state.bubbleShift}`
          : "";

  return (
    <button
      className={`agent-2d-sprite activity-${state.activity} facing-${state.facing} ${state.expression ? "has-expression" : ""} ${bubbleSize} ${vertical} ${edge}`}
      style={style}
      onClick={onClick}
      aria-label={`Inspect ${agent.name}`}
      data-agent-id={agent.id}
      data-zone={state.targetZone}
    >
      {state.message && <SpeechBubble2D message={state.message} type={state.bubbleType} />}
      {sprite ? (
        <img src={sprite} alt="" draggable={false} />
      ) : (
        <span className="agent-2d-warning">{agent.name.slice(0, 2)}</span>
      )}
      <span className="agent-2d-name">{agent.name}</span>
    </button>
  );
}
