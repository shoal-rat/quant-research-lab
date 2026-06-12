import { Bot, Coffee, FileSearch, MessageCircle, Terminal, Zap } from "lucide-react";
import { CSSProperties } from "react";
import { AgentProfile, AgentRuntime } from "../types";

function StateIcon({ state }: { state: AgentRuntime["state"] }): JSX.Element {
  if (state === "coding") return <Terminal size={12} />;
  if (state === "drinking_tea") return <Coffee size={12} />;
  if (state === "checking_chart") return <FileSearch size={12} />;
  if (state === "excited") return <Zap size={12} />;
  if (state === "debating" || state === "whispering") return <MessageCircle size={12} />;
  return <Bot size={12} />;
}

export function MiniAgent({
  agent,
  runtime,
  onClick
}: {
  agent: AgentProfile;
  runtime: AgentRuntime;
  onClick: () => void;
}): JSX.Element | null {
  if (!agent.visible) return null;
  const spriteSrc = agent.defaultAssetPath ?? agent.characterImageDataUrl;
  const hasCustomAvatar = Boolean(agent.avatarDataUrl);
  const style = {
    left: `${runtime.x}%`,
    top: `${runtime.y}%`,
    "--agent-color": agent.appearance.themeColor,
    "--hair-color": agent.appearance.hairColor,
    "--bubble-color": agent.appearance.bubbleColor
  } as CSSProperties;

  return (
    <button className={`mini-agent state-${runtime.state}`} style={style} onClick={onClick}>
      {runtime.message && <span className="agent-speech-pop">{runtime.message}</span>}
      <span className="agent-shadow" />
      <span className="agent-body-wrap art-agent-wrap">
        {spriteSrc ? (
          <img
            className="agent-art-sprite"
            src={spriteSrc}
            alt=""
            style={{
              transform: `translate(${agent.crop.x}px, ${agent.crop.y}px) scale(${agent.crop.scale})`
            }}
          />
        ) : (
          <span className="asset-missing">No art</span>
        )}
        {hasCustomAvatar && agent.defaultAssetPath && (
          <span className="custom-identity-badge">
            <img src={agent.avatarDataUrl} alt="" />
          </span>
        )}
        <span className="agent-state-chip">
          <StateIcon state={runtime.state} />
        </span>
      </span>
      <span className="agent-name">{agent.name}</span>
    </button>
  );
}
