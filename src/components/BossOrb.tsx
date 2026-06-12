import { Crown, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { readStored, writeStored } from "../store/persistence";
import { t } from "../i18n";
import { useAppStore } from "../store/AppStore";

interface BossOrbProps {
  tool: "love" | "whip" | null;
  onPickTool: (tool: "love" | "whip" | null) => void;
}

interface OrbPosition {
  x: number;
  y: number;
}

const ORB_STORAGE = "qrl.bossOrb";
const ORB_SIZE = 56;

function clampPosition(position: OrbPosition): OrbPosition {
  return {
    x: Math.min(Math.max(position.x, 8), window.innerWidth - ORB_SIZE - 8),
    y: Math.min(Math.max(position.y, 8), window.innerHeight - ORB_SIZE - 8)
  };
}

// Desktop-wallpaper boss key: a draggable floating ball. Tap it to unfold
// Love, Whip, and the directive input right on the wallpaper.
export function BossOrb({ tool, onPickTool }: BossOrbProps): JSX.Element {
  const { sendBossDirective, settings } = useAppStore();
  const lang = settings.language;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [position, setPosition] = useState<OrbPosition>(() =>
    clampPosition(readStored(ORB_STORAGE, { x: window.innerWidth - 88, y: window.innerHeight - 150 }))
  );
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number; moved: boolean } | null>(null);

  useEffect(() => {
    const onResize = () => setPosition((prev) => clampPosition(prev));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // some wallpaper hosts dispatch synthetic pointer events without capture support
    }
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - position.x,
      offsetY: event.clientY - position.y,
      moved: false
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = clampPosition({ x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY });
    if (!drag.moved && Math.hypot(next.x - position.x, next.y - position.y) < 5) return;
    drag.moved = true;
    setPosition(next);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) {
      writeStored(ORB_STORAGE, position);
    } else {
      setOpen((prev) => !prev);
    }
  };

  const submit = () => {
    if (!text.trim()) return;
    sendBossDirective(text);
    setText("");
    setOpen(false);
  };

  const arm = (next: "love" | "whip") => {
    onPickTool(tool === next ? null : next);
    setOpen(false);
  };

  const menuAbove = position.y > window.innerHeight / 2;
  const menuLeft = position.x > window.innerWidth / 2;

  return (
    <div className="boss-orb-root" style={{ left: position.x, top: position.y }}>
      <button
        className={`boss-orb ${open ? "open" : ""} ${tool ? `armed-${tool}` : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        aria-label="Boss menu"
        title="Boss menu (drag to move)"
      >
        {tool === "love" ? (
          <img src="/assets/generated/ui/love-whip/heart-badge.png" alt="" draggable={false} />
        ) : tool === "whip" ? (
          <img src="/assets/generated/ui/love-whip/whip-badge.png" alt="" draggable={false} />
        ) : (
          <Crown size={22} />
        )}
      </button>

      {open && (
        <div className={`boss-orb-menu ${menuAbove ? "above" : "below"} ${menuLeft ? "left" : "right"}`}>
          <div className="boss-orb-tools">
            <button className={`boss-orb-tool ${tool === "love" ? "active" : ""}`} onClick={() => arm("love")} title="Praise a researcher">
              <img src="/assets/generated/ui/love-whip/heart.png" alt="Love" draggable={false} />
              <span>{t(lang, "love")}</span>
            </button>
            <button className={`boss-orb-tool ${tool === "whip" ? "active" : ""}`} onClick={() => arm("whip")} title="Criticize a researcher">
              <img src="/assets/generated/ui/love-whip/whip.png" alt="Whip" draggable={false} />
              <span>{t(lang, "whip")}</span>
            </button>
          </div>
          <div className="boss-orb-input">
            <input
              value={text}
              placeholder={t(lang, "bossDirective")}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
                if (event.key === "Escape") setOpen(false);
              }}
              aria-label="Boss directive"
            />
            <button className="primary-button compact" onClick={submit} aria-label="Send directive">
              <Send size={14} />
            </button>
          </div>
        </div>
      )}

      {tool && !open && <span className="boss-orb-hint">{t(lang, "clickResearcher")}</span>}
    </div>
  );
}
