import { CSSProperties, useEffect, useRef, useState } from "react";
import { getGeneratedAgent2DManifest, resolveAgent2DSprite } from "../../lib/assets/agent2dAssetManifest";
import { Agent2DRenderState } from "../../lib/office2d/agentMovement";
import { office2DMapSize } from "../../lib/office2d/mapLayout";
import { AgentProfile, AgentRole } from "../../types";
import { SpeechBubble2D } from "./SpeechBubble2D";

interface Agent2DSpriteProps {
  agent: AgentProfile;
  state: Agent2DRenderState;
  reducedMotion: boolean;
  onClick: () => void;
}

// Perspective depth: sprites shrink toward the far wall and grow toward the
// camera, so walking "down" the office reads as walking closer.
const DEPTH_NEAR = 1.1;
const DEPTH_FAR = 0.86;
// Above this jump the sprite teleports (initial spawn, layout reset) instead of
// gliding across the whole office.
const SNAP_DISTANCE = 420;
const SMOOTHING_RATE = 9; // 1/s: exponential approach toward the logical position

function depthScaleAt(y: number): number {
  const t = Math.min(1, Math.max(0, y / office2DMapSize.height));
  return DEPTH_FAR + (DEPTH_NEAR - DEPTH_FAR) * t;
}

// Decode every sprite + expression for a role once, before first use, so pose
// swaps never flash an empty frame while the browser fetches the image.
const preloadedRoles = new Set<AgentRole>();

function preloadRoleArt(role: AgentRole): void {
  if (preloadedRoles.has(role)) return;
  preloadedRoles.add(role);
  const manifest = getGeneratedAgent2DManifest(role);
  if (!manifest) return;
  const sources = [...Object.values(manifest.sprites), ...Object.values(manifest.expressions)];
  for (const src of sources) {
    const image = new Image();
    image.decoding = "async";
    image.src = src;
  }
}

// The OfficeDirector still thinks in ~9Hz logical ticks; this render layer
// chases the logical position with a requestAnimationFrame exponential
// approach, so motion on screen is continuous instead of stepping tick to tick.
export function Agent2DSprite({ agent, state, reducedMotion, onClick }: Agent2DSpriteProps): JSX.Element {
  const elementRef = useRef<HTMLButtonElement>(null);
  const motionRef = useRef({
    x: state.x,
    y: state.y,
    targetX: state.x,
    targetY: state.y,
    reduced: reducedMotion,
    placed: false
  });
  motionRef.current.targetX = state.x;
  motionRef.current.targetY = state.y;
  motionRef.current.reduced = reducedMotion;

  useEffect(() => {
    preloadRoleArt(agent.role);
  }, [agent.role]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const motion = motionRef.current;
      const element = elementRef.current;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const dx = motion.targetX - motion.x;
      const dy = motion.targetY - motion.y;
      if (motion.reduced || !motion.placed || Math.hypot(dx, dy) > SNAP_DISTANCE) {
        motion.x = motion.targetX;
        motion.y = motion.targetY;
        motion.placed = true;
      } else {
        const alpha = 1 - Math.exp(-SMOOTHING_RATE * dt);
        motion.x += dx * alpha;
        motion.y += dy * alpha;
      }
      if (element) {
        element.style.left = `${(motion.x / office2DMapSize.width) * 100}%`;
        element.style.top = `${(motion.y / office2DMapSize.height) * 100}%`;
        element.style.zIndex = String(Math.round(motion.y));
        element.style.setProperty("--agent-depth", depthScaleAt(motion.y).toFixed(4));
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const manifest = getGeneratedAgent2DManifest(agent.role);
  const sprite = resolveAgent2DSprite(agent.role, state.spriteName, state.facing, state.expression);

  // Pose crossfade: keep the outgoing sprite mounted briefly, fading out above
  // the incoming one, so pose changes melt instead of popping.
  const [previousSprite, setPreviousSprite] = useState<string | null>(null);
  const lastSpriteRef = useRef<string | undefined>(sprite);
  useEffect(() => {
    if (!sprite || sprite === lastSpriteRef.current) return;
    const outgoing = lastSpriteRef.current ?? null;
    lastSpriteRef.current = sprite;
    if (reducedMotion || !outgoing) return;
    setPreviousSprite(outgoing);
    const timer = window.setTimeout(() => setPreviousSprite(null), 170);
    return () => window.clearTimeout(timer);
  }, [sprite, reducedMotion]);

  const style = {
    left: `${(state.x / office2DMapSize.width) * 100}%`,
    top: `${(state.y / office2DMapSize.height) * 100}%`,
    zIndex: state.zIndex,
    "--agent-anchor-x": manifest?.anchor.x ?? 0.5,
    "--agent-anchor-y": manifest?.anchor.y ?? 0.9,
    "--agent-scale": manifest?.scale ?? 1,
    "--agent-depth": depthScaleAt(state.y)
  } as CSSProperties;

  // Long lines get a bigger bubble; near stage edges the bubble shifts inward
  // or drops below the sprite so it is not clipped offscreen.
  const cjkCount = (state.message?.match(/[㐀-鿿]/g) ?? []).length;
  const messageLength = (state.message?.length ?? 0) + cjkCount * 0.9;
  const bubbleSize = messageLength > 88 ? "bubble-xl" : messageLength > 44 ? "bubble-lg" : "";
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
      ref={elementRef}
      className={`agent-2d-sprite activity-${state.activity} facing-${state.facing} ${state.expression ? "has-expression" : ""} ${bubbleSize} ${vertical} ${edge}`}
      style={style}
      onClick={onClick}
      aria-label={`Inspect ${agent.name}`}
      data-agent-id={agent.id}
      data-zone={state.targetZone}
    >
      {state.message && <SpeechBubble2D message={state.message} type={state.bubbleType} />}
      <span className="agent-2d-contact-shadow" aria-hidden="true" />
      {sprite ? (
        <span className="sprite-stack">
          <img src={sprite} alt="" draggable={false} />
          {previousSprite && previousSprite !== sprite && (
            <img className="sprite-prev" src={previousSprite} alt="" draggable={false} />
          )}
        </span>
      ) : (
        <span className="agent-2d-warning">{agent.name.slice(0, 2)}</span>
      )}
      <span className="agent-2d-name">{agent.name}</span>
    </button>
  );
}
