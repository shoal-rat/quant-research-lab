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

  return (
    <button
      className={`agent-2d-sprite activity-${state.activity} facing-${state.facing} ${state.expression ? "has-expression" : ""}`}
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
