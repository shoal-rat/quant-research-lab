import { useEffect, useRef, useState } from "react";
import { Agent2DExpression, getGeneratedAgent2DManifest } from "../../lib/assets/agent2dAssetManifest";
import { useAppStore } from "../../store/AppStore";
import { AgentProfile } from "../../types";

// Anime cut-in: on a big desk moment (promotion confetti, boss love/whip) the
// relevant researcher's expression art slides across a diagonal color band with
// speed lines for ~1.6s. Pure CSS animation; throttled; skipped entirely under
// reduced motion.

const CUT_IN_THROTTLE_MS = 8000;
const CUT_IN_DURATION_MS = 1650;

interface CutIn {
  id: string;
  image: string;
  name: string;
  caption: string;
  flavor: "promote" | "love" | "whip";
}

interface CutInSource {
  effects: Array<{ id: string; kind: "love" | "whip" | "confetti"; agentId: string }>;
}

function pickAgent(agents: AgentProfile[], agentId: string): AgentProfile | undefined {
  if (agentId) return agents.find((agent) => agent.id === agentId);
  return agents.find((agent) => agent.role === "experiment_manager") ?? agents[0];
}

export function CutInOverlay(): JSX.Element | null {
  const { agents, director, settings } = useAppStore();
  const [cutIn, setCutIn] = useState<CutIn | null>(null);
  const seenRef = useRef(new Set<string>());
  const lastShownRef = useRef(0);
  const language = settings.language;

  useEffect(() => {
    return director.subscribe(() => {
      const snapshot = director.getSnapshot() as CutInSource;
      const now = Date.now();
      for (const effect of snapshot.effects) {
        if (seenRef.current.has(effect.id)) continue;
        seenRef.current.add(effect.id);
        if (seenRef.current.size > 200) {
          seenRef.current = new Set([...seenRef.current].slice(-80));
        }
        if (settings.reducedAnimation) continue;
        if (now - lastShownRef.current < CUT_IN_THROTTLE_MS) continue;
        const profile = pickAgent(agents, effect.kind === "confetti" ? "" : effect.agentId);
        if (!profile) continue;
        const manifest = getGeneratedAgent2DManifest(profile.role);
        if (!manifest) continue;
        const expression: Agent2DExpression =
          effect.kind === "confetti" ? "delighted" : effect.kind === "love" ? "delighted" : "shocked";
        const image = manifest.expressions[expression];
        if (!image) continue;
        const caption =
          effect.kind === "confetti"
            ? language === "zh"
              ? "晋级候选！"
              : "PROMOTED!"
            : effect.kind === "love"
              ? language === "zh"
                ? "老板点赞！"
                : "BOSS LOVE!"
              : language === "zh"
                ? "老板训话！"
                : "BOSS WHIP!";
        lastShownRef.current = now;
        setCutIn({ id: effect.id, image, name: profile.name, caption, flavor: effect.kind === "confetti" ? "promote" : effect.kind });
        window.setTimeout(() => {
          setCutIn((current) => (current?.id === effect.id ? null : current));
        }, CUT_IN_DURATION_MS);
        break;
      }
    });
  }, [agents, director, language, settings.reducedAnimation]);

  if (!cutIn) return null;
  return (
    <div className={`cut-in cut-in-${cutIn.flavor}`} aria-hidden="true">
      <div className="cut-in-band" />
      <div className="cut-in-lines" />
      <img className="cut-in-portrait" src={cutIn.image} alt="" draggable={false} />
      <div className="cut-in-caption">
        <strong>{cutIn.caption}</strong>
        <span>{cutIn.name}</span>
      </div>
    </div>
  );
}
