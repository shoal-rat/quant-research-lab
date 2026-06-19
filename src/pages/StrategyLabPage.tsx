import { useMemo, useState } from "react";
import { Crown, FlaskConical, Microscope, Sparkles, TrendingUp } from "lucide-react";
import { useAppStore } from "../store/AppStore";
import { getAllFamilies, StrategyFamily } from "../engines/strategyKnowledge";
import { navigate } from "../App";

// The Strategy Lab: click any strategy to see HOW its signal is derived (a vivid
// phenomenon -> signal -> neutralize -> rank -> hold pipeline), its measured edge,
// and a boss-command box to change the logic — a directive the desk acts on.
export function StrategyLabPage(): JSX.Element {
  const { experiments, settings, sendBossDirective, cliStatus, nextIteration } = useAppStore();
  const zh = settings.language === "zh";
  const families = useMemo(() => getAllFamilies(), []);
  const [selectedKey, setSelectedKey] = useState<string>(families[0]?.key ?? "");
  const [command, setCommand] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  const family = families.find((f) => f.key === selectedKey) ?? families[0];

  // latest backtested experiment for this family (for the measured edge)
  const stat = useMemo(() => {
    const runs = experiments.filter((e) => e.familyKey === family?.key && !e.synthetic);
    const latest = runs[runs.length - 1];
    if (!latest) return null;
    return {
      oosSharpe: latest.outOfSampleResult.sharpeRatio,
      oosICt: latest.factorAnalyticsOOS?.icTStat ?? null,
      ret: latest.outOfSampleResult.returnAfterCosts,
      status: latest.status
    };
  }, [experiments, family?.key]);

  if (!family) return <div className="page-card">{zh ? "暂无策略" : "No strategies yet."}</div>;

  const isTimeSeries = family.key === "seasonality" || family.key === "trend_overlay";
  // cross-sectional families CAN run long/short in the backtest engine; the paper
  // deploy book is long-only top-N. We label "capable" so the tag never overstates
  // the actually-traded portfolio. (No per-family long/short-only flag exists.)
  const longShortCapable = !isTimeSeries;

  const issue = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const directive = `${zh ? "改造策略" : "Refine strategy"} "${family.name}": ${trimmed}`;
    sendBossDirective(directive);
    setSent(directive);
    setCommand("");
    if (cliStatus.connected) nextIteration();
  };

  const quickCommands = zh
    ? ["改成行业中性", "缩短回看窗口", "加一个波动率过滤", "拉长持有期", "只做多头"]
    : ["Make it sector-neutral", "Shorten the lookback", "Add a volatility filter", "Lengthen the holding period", "Long-only version"];

  // the derivation pipeline stages, specialized to this family
  const stages = [
    {
      icon: <Sparkles size={16} />,
      title: zh ? "现象" : "Phenomenon",
      detail: family.rationale,
      tag: family.rationaleKind
    },
    {
      icon: <Microscope size={16} />,
      title: zh ? "信号" : "Signal",
      detail: family.signalSpec ?? family.construction,
      tag: family.factorKind.replaceAll("_", " ")
    },
    {
      icon: <FlaskConical size={16} />,
      title: zh ? "中性化" : "Neutralize",
      detail: isTimeSeries
        ? zh
          ? "时序择时信号，不做横截面中性化"
          : "Time-series timing signal — no cross-sectional neutralization"
        : zh
          ? "去极值 + 行业去均值 + 对 beta 回归取残差"
          : "Winsorize + sector-demean + residualize on market beta",
      tag: isTimeSeries ? "n/a" : "cross-sectional"
    },
    {
      icon: <TrendingUp size={16} />,
      title: zh ? "排序 → 组合" : "Rank → Portfolio",
      detail: isTimeSeries
        ? zh
          ? "信号为正则等权持有，否则空仓"
          : "Equal-weight when the signal is on, else flat"
        : zh
          ? "回测里按信号排序做多前 30% / 做空后 30%；模拟下单则只做多头部 N 只"
          : "Backtest ranks long top 30% / short bottom 30%; the paper book is long-only top-N",
      tag: longShortCapable ? "long / short capable" : "long only"
    },
    {
      icon: <Crown size={16} />,
      title: zh ? "持有 + 成本" : "Hold + costs",
      detail: zh
        ? `每 ${family.holdingPeriods.join("/")} 个交易日再平衡，按换手计交易成本`
        : `Rebalance every ${family.holdingPeriods.join("/")} trading bars, costs charged on turnover`,
      tag: `${family.costSensitivity} cost`
    }
  ];

  return (
    <div className="strategy-lab">
      <aside className="strat-list">
        <div className="strat-list-head">
          <strong>{zh ? "策略库" : "Strategy library"}</strong>
          <small>{families.length}</small>
        </div>
        {families.map((f) => (
          <button
            key={f.key}
            className={`strat-list-item ${f.key === selectedKey ? "active" : ""}`}
            onClick={() => setSelectedKey(f.key)}
          >
            <span className={`kind-dot kind-${f.factorKind}`} />
            <span className="strat-list-text">
              <strong>{f.name}</strong>
              <small>{f.factorKind.replaceAll("_", " ")}{f.origin === "researched" ? (zh ? " · 网络发现" : " · web-found") : ""}</small>
            </span>
          </button>
        ))}
      </aside>

      <section className="strat-detail">
        <header className="strat-detail-head">
          <div>
            <span className={`kind-chip kind-${family.factorKind}`}>{family.factorKind.replaceAll("_", " ")}</span>
            <h1>{family.name}</h1>
          </div>
          {stat ? (
            <div className="strat-edge">
              <div className={`edge-stat ${stat.oosSharpe > 0.8 ? "good" : ""}`}>
                <small>OOS Sharpe</small>
                <strong>{stat.oosSharpe.toFixed(2)}</strong>
              </div>
              <div className={`edge-stat ${stat.oosICt !== null && stat.oosICt >= 1.5 ? "good" : ""}`}>
                <small>OOS IC t</small>
                <strong>{stat.oosICt === null ? "—" : stat.oosICt.toFixed(2)}</strong>
              </div>
              <div className="edge-stat">
                <small>{zh ? "状态" : "status"}</small>
                <strong>{stat.status}</strong>
              </div>
            </div>
          ) : (
            <div className="strat-edge"><div className="edge-stat"><small>{zh ? "尚未回测" : "not yet backtested"}</small><strong>—</strong></div></div>
          )}
        </header>

        {/* vivid derivation pipeline */}
        <div className="strat-pipeline" aria-label="signal derivation">
          {stages.map((s, i) => (
            <div className="pipe-node" key={s.title} style={{ animationDelay: `${i * 90}ms` }}>
              <div className="pipe-node-head">
                <span className="pipe-icon">{s.icon}</span>
                <strong>{s.title}</strong>
                <span className="pipe-tag">{s.tag}</span>
              </div>
              <p>{s.detail}</p>
              {i < stages.length - 1 && <span className="pipe-arrow">→</span>}
            </div>
          ))}
        </div>

        <div className="strat-grid">
          <article className="strat-card">
            <h3>{zh ? "为什么可能有 α" : "Why alpha may exist"}</h3>
            <p>{family.rationale}</p>
            {family.keyPapers && family.keyPapers.length > 0 && (
              <p className="strat-papers">
                {zh ? "文献：" : "Papers: "}
                {(family.references && family.references.length ? family.references : family.keyPapers).map((ref, i) => {
                  const isUrl = /^https?:\/\//.test(ref);
                  return isUrl ? (
                    <a key={i} href={ref} target="_blank" rel="noreferrer">[{i + 1}]</a>
                  ) : (
                    <span key={i} className="paper-ref">{ref}</span>
                  );
                })}
              </p>
            )}
          </article>
          <article className="strat-card">
            <h3>{zh ? "参数" : "Parameters"}</h3>
            <div className="param-chips">
              {family.parameters.map((p) => (
                <span className="param-chip" key={p.name}>
                  {p.name} <strong>{p.default}</strong>
                  <small> [{p.min}–{p.max}]</small>
                </span>
              ))}
            </div>
          </article>
          <article className="strat-card">
            <h3>{zh ? "失效风险" : "How it fails"}</h3>
            <ul className="strat-fails">
              {family.failureModes.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </article>
        </div>

        {/* boss command: change the strategy */}
        <div className="strat-command">
          <div className="strat-command-head">
            <Crown size={16} />
            <strong>{zh ? "老板指令：改造这条策略" : "Boss command: change this strategy"}</strong>
          </div>
          <p className="board-hint">
            {zh
              ? "用一句话告诉研究台怎么改这条逻辑——它会作为指令进入研究循环，生成一个改良版本。"
              : "Tell the desk in one line how to change this logic — it becomes a directive the research loop acts on to produce a refined version."}
          </p>
          <div className="quick-commands">
            {quickCommands.map((q) => (
              <button key={q} className="quick-command" onClick={() => issue(q)}>
                {q}
              </button>
            ))}
          </div>
          <div className="strat-command-input">
            <textarea
              value={command}
              placeholder={zh ? "例如：把回看从 120 天改成 60 天，并加入低波动率过滤" : "e.g. cut the lookback from 120 to 60 days and add a low-volatility filter"}
              onChange={(e) => setCommand(e.target.value)}
              rows={2}
            />
            <button className="primary-button" onClick={() => issue(command)} disabled={!command.trim()}>
              {zh ? "下达指令" : "Issue command"}
            </button>
          </div>
          {sent && (
            <p className="strat-sent">
              {zh ? "已下达：" : "Issued: "}<em>{sent}</em>
              {cliStatus.connected
                ? zh ? " — 研究台正在执行。" : " — the desk is working on it."
                : zh ? " — 连接 CLI 后于下一轮生效。" : " — applies on the next run once a CLI is connected."}
              {" "}
              <button className="link-button" onClick={() => navigate("/board")}>{zh ? "查看看板" : "open board"}</button>
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
