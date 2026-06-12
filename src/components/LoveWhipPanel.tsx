import { useAppStore } from "../store/AppStore";

interface LoveWhipPanelProps {
  tool: "love" | "whip" | null;
  onPickTool: (tool: "love" | "whip" | null) => void;
}

// Boss management instruments. Pick one, then click a researcher: love
// praises (morale up, bolder exploration), the whip criticizes (morale down,
// the desk gets stricter).
export function LoveWhipPanel({ tool, onPickTool }: LoveWhipPanelProps): JSX.Element {
  const { mood, agents } = useAppStore();
  const totalPraises = Object.values(mood).reduce((sum, entry) => sum + entry.praises, 0);
  const totalScolds = Object.values(mood).reduce((sum, entry) => sum + entry.scolds, 0);
  const avgMorale =
    agents.length > 0
      ? Math.round(
          agents.reduce((sum, agent) => sum + (mood[agent.id]?.morale ?? 70), 0) / agents.length
        )
      : 70;

  return (
    <aside className={`love-whip-panel ${tool ? "armed" : ""}`} aria-label="Boss tools">
      <div className="love-whip-frame">
        <span className="love-whip-title">Love &amp; Whip</span>
        <button
          className={`love-whip-tool love ${tool === "love" ? "active" : ""}`}
          onClick={() => onPickTool(tool === "love" ? null : "love")}
          title="Praise a researcher (morale up, bolder ideas)"
        >
          <img src="/assets/generated/ui/love-whip/heart.png" alt="Love" draggable={false} />
          <span>LOVE</span>
        </button>
        <button
          className={`love-whip-tool whip ${tool === "whip" ? "active" : ""}`}
          onClick={() => onPickTool(tool === "whip" ? null : "whip")}
          title="Criticize a researcher (morale down, stricter desk)"
        >
          <img src="/assets/generated/ui/love-whip/whip.png" alt="Whip" draggable={false} />
          <span>WHIP</span>
        </button>
        <div className="love-whip-stats">
          <span title="Average desk morale">{avgMorale}% morale</span>
          <span>
            <img src="/assets/generated/ui/love-whip/heart-badge.png" alt="" /> {totalPraises}
          </span>
          <span>
            <img src="/assets/generated/ui/love-whip/whip-badge.png" alt="" /> {totalScolds}
          </span>
        </div>
        {tool && <p className="love-whip-hint">Click a researcher…</p>}
      </div>
    </aside>
  );
}
