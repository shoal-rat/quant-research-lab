import { AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { GATE_NAME, MODE_NAME, SOURCE_NAME, UNIVERSE_NAME } from "../lib/i18n";
import { useStore } from "../lib/store";
import { Bars, LineChart, MonthHeat, PosteriorPlot } from "../ui/charts";
import { Sheet } from "./Sheet";

const pct = (v: number | undefined | null, d = 1) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);
const f2 = (v: number | undefined | null) => (v == null || !isFinite(v) ? "—" : v.toFixed(2));

function Kpi({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className={`kpi ${tone ?? ""}`} title={hint}>
      <span>{label}</span>
      <b className="num">{value}</b>
    </div>
  );
}

function Box({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="box">
      <h4>{title}</h4>
      {children}
      {note && <p className="note">{note}</p>}
    </section>
  );
}

export function Tearsheet() {
  const id = useStore((s) => s.tearsheet);
  return <AnimatePresence>{id && <TearsheetInner key={id} id={id} />}</AnimatePresence>;
}

function TearsheetInner({ id }: { id: string }) {
  const lang = useStore((s) => s.lang);
  const zh = lang === "zh";
  const [t, setT] = useState<any>(null);
  useEffect(() => {
    api.get(`/api/trials/${id}`).then(setT).catch(() => setT({ error: true }));
  }, [id]);
  const close = () => useStore.getState().set({ tearsheet: null });
  const r = t?.report ?? {};
  const s = r.summary ?? {};
  const post = r.posterior ?? {};
  const sig = r.signal ?? {};
  const title = t ? (zh ? t.title_zh : t.title_en) || t.canonical : "…";
  return (
    <Sheet title={title} sub={t ? `${UNIVERSE_NAME[t.universe]?.[lang] ?? t.universe} · ${MODE_NAME[t.mode]?.[lang] ?? t.mode} · ${SOURCE_NAME[t.source]?.[lang] ?? t.source} · #${t.id}` : ""} onClose={close} wide>
      {!t && <div className="empty">…</div>}
      {t?.error && <div className="empty">404</div>}
      {t && !t.error && (
        <div className="ts">
          <div className={`ts-hero tier-${t.tier}`}>
            <div className="ts-tier num">{t.tier}</div>
            <div className="ts-hero-main">
              <div className="ts-expr mono">{t.expr}</div>
              <div className="ts-thesis">{zh ? t.thesis_zh : t.thesis_en}</div>
              <div className="ts-tags">
                <span className="chip">{t.mechanism}</span>
                {t.family && <span className="chip">{t.family}</span>}
                <span className={`chip verdict-${t.status}`}>{t.verdict}</span>
              </div>
            </div>
          </div>

          <div className="kpis">
            <Kpi label={zh ? "预期实盘夏普" : "E[live Sharpe]"} value={`${f2(post.mean)} ± ${f2(post.sd)}`} tone="hero" hint={zh ? "经验贝叶斯后验：回测夏普向全部试验总体收缩" : "Empirical-Bayes posterior"} />
            <Kpi label={zh ? "扣费夏普" : "Net Sharpe"} value={f2(r.sharpe)} />
            <Kpi label={zh ? "毛夏普" : "Gross Sharpe"} value={f2(r.gross_sharpe)} />
            <Kpi label="DSR" value={f2(r.dsr)} hint={zh ? `选择门槛 ${f2(r.dsr_bar)}（${r.trials} 抽）` : `bar ${f2(r.dsr_bar)} over ${r.trials} pulls`} />
            <Kpi label="CAGR" value={pct(s.cagr)} />
            <Kpi label={zh ? "波动" : "Vol"} value={pct(s.vol)} />
            <Kpi label={zh ? "最大回撤" : "Max DD"} value={pct(s.max_dd, 0)} tone={s.max_dd < -0.3 ? "bad" : ""} />
            <Kpi label={zh ? "年换手" : "Turnover"} value={`${f2(s.turnover)}x`} />
            <Kpi label={zh ? "成本" : "Costs"} value={`${Math.round(s.cost_bps ?? 0)}bp`} />
            <Kpi label="β" value={f2(s.beta)} />
          </div>

          <div className="grid2">
            <Box title={zh ? "净值（研究区间） vs 标普500" : "Equity (research region) vs S&P 500"} note={zh ? `训练段截至 ${r.split?.train_end}；保险箱自 ${r.split?.lockbox_start} 起，仅在全部门槛通过后打开一次。` : `Train ends ${r.split?.train_end}; lockbox from ${r.split?.lockbox_start}, opened once only after every gate passes.`}>
              <LineChart log series={[{ data: r.bench ?? [], color: "#b9c6d8", dash: "5 4", width: 1.6 }, { data: r.equity ?? [], color: "#1590e8", width: 2.6 }]} yfmt={(v) => v.toFixed(1)} />
            </Box>
            <Box title={zh ? "贝叶斯怀疑：先验 · 回测 · 后验" : "Bayesian skepticism: prior · backtest · posterior"}
              note={zh ? `回测夏普 ${f2(r.sharpe)}（标准误 ${f2(r.se)}）被收缩了 ${pct(post.shrink, 0)}。先验来自研究部全部 ${post.population ?? 0} 次同类试验和机制先验。P(真实夏普>0) = ${pct(post.p_positive, 0)}。` : `Backtest Sharpe ${f2(r.sharpe)} (SE ${f2(r.se)}) shrunk ${pct(post.shrink, 0)} toward the lab's ${post.population ?? 0} comparable trials and the mechanism prior. P(true Sharpe > 0) = ${pct(post.p_positive, 0)}.`}>
              {post.mean != null && <PosteriorPlot obs={r.sharpe ?? 0} se={r.se ?? 0.2} post={post.mean} postSd={post.sd ?? 0.1} prior={post.prior_mean ?? 0} priorSd={post.prior_sd ?? 0.2} />}
              <div className="legend"><i style={{ background: "#b9c6d8" }} />{zh ? "先验" : "prior"} <i style={{ background: "#ffb000" }} />{zh ? "回测证据" : "backtest"} <i style={{ background: "#1590e8" }} />{zh ? "后验" : "posterior"}</div>
            </Box>
            <Box title={zh ? "回撤" : "Drawdown"}>
              <LineChart zero pct series={[{ data: r.drawdown ?? [], color: "#ff4d5e", fill: true }]} h={160} />
            </Box>
            <Box title={zh ? "滚动一年夏普" : "Rolling 1-year Sharpe"}>
              <LineChart zero series={[{ data: r.rolling_sharpe ?? [], color: "#b15cff" }]} h={160} />
            </Box>
            <Box title={zh ? "年度超额收益" : "Yearly excess return"}>
              <Bars pct items={Object.entries(r.yearly ?? {}).map(([k, v]) => ({ label: `'${k.slice(2)}`, value: v as number }))} />
            </Box>
            <Box title={zh ? "月度收益热力图" : "Monthly returns"}>
              <MonthHeat rows={r.monthly ?? []} />
            </Box>
            {sig.ic && (
              <Box title={zh ? "IC 衰减（Newey-West t 值）" : "IC decay (Newey-West t)"} note={zh ? `训练段 IC t=${f2(sig.ic_train?.t)} · 验证段 IC t=${f2(sig.ic_valid?.t)} · 信号自相关 ${f2(sig.autocorr)}` : `train IC t=${f2(sig.ic_train?.t)} · valid IC t=${f2(sig.ic_valid?.t)} · signal autocorr ${f2(sig.autocorr)}`}>
                <Bars items={Object.entries(sig.ic).map(([h, v]: any) => ({ label: `${h}d`, value: v.mean }))} fmt={(v) => v.toFixed(3)} />
                <div className="ic-t">{Object.entries(sig.ic).map(([h, v]: any) => <span key={h} className={Math.abs(v.t) >= 2 ? "pass" : ""}>{h}d t={v.t.toFixed(1)}</span>)}</div>
              </Box>
            )}
            {sig.quantiles && (
              <Box title={zh ? "五分位年化超额（1=最低分）" : "Quintile excess return (1 = lowest score)"} note={zh ? `单调性 ${f2(sig.monotonic)}` : `monotonicity ${f2(sig.monotonic)}`}>
                <Bars pct items={sig.quantiles.map((v: number, i: number) => ({ label: `Q${i + 1}`, value: v }))} />
              </Box>
            )}
            {r.capacity?.length > 0 && (
              <Box title={zh ? "容量曲线：资金规模 vs 扣费夏普" : "Capacity: capital vs net Sharpe"} note={zh ? "平方根冲击成本随规模放大；零售规模几乎无影响。" : "Square-root impact grows with size; negligible at retail scale."}>
                <Bars items={r.capacity.map((c: any) => ({ label: c.capital >= 1e9 ? "$1B" : c.capital >= 1e6 ? `$${c.capital / 1e6}M` : `$${c.capital / 1e3}K`, value: c.sharpe }))} />
              </Box>
            )}
            {r.attribution?.loadings && (
              <Box title={zh ? "因子归因（Newey-West）" : "Factor attribution (Newey-West)"} note={zh ? `剥离已知因子后 α = ${pct(r.attribution.alpha_ann)}/年，t = ${f2(r.attribution.alpha_t)}，R² = ${f2(r.attribution.r2)}` : `alpha after known factors = ${pct(r.attribution.alpha_ann)}/yr, t = ${f2(r.attribution.alpha_t)}, R² = ${f2(r.attribution.r2)}`}>
                <Bars items={Object.entries(r.attribution.loadings).map(([k, v]: any) => ({ label: k, value: v.beta, color: Math.abs(v.t) > 3 ? "#b15cff" : "#c9d6e6" }))} />
              </Box>
            )}
          </div>

          <Box title={zh ? "门槛清单" : "Gate checklist"}>
            <div className="checklist">
              {(t.reasons ?? []).map((g: any) => (
                <div key={g.gate} className={`check ${g.pass ? "pass" : g.hard ? "fail" : "warn"}`}>
                  <b>{g.pass ? "✓" : "✗"}</b>
                  <span className="check-name">{GATE_NAME[g.gate]?.[lang] ?? g.gate}</span>
                  <span className="check-detail num">{g.detail}</span>
                </div>
              ))}
            </div>
            {r.lockbox && (
              <p className="note">{zh ? `保险箱（${r.lockbox.period?.[0]} → ${r.lockbox.period?.[1]}）：夏普 ${f2(r.lockbox.sharpe)} ± ${f2(r.lockbox.se)}，收益 ${pct(r.lockbox.return)}。` : `Lockbox (${r.lockbox.period?.[0]} → ${r.lockbox.period?.[1]}): Sharpe ${f2(r.lockbox.sharpe)} ± ${f2(r.lockbox.se)}, return ${pct(r.lockbox.return)}.`}</p>
            )}
          </Box>
          <p className="note small">{zh ? `构建：${JSON.stringify(r.book ?? t.book)} · 平均持仓 ${Math.round(r.names_held ?? 0)} 只` : `Book: ${JSON.stringify(r.book ?? t.book)} · avg names held ${Math.round(r.names_held ?? 0)}`}</p>
        </div>
      )}
    </Sheet>
  );
}
