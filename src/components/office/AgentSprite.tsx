import { Bot, Coffee, FileSearch, MessageCircle, Terminal, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { CSSProperties } from "react";
import { resolveAgentSprite } from "../../lib/assets/agentAssetManifest";
import { AgentProfile, AgentRuntime } from "../../types";

function StateIcon({ state }: { state: AgentRuntime["state"] }): JSX.Element {
  if (state === "coding") return <Terminal size={12} />;
  if (state === "drinking_tea") return <Coffee size={12} />;
  if (state === "checking_chart") return <FileSearch size={12} />;
  if (state === "excited") return <Zap size={12} />;
  if (state === "debating" || state === "whispering") return <MessageCircle size={12} />;
  return <Bot size={12} />;
}

export function AgentSprite({
  agent,
  runtime,
  onClick,
  reducedMotion
}: {
  agent: AgentProfile;
  runtime: AgentRuntime;
  onClick: () => void;
  reducedMotion: boolean;
}): JSX.Element | null {
  if (!agent.visible) return null;
  const { manifest, src, spriteName } = resolveAgentSprite(agent.role, runtime.state);
  const hasCustomAvatar = Boolean(agent.avatarDataUrl);
  const style = {
    "--agent-color": agent.appearance.themeColor,
    "--hair-color": agent.appearance.hairColor,
    "--bubble-color": agent.appearance.bubbleColor,
    "--anchor-x": manifest?.anchor.x ?? 0.5,
    "--anchor-y": manifest?.anchor.y ?? 0.92,
    "--sprite-scale": manifest?.scale ?? 1
  } as CSSProperties;

  return (
    <motion.button
      className={`agent-sprite-button mini-agent state-${runtime.state}`}
      style={style}
      initial={false}
      animate={{ left: `${runtime.x}%`, top: `${runtime.y}%` }}
      transition={reducedMotion ? { duration: 0 } : { duration: 1.15, ease: [0.22, 0.88, 0.36, 1] }}
      onClick={onClick}
      data-sprite={spriteName}
      aria-label={`Open ${agent.name}`}
    >
      {runtime.message && <span className="agent-speech-pop">{runtime.message}</span>}
      <span className="agent-shadow" />
      <span className="agent-body-wrap art-agent-wrap">
        {src ? (
          <img className="agent-art-sprite" src={src} alt="" draggable={false} />
        ) : (
          <span className="asset-missing">Missing sprite</span>
        )}
        {hasCustomAvatar && (
          <span className="custom-identity-badge">
            <img src={agent.avatarDataUrl} alt="" />
          </span>
        )}
        <span className="agent-state-chip">
          <StateIcon state={runtime.state} />
        </span>
      </span>
      <span className="agent-name">{agent.name}</span>
    </motion.button>
  );
}
