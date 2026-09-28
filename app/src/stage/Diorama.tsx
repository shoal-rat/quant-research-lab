import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { CAST, ORDER, art } from "../lib/cast";
import { t } from "../lib/i18n";
import { sfx } from "../lib/sfx";
import { useStore } from "../lib/store";
import type { CharId } from "../lib/types";
import { EmoteIcon, Hammer, Hand } from "./Emotes";
import { setSpriteSizes, useWorldUI, world } from "./world";
import "./diorama.css";

/** US-market clock -> lighting of the club room. */
function useDaylight() {
  const [mood, setMood] = useState("day");
  useEffect(() => {
    const f = () => {
      const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" }).format(new Date()));
      setMood(h >= 6 && h < 9 ? "dawn" : h >= 9 && h < 16 ? "day" : h >= 16 && h < 19 ? "sunset" : "night");
    };
    f();
    const id = window.setInterval(f, 60000);
    return () => window.clearInterval(id);
  }, []);
  return mood;
}

function Chibi({ id }: { id: CharId }) {
  const el = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const bubble = useWorldUI((s) => s.bubbles[id]);
  const emote = useWorldUI((s) => s.emotes[id]);
  const menu = useWorldUI((s) => s.menu === id);
  const lang = useStore((s) => s.lang);
  const speaking = useStore((s) => s.beat?.who === id);

  useEffect(() => {
    world.attach(id, el.current, img.current);
    return () => world.attach(id, null, null);
  }, [id]);

  return (
    <div ref={el} className={`chibi ${speaking ? "speaking" : ""}`} style={{ ["--c" as any]: CAST[id].color }}>
      <div className="chibi-shadow" />
      <img ref={img} className="chibi-img" alt={CAST[id].zh} draggable={false}
        onClick={(e) => {
          e.stopPropagation();
          sfx.click();
          useWorldUI.getState().set({ menu: menu ? null : id });
        }} />
      <div className="chibi-name">{lang === "zh" ? CAST[id].shortZh : CAST[id].shortEn}</div>
      <AnimatePresence>
        {emote && (
          <motion.div key={emote.key} className={`emote ${emote.emote === "gloom" ? "gloom" : ""}`}
            initial={{ scale: 0, y: 10, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.3, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 16 }}>
            <EmoteIcon e={emote.emote} />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {bubble && (
          <motion.div key={bubble.key} className="say" initial={{ scale: 0.6, opacity: 0, y: 8 }} animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }} transition={{ type: "spring", stiffness: 420, damping: 22 }}>
            {bubble.text}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{menu && <ChibiMenu id={id} />}</AnimatePresence>
    </div>
  );
}

function ChibiMenu({ id }: { id: CharId }) {
  const lang = useStore((s) => s.lang);
  const act = async (kind: "pat" | "bonk") => {
    useWorldUI.getState().set({ menu: null });
    const fx = { id: Date.now(), who: id, kind };
    useWorldUI.getState().set({ fx: [...useWorldUI.getState().fx, fx] });
    window.setTimeout(() => useWorldUI.getState().set({ fx: useWorldUI.getState().fx.filter((f) => f.id !== fx.id) }), 1600);
    kind === "pat" ? sfx.pat() : sfx.bonk();
    world.setAct(id, kind === "pat" ? "blush" : "dizzy", 2600);
    world.emote(id, kind === "pat" ? "heart" : "anger");
    try {
      const r = await api.post("/api/interact", { who: id, kind });
      if (r?.beat) world.say(id, r.beat[lang] ?? r.beat.zh, 3200);
    } catch {
      world.say(id, kind === "pat" ? "♪" : "!?", 2000);
    }
  };
  return (
    <motion.div className="chibi-menu" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}
      onClick={(e) => e.stopPropagation()}>
      <button onClick={() => act("pat")}>🖐 {t("pat", lang)}</button>
      <button onClick={() => act("bonk")}>🔨 {t("bonk", lang)}</button>
      <button onClick={() => { useWorldUI.getState().set({ menu: null }); useStore.getState().set({ profile: id }); }}>
        ✦ {t("profile", lang)}
      </button>
    </motion.div>
  );
}

function Fx() {
  const fx = useWorldUI((s) => s.fx);
  return (
    <>
      {fx.map((f) => {
        const [x, y] = world.pos(f.who);
        return (
          <div key={f.id} className={`fx fx-${f.kind}`} style={{ left: x, top: y, zIndex: 5000 }}>
            {f.kind === "pat" ? (
              <>
                <div className="fx-hand"><Hand /></div>
                {[0, 1, 2, 3].map((i) => <span key={i} className="fx-heart" style={{ ["--i" as any]: i }}>♥</span>)}
              </>
            ) : (
              <>
                <div className="fx-hammer"><Hammer /></div>
                <div className="fx-boing">{useStore.getState().lang === "zh" ? "咚！" : "BONK!"}</div>
                {[0, 1, 2, 3, 4].map((i) => <span key={i} className="fx-star" style={{ ["--i" as any]: i }}>★</span>)}
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

export function Diorama() {
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const mood = useDaylight();
  const vn = useStore((s) => !!s.vn);
  const speaker = useStore((s) => s.beat?.who);
  const shot = useStore((s) => s.beat?.shot);

  useEffect(() => {
    fetch("/art/manifest.json").then((r) => r.json()).then((m) => {
      setSpriteSizes(m.chibi || {});
      // warm the cache so pose swaps never flash
      Object.entries(m.chibi || {}).forEach(([c, poses]: any) => Object.keys(poses).forEach((p) => { const i = new Image(); i.src = art.chibi(c, p); }));
    }).catch(() => {});
    world.start();
    return () => world.stop();
  }, []);

  useEffect(() => {
    const f = () => {
      const w = wrap.current?.clientWidth ?? window.innerWidth;
      const h = wrap.current?.clientHeight ?? window.innerHeight;
      setScale(Math.max(w / 1536, h / 1024));
    };
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);

  // gentle camera push toward whoever speaks in a wide shot
  const cam = useMemo(() => {
    if (!speaker || shot !== "wide") return { x: 0, y: 0, z: 1 };
    const [x, y] = world.pos(speaker);
    return { x: (768 - x) * 0.18, y: (560 - y) * 0.12, z: 1.06 };
  }, [speaker, shot]);

  return (
    <div className={`diorama mood-${mood} ${vn ? "dim" : ""}`} ref={wrap} onClick={() => useWorldUI.getState().set({ menu: null })}>
      <div className="world" style={{ transform: `translate(-50%, -50%) scale(${scale * cam.z}) translate(${cam.x}px, ${cam.y}px)` }}>
        <img className="world-bg" src={art.bg("clubroom")} alt="" draggable={false} />
        <div className="light" />
        <div className="motes">{Array.from({ length: 14 }, (_, i) => <span key={i} style={{ ["--i" as any]: i }} />)}</div>
        {ORDER.map((id) => <Chibi key={id} id={id} />)}
        <Fx />
      </div>
    </div>
  );
}
