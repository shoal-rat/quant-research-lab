import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { CAST, ORDER, art } from "../lib/cast";
import { GATE_NAME, MODE_NAME, SOURCE_NAME, STAGE_NAME, UNIVERSE_NAME, t } from "../lib/i18n";
import { sfx } from "../lib/sfx";
import { setLang, useStore, type Tab } from "../lib/store";
import type { Stage } from "../lib/types";
import "./hud.css";

export function Emblem({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className="emblem">
      <defs>
        <linearGradient id="emb" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#6fd3ff" />
          <stop offset="1" stopColor="#1590e8" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="29" fill="url(#emb)" />
      <ellipse cx="32" cy="32" rx="26" ry="9" fill="none" stroke="#fff" strokeWidth="3" transform="rotate(-24 32 32)" />
      <path d="M32 14 L36 27 L49 28 L39 36 L42 49 L32 42 L22 49 L25 36 L15 28 L28 27Z" fill="#ffd23d" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function usePaper() {
  const v = useStore((s) => s.dataVersion);
  const conn = useStore((s) => s.conn);
  const [p, setP] = useState<any>(null);
  useEffect(() => {
    if (conn) api.get("/api/paper").then(setP).catch(() => {});
  }, [v, conn]);
  return p;
}

const TABS: { k: Tab; icon: string; key: "room" | "dex" | "fund" | "log" | "theory" | "settings" }[] = [
  { k: "room", icon: "⌂", key: "room" },
  { k: "dex", icon: "✦", key: "dex" },
  { k: "fund", icon: "◎", key: "fund" },
  { k: "log", icon: "☰", key: "log" },
  { k: "theory", icon: "✎", key: "theory" },
  { k: "settings", icon: "⚙", key: "settings" },
];

export function TopBar() {
  const s = useStore((x) => x.status);
  const lang = useStore((x) => x.lang);
  const tab = useStore((x) => x.tab);
  const conn = useStore((x) => x.conn);
  const muted = useStore((x) => x.muted);
  const paper = usePaper();
  const running = !!s?.running;
  const brain = s?.brain?.last_backend ?? (s?.brain?.backends?.find((b) => !(s?.brain?.benched ?? {})[b]) ?? "offline");
  const nav = paper?.nav ?? 100000;
  const ret = paper?.return ?? 0;
  return (
    <div className="topbar">
      <div className="brand panel">
        <Emblem />
        <div>
          <div className="brand-title">{t("club", lang)}</div>
          <div className="brand-sub">{t("academy", lang)} · Quant Research Lab</div>
        </div>
      </div>
      <div className="stats panel">
        <div className="stat">
          <span>{lang === "zh" ? "模拟盘" : "Paper NAV"}</span>
          <b className="num">${Math.round(nav).toLocaleString()}</b>
          <i className={`num ${ret >= 0 ? "pass" : "fail"}`}>{ret >= 0 ? "+" : ""}{(ret * 100).toFixed(2)}%</i>
        </div>
        <div className="stat"><span>{t("pulls", lang)}</span><b className="num">{s?.pulls ?? 0}</b></div>
        <div className="stat"><span>{t("adopted", lang)}</span><b className="num">{s?.promoted ?? 0}</b></div>
        <div className="stat" title={lang === "zh" ? "敲纱季的头会让她更严格" : "Bonking Saki makes her stricter"}>
          <span>{lang === "zh" ? "严格度" : "Strictness"}</span><b className="num">×{(s?.strictness ?? 1).toFixed(2)}</b>
        </div>
        <div className="stat brain"><span>{lang === "zh" ? "大脑" : "Brain"}</span><b className={`num ${brain === "offline" ? "warn" : ""}`}>{brain}</b></div>
      </div>
      <div className="controls">
        <button className={`btn ${running ? "pink" : "primary"} big`} disabled={!conn}
          onClick={() => { sfx.click(); api.post(running ? "/api/stop" : "/api/start"); }}>
          {running ? `❚❚ ${t("pause", lang)}` : `▶ ${t("start", lang)}`}
        </button>
        {!running && (
          <button className="btn" disabled={!conn || s?.busy} onClick={() => { sfx.click(); api.post("/api/episode"); }}>
            {t("oneRound", lang)}
          </button>
        )}
      </div>
      <nav className="tabs panel">
        {TABS.map((x) => (
          <button key={x.k} className={tab === x.k ? "on" : ""} onClick={() => { sfx.click(); useStore.getState().set({ tab: x.k }); }}>
            <span className="ico">{x.icon}</span>
            <span className="lbl">{t(x.key, lang)}</span>
          </button>
        ))}
        <button onClick={() => setLang(lang === "zh" ? "en" : "zh")}><span className="ico">文</span><span className="lbl">{lang === "zh" ? "EN" : "中文"}</span></button>
        <button onClick={() => useStore.getState().set({ muted: !muted })}><span className="ico">{muted ? "♪̸" : "♪"}</span><span className="lbl">{muted ? (lang === "zh" ? "静音" : "Muted") : (lang === "zh" ? "音效" : "Sound")}</span></button>
      </nav>
    </div>
  );
}

export function Roster() {
  const lang = useStore((s) => s.lang);
  const club = useStore((s) => s.status?.club);
  const speaker = useStore((s) => s.beat?.who);
  return (
    <div className="roster">
      {ORDER.map((id) => {
        const c = CAST[id];
        const aff = club?.[id]?.affection ?? 20;
        return (
          <motion.button key={id} className={`member ${speaker === id ? "on" : ""}`} style={{ ["--c" as any]: c.color }}
            whileHover={{ x: 4 }} onClick={() => { sfx.click(); useStore.getState().set({ profile: id }); }}>
            <img src={art.avatar(id)} alt="" />
            <div className="member-txt">
              <b>{lang === "zh" ? c.zh : c.shortEn}</b>
              <span>{lang === "zh" ? c.roleZh : c.roleEn}</span>
              <div className="aff"><i style={{ width: `${aff}%` }} /></div>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

function stageNumber(st: Stage | undefined, lang: string): string {
  if (!st) return "";
  switch (st.key) {
    case "integrity": return `${Math.round((st.coverage ?? 0) * 100)}%`;
    case "signal": { const ic = st.ic?.[21] ?? st.ic?.["21"]; return ic ? `t ${ic.t.toFixed(1)}` : "—"; }
    case "backtest": return `SR ${(st.sharpe ?? 0).toFixed(2)}`;
    case "risk": return `${Math.round(st.cost_bps ?? 0)}bp`;
    case "skeptic": return `E ${(st.posterior?.mean ?? 0).toFixed(2)}`;
    case "verdict": return st.tier ?? "";
    default: return lang === "zh" ? "通过" : "ok";
  }
}

export function MeetingBoard() {
  const ep = useStore((s) => s.episode);
  const lang = useStore((s) => s.lang);
  const [open, setOpen] = useState(true);
  const keys: Stage["key"][] = ["integrity", "signal", "backtest", "risk", "skeptic", "verdict"];
  const c = ep?.candidate;
  return (
    <div className={`board panel ${open ? "" : "closed"}`}>
      <div className="board-head" onClick={() => setOpen(!open)}>
        <span className="stripe-title">{ep ? `${t("meeting", lang)} #${ep.n}` : t("meeting", lang)}</span>
        {ep?.source && <span className="chip">{SOURCE_NAME[ep.source]?.[lang] ?? ep.source}</span>}
        <span className="board-toggle">{open ? "–" : "+"}</span>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="board-body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            {!ep && <div className="board-wait">{t("waiting", lang)}</div>}
            {ep && !c && !ep.mining && (
              <div className="board-think">
                <img src={art.avatar(ep.source === "miner" ? "ren" : "akari")} alt="" />
                <span>{ep.source === "llm" || ep.source === "boss" ? (lang === "zh" ? "灯正在构思假说" : "Akari is drafting a hypothesis") : (lang === "zh" ? "准备提案" : "Preparing a proposal")}</span>
                <i className="dots"><b>.</b><b>.</b><b>.</b></i>
              </div>
            )}
            {ep?.mining && !c && (
              <div className="cand mining">
                <div className="cand-title">⛏ {lang === "zh" ? `遗传挖掘 · 第 ${ep.mining.generation + 1} 代` : `Mining · gen ${ep.mining.generation + 1}`}</div>
                <div className="cand-expr mono">{ep.mining.expr}</div>
              </div>
            )}
            {c && (
              <motion.div className="cand" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                <div className="cand-title">{(lang === "zh" ? c.title_zh : c.title_en) || c.expr}</div>
                <div className="cand-tags">
                  <span className="chip">{UNIVERSE_NAME[c.universe]?.[lang] ?? c.universe}</span>
                  {c.mode && <span className="chip">{MODE_NAME[c.mode]?.[lang] ?? c.mode}</span>}
                  <span className="chip mech">{c.mechanism}</span>
                </div>
                <div className="cand-thesis">{lang === "zh" ? c.thesis_zh : c.thesis_en}</div>
                <div className="cand-expr mono">{c.expr}</div>
              </motion.div>
            )}
            {ep && (
              <div className="pipe">
                {keys.map((k) => {
                  const st = ep.stages[k];
                  const status = st?.status ?? "pending";
                  const cls = status === "pass" || status === "promote" ? "pass" : status === "warn" || status === "reserve" ? "warn" : status === "pending" ? "pending" : "fail";
                  return (
                    <div key={k} className={`pipe-row ${cls}`}>
                      <img src={art.avatar(k === "integrity" ? "shiori" : k === "signal" ? "akari" : k === "backtest" ? "ren" : k === "risk" ? "saki" : k === "skeptic" ? "iori" : "mio")} alt="" />
                      <span className="pipe-name">{STAGE_NAME[k][lang]}</span>
                      <span className="pipe-val num">{stageNumber(st, lang)}</span>
                      <span className="pipe-dot" />
                    </div>
                  );
                })}
              </div>
            )}
            {ep?.stages?.verdict?.reasons && (
              <div className="gates">
                {(ep.stages.verdict.reasons as any[]).map((r) => (
                  <span key={r.gate} className={`gate ${r.pass ? "pass" : r.hard ? "fail" : "warn"}`} title={r.detail}>
                    {r.pass ? "✓" : "✗"} {GATE_NAME[r.gate]?.[lang] ?? r.gate}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const QUICK = {
  zh: ["试试多资产趋势", "降低换手率", "找和动量低相关的信号", "做行业中性的纯多头", "检验一下季节性"],
  en: ["Try multi-asset trend", "Lower the turnover", "Find something uncorrelated to momentum", "Sector-neutral long-only", "Test seasonality"],
};

export function CommandBar() {
  const lang = useStore((s) => s.lang);
  const conn = useStore((s) => s.conn);
  const [v, setV] = useState("");
  const [sent, setSent] = useState(false);
  const send = async (text: string) => {
    if (!text.trim()) return;
    sfx.click();
    await api.post("/api/directive", { text }).catch(() => {});
    setV("");
    setSent(true);
    window.setTimeout(() => setSent(false), 1600);
  };
  return (
    <div className="cmd">
      <div className="cmd-quick">
        {QUICK[lang].map((q) => <button key={q} onClick={() => send(q)} disabled={!conn}>{q}</button>)}
      </div>
      <form className="cmd-bar panel" onSubmit={(e) => { e.preventDefault(); send(v); }}>
        <span className="cmd-badge">{lang === "zh" ? "顾问" : "ADVISOR"}</span>
        <input value={v} onChange={(e) => setV(e.target.value)} placeholder={t("directive", lang)} disabled={!conn} />
        <button className="btn primary" type="submit" disabled={!conn || !v.trim()}>{sent ? "✓" : t("send", lang)}</button>
      </form>
    </div>
  );
}

export function OfflineBanner() {
  const conn = useStore((s) => s.conn);
  const lang = useStore((s) => s.lang);
  const ds = useStore((s) => s.status?.data_status);
  if (!conn) return <div className="offline">{t("offline", lang)}</div>;
  if (ds?.fetching || ds?.refreshing) {
    const u = ds.fetching ?? ds.refreshing;
    return (
      <div className="offline sync">
        <img src={art.avatar("shiori")} alt="" />
        {lang === "zh" ? `栞正在同步市场数据（${u}）` : `Shiori is syncing market data (${u})`}
        {ds.total ? <b className="num"> {ds.done}/{ds.total}</b> : " …"}
      </div>
    );
  }
  if (ds?.error) return <div className="offline">{ds.error}</div>;
  return null;
}
