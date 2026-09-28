import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { CAST, art } from "../lib/cast";
import { SOURCE_NAME, t } from "../lib/i18n";
import { sfx } from "../lib/sfx";
import { useStore } from "../lib/store";
import type { CharId, Face, Tier } from "../lib/types";
import { director } from "./director";
import "./story.css";

// ------------------------------------------------------------------ dialogue box
export function DialogueBox() {
  const beat = useStore((s) => s.beat);
  const key = useStore((s) => s.beatKey);
  const lang = useStore((s) => s.lang);
  const text = beat ? beat[lang] || beat.zh : "";
  const [n, setN] = useState(0);
  const visible = !!beat && beat.shot !== "wide";

  useEffect(() => {
    setN(0);
    if (!beat) return;
    const pitch = CAST[beat.who]?.pitch ?? 1;
    let i = 0;
    const id = window.setInterval(() => {
      i += lang === "zh" ? 1 : 2;
      setN(i);
      if (i % 2 === 0) sfx.blip(pitch);
      if (i >= text.length) window.clearInterval(id);
    }, lang === "zh" ? 38 : 22);
    return () => window.clearInterval(id);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = n >= text.length;
  const c = beat ? CAST[beat.who] : null;
  return (
    <AnimatePresence>
      {visible && c && (
        <motion.div className="dbox" style={{ ["--c" as any]: c.color }}
          initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          onClick={(e) => {
            e.stopPropagation();
            if (!done) setN(text.length);
            else director.advance();
          }}>
          <div className="dbox-name">
            <span className="dbox-name-main">{lang === "zh" ? c.zh : c.en}</span>
            <span className="dbox-role">{lang === "zh" ? c.roleZh : c.roleEn}</span>
          </div>
          <div className="dbox-text">{text.slice(0, n)}{!done && <span className="caret">▍</span>}</div>
          {done && <div className="dbox-next">▼</div>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ------------------------------------------------------------------ VN portraits
function Portrait({ who, face, side, speaking }: { who: CharId; face: Face; side: "left" | "right"; speaking: boolean }) {
  return (
    <motion.div className={`vn-por ${side} ${speaking ? "on" : "off"}`}
      initial={{ x: side === "left" ? -260 : 260, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: side === "left" ? -200 : 200, opacity: 0 }}
      transition={{ type: "spring", stiffness: 160, damping: 22 }}>
      <div className="vn-breathe">
        <AnimatePresence initial={false}>
          <motion.img key={face} src={art.portrait(who, face)} alt="" draggable={false}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} />
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export function VNLayer() {
  const vn = useStore((s) => s.vn);
  const key = useStore((s) => s.beatKey);
  return (
    <AnimatePresence>
      {vn && (
        <motion.div className="vn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45 }}
          onClick={() => director.advance()}>
          <AnimatePresence>
            <motion.img key={vn.bg} className="vn-bg" src={art.bg(vn.bg)} alt="" initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1.02 }}
              exit={{ opacity: 0 }} transition={{ duration: 0.8 }} />
          </AnimatePresence>
          <div className="vn-vignette" />
          <AnimatePresence>
            {vn.left && <Portrait key={`l-${vn.left.who}`} who={vn.left.who} face={vn.left.face} side="left" speaking={vn.speaker === vn.left.who} />}
            {vn.right && <Portrait key={`r-${vn.right.who}`} who={vn.right.who} face={vn.right.face} side="right" speaking={vn.speaker === vn.right.who} />}
          </AnimatePresence>
          <motion.div key={key} className="vn-pulse" initial={{ opacity: 0.35 }} animate={{ opacity: 0 }} transition={{ duration: 0.5 }} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ------------------------------------------------------------------ title card
export function TitleCard() {
  const tc = useStore((s) => s.titleCard);
  const lang = useStore((s) => s.lang);
  return (
    <AnimatePresence>
      {tc && (
        <motion.div className="tcard" key={tc.key} initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
          <motion.div className="tcard-band" style={{ skewY: -4 }} initial={{ x: "-110%" }} animate={{ x: "0%" }} exit={{ x: "110%" }} transition={{ duration: 0.45, ease: [0.2, 0.9, 0.3, 1] }}>
            <div className="tcard-ep num">EPISODE {String(tc.n).padStart(3, "0")}</div>
            <div className="tcard-title">{lang === "zh" ? `第 ${tc.n} 次研究会议` : `Research Meeting #${tc.n}`}</div>
            <div className="tcard-sub">{lang === "zh" ? "提案来源" : "Proposal from"} · {SOURCE_NAME[tc.source]?.[lang] ?? tc.source}</div>
          </motion.div>
          <motion.div className="tcard-band2" style={{ skewY: -4 }} initial={{ x: "110%" }} animate={{ x: "0%" }} transition={{ duration: 0.5, delay: 0.08 }} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ------------------------------------------------------------------ backtest reveal
function useCount(to: number, ms = 1200, key?: unknown) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const f = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(to * (1 - (1 - p) ** 3));
      if (p < 1) raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [to, ms, key]);
  return v;
}

export function EquityPath({ data, w, h, draw = true, color = "#33b6ff", bench }: { data: [string, number][]; w: number; h: number; draw?: boolean; color?: string; bench?: [string, number][] }) {
  const { d, db, area } = useMemo(() => {
    if (!data?.length) return { d: "", db: "", area: "" };
    const all = [...data.map((p) => p[1]), ...(bench ?? []).map((p) => p[1])];
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const x = (i: number, n: number) => (i / Math.max(1, n - 1)) * w;
    const y = (v: number) => h - ((v - lo) / (hi - lo || 1)) * (h - 8) - 4;
    const d = data.map((p, i) => `${i ? "L" : "M"}${x(i, data.length).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
    const db = bench?.length ? bench.map((p, i) => `${i ? "L" : "M"}${x(i, bench.length).toFixed(1)},${y(p[1]).toFixed(1)}`).join("") : "";
    return { d, db, area: `${d}L${w},${h}L0,${h}Z` };
  }, [data, bench, w, h]);
  const gid = useMemo(() => `g${Math.random().toString(36).slice(2)}`, []);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="eq">
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {db && <path d={db} fill="none" stroke="#9aa7b8" strokeWidth="1.5" strokeDasharray="4 4" />}
      <path d={area} fill={`url(#${gid})`} className={draw ? "eq-area" : ""} />
      <path d={d} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" pathLength={1} className={draw ? "eq-line" : ""} />
    </svg>
  );
}

export function RevealCard() {
  const st = useStore((s) => s.reveal);
  const lang = useStore((s) => s.lang);
  const sr = useCount(st?.sharpe ?? 0, 1400, st);
  const good = (st?.sharpe ?? 0) > 0.5;
  return (
    <AnimatePresence>
      {st && (
        <motion.div key="reveal" className="reveal" initial={{ y: 40, opacity: 0, rotateX: 25 }} animate={{ y: 0, opacity: 1, rotateX: 0 }} exit={{ opacity: 0, y: -30 }}
          transition={{ type: "spring", stiffness: 180, damping: 20 }}>
          <div className="reveal-head">
            <span className="stripe-title">BACKTEST</span>
            <span className="reveal-period num">{st.period?.[0]} → {st.period?.[1]}</span>
          </div>
          <div className="reveal-body">
            <div className="reveal-big">
              <div className="reveal-lbl">{t("netSharpe", lang)}</div>
              <div className={`reveal-sr num ${good ? "good" : (st.sharpe ?? 0) < 0 ? "bad" : ""}`}>{sr.toFixed(2)}</div>
              <div className="reveal-kv">
                <span>{t("grossSharpe", lang)}</span><b className="num">{(st.gross_sharpe ?? 0).toFixed(2)}</b>
                <span>CAGR</span><b className="num">{((st.cagr ?? 0) * 100).toFixed(1)}%</b>
                <span>{lang === "zh" ? "最大回撤" : "Max DD"}</span><b className="num">{((st.max_dd ?? 0) * 100).toFixed(0)}%</b>
                <span>{lang === "zh" ? "年换手" : "Turnover"}</span><b className="num">{(st.turnover ?? 0).toFixed(1)}x</b>
              </div>
            </div>
            <div className="reveal-chart">
              <EquityPath data={st.chart ?? []} w={420} h={190} color={good ? "#1fbf75" : "#33b6ff"} />
            </div>
          </div>
          <div className="reveal-foot">{lang === "zh" ? "信号 t 日收盘 → t+1 开盘成交 · 含点差/冲击/融券成本" : "signal at close t → fill at open t+1 · spread, impact & borrow included"}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ------------------------------------------------------------------ verdict cut-in
const STAMP = {
  adopt: { zh: "採用", en: "ADOPTED", color: "#ffb000" },
  reserve: { zh: "保留", en: "RESERVE", color: "#33b6ff" },
  reject: { zh: "却下", en: "REJECTED", color: "#ff3d5a" },
};

export function CutIn() {
  const c = useStore((s) => s.cutin);
  const lang = useStore((s) => s.lang);
  return (
    <AnimatePresence>
      {c && (
        <motion.div key={c.key} className={`cutin ${c.stamp}`} initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          <motion.div className="cutin-flash" initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} transition={{ duration: 0.4 }} />
          <motion.div className="cutin-band" style={{ skewY: -7 }} initial={{ x: "100%" }} animate={{ x: "0%" }} transition={{ duration: 0.32, ease: [0.2, 1, 0.3, 1] }}>
            <div className="speedlines" />
            <motion.img className="cutin-face" style={{ skewY: 7 }} src={art.portrait(c.who, c.stamp === "adopt" ? "joy" : c.stamp === "reject" ? "special" : "base")} alt=""
              initial={{ x: -120, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.18, duration: 0.35 }} />
            <motion.div className="cutin-words" style={{ y: "-50%", skewY: 7 }} initial={{ x: 80, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 }}>
              <div className="cutin-en num">{STAMP[c.stamp].en}</div>
              <div className="cutin-title">{c.title}</div>
            </motion.div>
          </motion.div>
          <motion.div className="hanko" style={{ ["--sc" as any]: STAMP[c.stamp].color }}
            initial={{ scale: 3.2, rotate: -30, opacity: 0 }} animate={{ scale: 1, rotate: -12, opacity: 1 }}
            transition={{ delay: 1.0, type: "spring", stiffness: 520, damping: 14 }}>
            <span>{STAMP[c.stamp].zh}</span>
            {c.tier && c.stamp === "adopt" && <em className="num">{c.tier}</em>}
          </motion.div>
          <motion.div className="cutin-dust" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1.6, opacity: [0, 0.8, 0] }} transition={{ delay: 1.05, duration: 0.6 }} />
          <span className="sr-only">{lang}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ------------------------------------------------------------------ gacha reveal
const STARS: Record<Tier, number> = { N: 1, R: 2, SR: 3, SSR: 4 };

export function GachaReveal() {
  const g = useStore((s) => s.gacha);
  const lang = useStore((s) => s.lang);
  const ref = useRef(false);
  useEffect(() => {
    if (g && !ref.current) {
      ref.current = true;
      window.setTimeout(() => (g.tier === "SSR" || g.tier === "SR" ? sfx.fanfare() : sfx.sparkle()), 700);
    }
    if (!g) ref.current = false;
  }, [g]);
  return (
    <AnimatePresence>
      {g && (
        <motion.div key={g.key} className={`gacha tier-${g.tier}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={() => director.advance()}>
          <motion.div className="gacha-pillar" initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.6, ease: "easeOut" }} />
          <div className="gacha-rays" />
          <motion.div className="gacha-card" initial={{ rotateY: 180, scale: 0.4, y: 80 }} animate={{ rotateY: 0, scale: 1, y: 0 }}
            transition={{ delay: 0.55, type: "spring", stiffness: 120, damping: 14 }}>
            <div className="gacha-tier num">{g.tier}</div>
            <div className="gacha-stars">{"★".repeat(STARS[g.tier])}</div>
            <div className="gacha-title">{g.title}</div>
            <div className="gacha-expr mono">{g.expr}</div>
            <div className="gacha-stat">
              <span>{t("expectedLive", lang)}</span>
              <b className="num">{(g.post ?? 0).toFixed(2)}</b>
            </div>
            <div className="gacha-foot">{lang === "zh" ? "已编入部费基金" : "Added to the club fund"}</div>
          </motion.div>
          {(g.tier === "SSR" || g.tier === "SR") && (
            <div className="confetti">{Array.from({ length: 36 }, (_, i) => <i key={i} style={{ ["--i" as any]: i }} />)}</div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
