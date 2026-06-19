import { useState } from "react";
import { Activity, CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { useAppStore } from "../store/AppStore";

interface ValidationResult {
  passed: boolean;
  labStatus: string;
  reasons: string[];
  metrics: {
    oosSharpe: number;
    fullSharpe: number;
    returnAfterCosts: number;
    deflatedSharpe: number;
    oosICt: number | null;
    oosICobs: number | null;
    walkForwardPassRate: number | null;
    randomBaselineSharpe: number;
    maxDrawdown: number;
  };
  regime: { riskOn: boolean; asOf: string };
  targets: string[];
  universeSize: number;
  dataRange: string;
}

interface StatusResult {
  account: { status: string; equity: number; cash: number; buyingPower: number };
  positions: Array<{ symbol: string; qty: number; marketValue: number; unrealizedPl: number; unrealizedPlpc: number }>;
  openOrders: Array<{ symbol: string; side: string; notional?: string; qty?: string; status: string }>;
  performance: { d1: number | null; d5: number | null; d10: number | null; all: number | null; points: number; last: number | null };
}

const money = (x: number) => `$${x.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const pct = (x: number | null) => (x === null ? "—" : `${(x * 100).toFixed(1)}%`);

export function PaperTradingPage(): JSX.Element {
  const { settings } = useAppStore();
  const zh = settings.language === "zh";
  const [universe, setUniverse] = useState<"bundled" | "large">("large");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [status, setStatus] = useState<StatusResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const post = async (route: string, extra: Record<string, unknown> = {}) => {
    const base = (settings.bridgeUrl || "http://127.0.0.1:8787").replace(/\/$/, "");
    const body = {
      universe,
      top: 8,
      key: settings.paperApiKey || undefined,
      secret: settings.paperApiSecret || undefined,
      ...extra
    };
    const res = await fetch(`${base}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(null);
    }
  };

  const doValidate = () => run("validate", async () => setValidation(await post("/paper/validate")));
  const doStatus = () => run("status", async () => setStatus(await post("/paper/status")));
  const doDeploy = (force: boolean) =>
    run("deploy", async () => {
      const r = await post("/paper/deploy", { force });
      setValidation(r.validation);
      if (r.blocked) {
        setNote(zh ? "未交易：策略未通过历史回测（可勾选强制覆盖）。" : "Not traded: the strategy failed the historical backtest (tick force to override).");
      } else {
        setNote(
          zh
            ? `已下单 ${r.orders?.length ?? 0} 笔到模拟账户（${r.regime?.riskOn ? "RISK-ON" : "RISK-OFF/现金"}）。点“刷新账户”查看。`
            : `Submitted ${r.orders?.length ?? 0} paper orders (${r.regime?.riskOn ? "RISK-ON" : "RISK-OFF / cash"}). Hit "Refresh account" to see them.`
        );
      }
      await doStatus();
    });

  const m = validation?.metrics;

  return (
    <div className="paper-page">
      <div className="page-heading">
        <div>
          <small>Alpaca paper · simulated money</small>
          <h1>{zh ? "模拟交易" : "Paper Trading"}</h1>
          <p>
            {zh
              ? "先在历史上回测策略，通过后才下单到你的 Alpaca 模拟账户，再看它最近 1 / 5 / 10 天是否真的赚钱。仅模拟盘。"
              : "Backtest a strategy on history, deploy it to your Alpaca paper account only if it passes, then watch whether it actually makes money over the past 1 / 5 / 10 days. Paper only."}
          </p>
        </div>
        <div className="universe-toggle">
          <button className={universe === "bundled" ? "active" : ""} onClick={() => setUniverse("bundled")}>
            {zh ? "内置 60 只" : "Bundled 60"}
          </button>
          <button className={universe === "large" ? "active" : ""} onClick={() => setUniverse("large")}>
            {zh ? "S&P500+纳指 513 只" : "S&P500+NDX 513"}
          </button>
        </div>
      </div>

      <div className="paper-actions">
        <button className="primary-button" onClick={doValidate} disabled={busy !== null}>
          {busy === "validate" ? "…" : zh ? "① 历史回测验证" : "① Validate on history"}
        </button>
        <button onClick={doStatus} disabled={busy !== null}>
          {busy === "status" ? "…" : zh ? "刷新账户" : "Refresh account"}
        </button>
        <button
          className="primary-button"
          onClick={() => doDeploy(false)}
          disabled={busy !== null || !validation?.passed}
          title={!validation?.passed ? (zh ? "需先通过历史回测" : "must pass the historical backtest first") : ""}
        >
          {busy === "deploy" ? "…" : zh ? "② 通过则下单" : "② Deploy if it passes"}
        </button>
      </div>

      {error && <div className="paper-error">⚠ {error}{" "}<span className="muted">{zh ? "（确认已运行 npm run dialogue-bridge，并在设置里填好 Paper 密钥）" : "(make sure the bridge is running and paper keys are set in Settings)"}</span></div>}
      {note && <div className="paper-note">{note}</div>}

      {validation && m && (
        <section className={`page-card paper-validation ${validation.passed ? "pass" : "fail"}`}>
          <div className="paper-verdict">
            {validation.passed ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
            <strong>
              {validation.passed
                ? zh ? "通过历史回测 — 可下单" : "PASSED the historical backtest — cleared to deploy"
                : zh ? "未通过 — 不建议交易" : "FAILED — not cleared to trade"}
            </strong>
            <span className="muted">{validation.universeSize} {zh ? "只" : "names"} · {validation.dataRange}</span>
          </div>
          {!validation.passed && <p className="paper-reasons">{validation.reasons.join(" · ")}</p>}
          <div className="paper-metrics">
            <div className={`pm ${m.oosSharpe > 0.8 ? "good" : ""}`}><small>OOS Sharpe</small><strong>{m.oosSharpe.toFixed(2)}</strong></div>
            <div className={`pm ${m.oosICt !== null && m.oosICt >= 1.5 ? "good" : ""}`}><small>OOS IC t</small><strong>{m.oosICt === null ? "—" : m.oosICt.toFixed(2)}</strong></div>
            <div className="pm"><small>{zh ? "扣费收益" : "ret/costs"}</small><strong>{pct(m.returnAfterCosts)}</strong></div>
            <div className="pm"><small>{zh ? "贬损 Sharpe" : "deflated"}</small><strong>{pct(m.deflatedSharpe)}</strong></div>
            <div className="pm"><small>{zh ? "前进检验" : "walk-fwd"}</small><strong>{pct(m.walkForwardPassRate)}</strong></div>
            <div className="pm"><small>{zh ? "最大回撤" : "max DD"}</small><strong>{pct(m.maxDrawdown)}</strong></div>
          </div>
          <div className="paper-targets">
            <span className={`regime-chip ${validation.regime.riskOn ? "on" : "off"}`}>
              {validation.regime.riskOn ? (zh ? "趋势 RISK-ON" : "RISK-ON") : (zh ? "趋势 RISK-OFF · 现金" : "RISK-OFF · cash")}
            </span>
            {validation.targets.length ? validation.targets.map((t) => <span key={t} className="target-chip">{t}</span>) : <span className="muted">{zh ? "（空仓）" : "(cash)"}</span>}
          </div>
        </section>
      )}

      {status && (
        <section className="page-card paper-account">
          <h2><Activity size={16} /> {zh ? "模拟账户" : "Paper account"} <span className="acct-status">{status.account.status}</span></h2>
          <div className="acct-row">
            <div className="acct-stat"><small>{zh ? "净值" : "equity"}</small><strong>{money(status.account.equity)}</strong></div>
            <div className="acct-stat"><small>{zh ? "现金" : "cash"}</small><strong>{money(status.account.cash)}</strong></div>
            <div className="acct-stat"><small>{zh ? "买力" : "buying power"}</small><strong>{money(status.account.buyingPower)}</strong></div>
          </div>

          <h3>{zh ? "最近表现（它好不好？）" : "Recent performance — is it working?"}</h3>
          <div className="perf-row">
            <div className={`perf-stat ${(status.performance.d1 ?? 0) >= 0 ? "up" : "down"}`}><small>1{zh ? "天" : "d"}</small><strong>{pct(status.performance.d1)}</strong></div>
            <div className={`perf-stat ${(status.performance.d5 ?? 0) >= 0 ? "up" : "down"}`}><small>5{zh ? "天" : "d"}</small><strong>{pct(status.performance.d5)}</strong></div>
            <div className={`perf-stat ${(status.performance.d10 ?? 0) >= 0 ? "up" : "down"}`}><small>10{zh ? "天" : "d"}</small><strong>{pct(status.performance.d10)}</strong></div>
            <div className={`perf-stat ${(status.performance.all ?? 0) >= 0 ? "up" : "down"}`}><small>{zh ? "全部" : "all"}</small><strong>{pct(status.performance.all)}</strong></div>
          </div>
          {status.performance.points < 2 && (
            <p className="muted">{zh ? "还没有足够的历史净值点——下单成交后，过几天再回来看 1/5/10 天表现。" : "Not enough equity history yet — once orders fill, come back in a few days for the 1/5/10-day read."}</p>
          )}

          {status.positions.length > 0 && (
            <>
              <h3>{zh ? "持仓" : "Positions"}</h3>
              <div className="pos-list">
                {status.positions.map((p) => (
                  <div className="pos-row" key={p.symbol}>
                    <strong>{p.symbol}</strong>
                    <span>{p.qty} {zh ? "股" : "sh"}</span>
                    <span>{money(p.marketValue)}</span>
                    <span className={p.unrealizedPl >= 0 ? "up" : "down"}>
                      {p.unrealizedPl >= 0 ? "+" : ""}{money(p.unrealizedPl)} ({pct(p.unrealizedPlpc)})
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
          {status.openOrders.length > 0 && (
            <p className="muted">{status.openOrders.length} {zh ? "笔挂单排队中（开盘成交）" : "open orders queued (fill at the open)"}: {status.openOrders.map((o) => o.symbol).join(", ")}</p>
          )}
        </section>
      )}

      <section className="page-card paper-safety">
        <ShieldCheck size={16} />
        <span>
          {zh
            ? "安全：只走 Alpaca 模拟端点（paper-api），没有真金白银路径；密钥只发给你本地的桥接器。"
            : "Safety: the paper endpoint (paper-api) only — no live-money path anywhere; keys go only to your local bridge."}
        </span>
      </section>
    </div>
  );
}
