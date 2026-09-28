import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { art } from "../lib/cast";
import { MODE_NAME, SOURCE_NAME, UNIVERSE_NAME, t } from "../lib/i18n";
import { useStore } from "../lib/store";
import type { CharId, TrialSlim } from "../lib/types";
import { Spark } from "../ui/charts";
import { Sheet } from "./Sheet";

const SOURCE_FACE: Record<string, CharId> = { llm: "akari", library: "akari", refine: "akari", miner: "ren", boss: "mio", manual: "mio" };
const STARS = { N: 1, R: 2, SR: 3, SSR: 4 } as const;

export function StrategyCard({ tr, onClick }: { tr: TrialSlim; onClick: () => void }) {
  const lang = useStore((s) => s.lang);
  const tier = tr.tier ?? "N";
  const statusTxt = tr.status === "promoted" ? t("promoted", lang) : tr.status === "reserve" ? t("reserve", lang) : t("rejected", lang);
  return (
    <motion.button className={`scard tier-${tier} st-${tr.status}`} onClick={onClick} whileHover={{ y: -4, rotate: -0.5 }} layout>
      <div className="scard-top">
        <span className="scard-tier num">{tier}</span>
        <span className="scard-stars">{"★".repeat(STARS[tier as keyof typeof STARS] ?? 1)}</span>
        <span className={`scard-status ${tr.status}`}>{statusTxt}</span>
      </div>
      <img className="scard-face" src={art.avatar(SOURCE_FACE[tr.source] ?? "akari")} alt="" />
      <div className="scard-title">{(lang === "zh" ? tr.title_zh : tr.title_en) || tr.canonical}</div>
      <div className="scard-expr mono">{tr.canonical}</div>
      <div className="scard-spark"><Spark data={tr.equity ?? []} w={200} h={40} color={(tr.sr ?? 0) > 0 ? "#1fbf75" : "#ff6f86"} /></div>
      <div className="scard-stats">
        <div><span>{lang === "zh" ? "预期夏普" : "E[SR]"}</span><b className="num">{(tr.post_mean ?? 0).toFixed(2)}</b></div>
        <div><span>{lang === "zh" ? "回测夏普" : "Backtest"}</span><b className="num">{(tr.sr ?? 0).toFixed(2)}</b></div>
        <div><span>DSR</span><b className="num">{tr.dsr != null ? tr.dsr.toFixed(2) : "—"}</b></div>
      </div>
      <div className="scard-tags">
        <span>{UNIVERSE_NAME[tr.universe]?.[lang] ?? tr.universe}</span>
        <span>{MODE_NAME[tr.mode]?.[lang] ?? tr.mode}</span>
        <span>{SOURCE_NAME[tr.source]?.[lang] ?? tr.source}</span>
      </div>
    </motion.button>
  );
}

export function Collection() {
  const lang = useStore((s) => s.lang);
  const v = useStore((s) => s.dataVersion);
  const [rows, setRows] = useState<TrialSlim[] | null>(null);
  const [filter, setFilter] = useState<"all" | "promoted" | "reserve" | "rejected">("all");
  const [sort, setSort] = useState<"post" | "new">("post");
  useEffect(() => {
    api.get<TrialSlim[]>("/api/trials").then(setRows).catch(() => setRows([]));
  }, [v]);
  const list = useMemo(() => {
    const r = (rows ?? []).filter((x) => filter === "all" || x.status === filter);
    return sort === "post" ? [...r].sort((a, b) => (b.post_mean ?? -9) - (a.post_mean ?? -9)) : r;
  }, [rows, filter, sort]);
  const counts = useMemo(() => {
    const c = { all: rows?.length ?? 0, promoted: 0, reserve: 0, rejected: 0 } as Record<string, number>;
    rows?.forEach((r) => (c[r.status] = (c[r.status] ?? 0) + 1));
    return c;
  }, [rows]);
  const close = () => useStore.getState().set({ tab: "room" });
  return (
    <Sheet title={t("dex", lang)} sub={lang === "zh" ? "稀有度 = 经验贝叶斯收缩后的预期实盘夏普 · N < 0.35 ≤ R < 0.6 ≤ SR < 0.9 ≤ SSR" : "Rarity = expected live Sharpe after empirical-Bayes shrinkage · N < 0.35 ≤ R < 0.6 ≤ SR < 0.9 ≤ SSR"} onClose={close} wide>
      <div className="filters">
        {(["all", "promoted", "reserve", "rejected"] as const).map((f) => (
          <button key={f} className={`chip-btn ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
            {t(f === "all" ? "all" : f, lang)} <b className="num">{counts[f] ?? 0}</b>
          </button>
        ))}
        <span className="grow" />
        <button className={`chip-btn ${sort === "post" ? "on" : ""}`} onClick={() => setSort("post")}>{lang === "zh" ? "按预期夏普" : "By E[SR]"}</button>
        <button className={`chip-btn ${sort === "new" ? "on" : ""}`} onClick={() => setSort("new")}>{lang === "zh" ? "最新" : "Newest"}</button>
      </div>
      {rows && !list.length && <div className="empty">{t("empty", lang)}</div>}
      <div className="cards">
        {list.map((tr) => <StrategyCard key={tr.id} tr={tr} onClick={() => useStore.getState().set({ tearsheet: tr.id })} />)}
      </div>
    </Sheet>
  );
}
