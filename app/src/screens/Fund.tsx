import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { MODE_NAME, UNIVERSE_NAME, t } from "../lib/i18n";
import { useStore } from "../lib/store";
import { LineChart } from "../ui/charts";
import { Sheet } from "./Sheet";

const pct = (v: number | undefined | null, d = 1) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);

export function Fund() {
  const lang = useStore((s) => s.lang);
  const zh = lang === "zh";
  const v = useStore((s) => s.dataVersion);
  const [fund, setFund] = useState<any>(null);
  const [paper, setPaper] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get("/api/fund").then(setFund).catch(() => setFund({ members: [] }));
    api.get("/api/paper").then(setPaper).catch(() => {});
  }, [v]);
  const close = () => useStore.getState().set({ tab: "room" });
  const cycle = async () => {
    setBusy(true);
    try {
      setPaper(await api.post("/api/paper/cycle"));
    } finally {
      setBusy(false);
    }
  };
  const members = fund?.members ?? [];
  const st = fund?.stats;
  const targets = Object.entries(fund?.targets ?? {}).slice(0, 18) as [string, number][];
  const hist = (paper?.history ?? []) as [string, number][];
  return (
    <Sheet title={t("fund", lang)} sub={zh ? "部费基金：被采用的策略按贝叶斯均值-方差分配，目标波动 10%，同一股票的仓位先轧差再交易" : "Club fund: adopted strategies, Bayesian mean-variance, 10% vol target, positions netted per ticker before trading"} onClose={close} wide>
      {!fund && <div className="empty">…</div>}
      {fund && !members.length && (
        <div className="empty">{zh ? "基金还是空的。等研究部采用第一个策略吧——门槛很高，这是好事。" : "The fund is empty. Wait for the first adoption — the bar is high, and that's the point."}</div>
      )}
      {members.length > 0 && (
        <>
          <div className="kpis">
            <div className="kpi hero"><span>{zh ? "组合夏普（10年）" : "Fund Sharpe (10y)"}</span><b className="num">{st?.sharpe?.toFixed(2)}</b></div>
            <div className="kpi"><span>CAGR</span><b className="num">{pct(st?.cagr)}</b></div>
            <div className="kpi"><span>{zh ? "波动" : "Vol"}</span><b className="num">{pct(st?.vol)}</b></div>
            <div className="kpi"><span>{zh ? "最大回撤" : "Max DD"}</span><b className="num">{pct(st?.max_dd, 0)}</b></div>
            <div className="kpi"><span>β</span><b className="num">{st?.beta?.toFixed(2)}</b></div>
            <div className="kpi"><span>{zh ? "杠杆" : "Leverage"}</span><b className="num">{fund.allocation?.leverage?.toFixed(2)}x</b></div>
            <div className="kpi"><span>{zh ? "总敞口" : "Gross"}</span><b className="num">{fund.gross?.toFixed(2)}x</b></div>
          </div>
          <div className="grid2">
            <section className="box">
              <h4>{zh ? "基金净值（当前配置回放 10 年，含选择偏差）" : "Fund NAV (current mix replayed 10y — in-sample)"}</h4>
              <LineChart log series={[{ data: fund.nav ?? [], color: "#14b8a6", width: 2.6 }]} yfmt={(v) => v.toFixed(2)} />
              <p className="note">{zh ? "这条线用了今天才知道的策略名单，所以一定偏乐观。真正的成绩单是下面的模拟盘。" : "This curve uses today's roster, so it is optimistic by construction. The real report card is the paper book below."}</p>
            </section>
            <section className="box">
              <h4>{zh ? "成员与权重" : "Members & weights"}</h4>
              <div className="alloc">
                {members.map((m: any) => (
                  <div key={m.id} className={`alloc-row tier-${m.tier}`} onClick={() => useStore.getState().set({ tearsheet: m.id })}>
                    <span className="alloc-tier num">{m.tier}</span>
                    <span className="alloc-name">{(zh ? m.title_zh : m.title_en) || m.expr}</span>
                    <span className="alloc-tag">{UNIVERSE_NAME[m.universe]?.[lang]} · {MODE_NAME[m.mode]?.[lang]}</span>
                    <span className="alloc-bar"><i style={{ width: `${Math.min(100, m.weight * 100 / 1.5)}%` }} /></span>
                    <b className="num">{pct(m.weight, 0)}</b>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <section className="box">
            <h4>{zh ? "目标持仓（占基金净值）" : "Target positions (fraction of NAV)"}</h4>
            <div className="targets">
              {targets.map(([k, w]) => (
                <div key={k} className="target"><span className="mono">{k}</span><b className={`num ${w >= 0 ? "pass" : "fail"}`}>{pct(w)}</b></div>
              ))}
            </div>
          </section>
        </>
      )}
      <section className="box">
        <h4>{zh ? "模拟盘（真实价格向前运行）" : "Paper book (forward, real prices)"}</h4>
        <div className="kpis">
          <div className="kpi hero"><span>{zh ? "净值" : "NAV"}</span><b className="num">${Math.round(paper?.nav ?? 0).toLocaleString()}</b></div>
          <div className="kpi"><span>{zh ? "收益" : "Return"}</span><b className={`num ${(paper?.return ?? 0) >= 0 ? "pass" : "fail"}`}>{pct(paper?.return, 2)}</b></div>
          <div className="kpi"><span>{zh ? "持仓数" : "Positions"}</span><b className="num">{paper?.positions ?? 0}</b></div>
          <div className="kpi"><span>{zh ? "待成交" : "Pending"}</span><b className="num">{paper?.pending ?? 0}</b></div>
          <div className="kpi"><span>{zh ? "数据日期" : "Data date"}</span><b className="num small">{paper?.last_date ?? "—"}</b></div>
          <div className="kpi"><span>Alpaca</span><b className="num small">{paper?.alpaca ? (zh ? "已配置" : "keys set") : (zh ? "未配置" : "no keys")}</b></div>
        </div>
        {hist.length > 1 && <LineChart series={[{ data: hist, color: "#ff8a3d", width: 2.4 }]} h={160} yfmt={(v) => `$${Math.round(v / 1000)}k`} />}
        <p className="note">{zh ? "每个交易日收盘后：刷新数据 → 按基金目标生成「次日开盘」订单 → 次日开盘价成交（含点差）→ 收盘价盯市。和回测是同一条时间线。" : "After each close: refresh data → queue market-on-open orders for the fund's targets → fill at the next open (plus spread) → mark at the close. The same timeline the backtester uses."}</p>
        <div className="row-btns">
          <button className="btn primary" disabled={busy} onClick={cycle}>{busy ? "…" : zh ? "推进模拟盘" : "Advance paper book"}</button>
          <button className="btn" onClick={async () => setPaper(await api.post("/api/paper/reset"))}>{zh ? "重置" : "Reset"}</button>
        </div>
      </section>
    </Sheet>
  );
}
