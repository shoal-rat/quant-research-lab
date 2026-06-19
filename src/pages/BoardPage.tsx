import { useMemo } from "react";
import { armPosteriors } from "../engines/banditEngine";
import { ACHIEVEMENTS } from "../engines/progression";
import { buildArchive, computePbo, poolEquitySeries, poolSharpe } from "../engines/poolAnalytics";
import { getAllFamilies, getFamily } from "../engines/strategyKnowledge";
import { number, percent } from "../components/format";
import { useAppStore } from "../store/AppStore";

// The fund & research board: virtual fund stats, the MAP-Elites niche
// archive, the direction bandit's posteriors, the desk PBO, and trophies.
export function BoardPage(): JSX.Element {
  const { experiments, settings, bossLevel, fundValue, unlockedAchievements, discoveredFamilies } = useAppStore();
  const zh = settings.language === "zh";

  const candidates = useMemo(() => experiments.filter((experiment) => experiment.status === "candidate"), [experiments]);
  const archive = useMemo(() => buildArchive(experiments), [experiments]);
  const posteriors = useMemo(() => armPosteriors(experiments), [experiments]);
  const pbo = useMemo(() => computePbo(experiments), [experiments]);
  const equity = useMemo(() => poolEquitySeries(candidates), [candidates]);
  const fundSharpe = useMemo(() => poolSharpe(candidates), [candidates]);
  const latestAudit = useMemo(() => experiments.slice().reverse().find((experiment) => experiment.workflowAudit)?.workflowAudit, [experiments]);

  const holdingBuckets = ["fast", "weekly", "monthly"] as const;
  const riskBuckets = ["calm", "normal", "wild"] as const;
  const familiesWithData = getAllFamilies().filter((family) =>
    experiments.some((experiment) => experiment.familyKey === family.key)
  );
  const discovered = discoveredFamilies;
  // newest experiment that carries an Alphalens-style signal evaluation
  const latestFactor = useMemo(() => {
    for (let i = experiments.length - 1; i >= 0; i -= 1) {
      const e = experiments[i];
      if (e.factorAnalytics) return { fa: e.factorAnalytics, oos: e.outOfSampleResult, name: e.strategyName };
    }
    return null;
  }, [experiments]);

  const sparkline = useMemo(() => {
    if (equity.length < 2) return "";
    const min = Math.min(...equity);
    const max = Math.max(...equity);
    const span = Math.max(1e-6, max - min);
    return equity
      .map((value, index) => `${((index / (equity.length - 1)) * 280).toFixed(1)},${(60 - ((value - min) / span) * 56).toFixed(1)}`)
      .join(" ");
  }, [equity]);

  const armLabels: Record<string, string> = zh
    ? { explore: "探索", refine: "精修", repair: "修复", recombine: "杂交" }
    : { explore: "explore", refine: "refine", repair: "repair", recombine: "recombine" };

  return (
    <div className="board-page">
      <section className="page-card board-fund">
        <div>
          <small>{zh ? "虚拟基金" : "Virtual fund"}</small>
          <h2>${(fundValue / 1_000_000).toFixed(2)}M</h2>
          <p>
            {zh
              ? `候选池 ${candidates.length} 个策略 · 组合 Sharpe ${number(fundSharpe)} · 老板等级 Lv.${bossLevel.level} ${bossLevel.title.zh}`
              : `${candidates.length} strategies in the pool · combined Sharpe ${number(fundSharpe)} · Boss Lv.${bossLevel.level} ${bossLevel.title.en}`}
          </p>
        </div>
        {sparkline && (
          <svg width="290" height="64" viewBox="0 0 290 64" aria-label="pool equity">
            <polyline points={sparkline} fill="none" stroke="var(--teal)" strokeWidth="2.4" strokeLinejoin="round" />
          </svg>
        )}
      </section>

      {latestAudit && (
        <section className="page-card">
          <h2>{zh ? "研究工作流 2.0" : "Research Workflow 2.0"}</h2>
          <p className="board-hint">
            {zh
              ? "最新实验的发现卡、信号编译、可信度、新颖性、走样本、容量、执行和纸上交易状态。"
              : "Latest experiment audit: discovery card, signal compiler, credibility, novelty, walk-forward, capacity, execution, and paper trading."}
          </p>
          <div className="workflow-grid">
            <div className="workflow-item">
              <small>Discovery</small>
              <strong>{latestAudit.discoveryCard.phenomenon}</strong>
              <span>{latestAudit.discoveryCard.timestampLag} lag / {latestAudit.discoveryCard.holdingPeriod}</span>
            </div>
            <div className="workflow-item">
              <small>Signal compiler</small>
              <strong>{latestAudit.compiledSignal.portfolio.replace("_", "-")}</strong>
              <span>{latestAudit.compiledSignal.rank}</span>
            </div>
            <div className="workflow-item">
              <small>Credibility</small>
              <strong>{percent(latestAudit.credibility.score, 0)}</strong>
              <span>{latestAudit.credibility.tier.replace("_", " ")}</span>
            </div>
            <div className="workflow-item">
              <small>Novelty</small>
              <strong>{latestAudit.novelty.verdict.replace("_", " ")}</strong>
              <span>nearest: {latestAudit.novelty.nearestKnownFactor}</span>
            </div>
            <div className="workflow-item">
              <small>Walk-forward</small>
              <strong>{percent(latestAudit.walkForward.passRate, 0)}</strong>
              <span>worst Sharpe {number(latestAudit.walkForward.worstSharpe)}</span>
            </div>
            <div className="workflow-item">
              <small>Capacity{latestAudit.capacity.illustrative ? " (illustrative)" : ""}</small>
              <strong>
                {latestAudit.capacity.maxDeployableCapitalUsd === null
                  ? "n/a"
                  : `$${(latestAudit.capacity.maxDeployableCapitalUsd / 1_000_000).toFixed(0)}M`}
              </strong>
              <span>{latestAudit.capacity.bottleneck}</span>
            </div>
            <div className="workflow-item">
              <small>Execution</small>
              <strong>{number(latestAudit.execution.slippageBps, 1)} bps</strong>
              <span>{latestAudit.execution.summary}</span>
            </div>
            <div className="workflow-item">
              <small>Paper trading</small>
              <strong>{latestAudit.paperTrading.status}</strong>
              <span>{latestAudit.paperTrading.notes}</span>
            </div>
          </div>
        </section>
      )}

      <section className="page-card">
        <h2>{zh ? "生态位档案（MAP-Elites）" : "Niche archive (MAP-Elites)"}</h2>
        <p className="board-hint">
          {zh
            ? "家族 × 持仓周期 × 风险档。每格保留该生态位最强的策略；空格就是下一个探索方向。"
            : "Family × holding × risk bucket. Each cell keeps the niche's best strategy; empty cells are where exploration goes next."}
        </p>
        <div className="niche-grid">
          <div className="niche-row niche-head">
            <span>{zh ? "家族" : "Family"}</span>
            {holdingBuckets.map((holding) =>
              riskBuckets.map((risk) => (
                <span key={`${holding}-${risk}`} title={`${holding} / ${risk}`}>
                  {holding[0].toUpperCase()}
                  {risk[0].toUpperCase()}
                </span>
              ))
            )}
          </div>
          {familiesWithData.map((family) => (
            <div className="niche-row" key={family.key}>
              <span className="niche-family" title={family.name}>
                {family.name}
              </span>
              {holdingBuckets.map((holding) =>
                riskBuckets.map((risk) => {
                  const niche = archive.get(`${family.key}|${holding}|${risk}`);
                  const best = niche?.best;
                  return (
                    <span
                      key={`${family.key}-${holding}-${risk}`}
                      className={`niche-cell ${best ? "filled" : niche ? "tried" : ""}`}
                      title={
                        best
                          ? `${best.strategyName} · Sharpe ${best.outOfSampleResult.sharpeRatio}`
                          : niche
                            ? `${niche.attempts} ${zh ? "次尝试，无晋升" : "attempts, none promoted"}`
                            : zh
                              ? "未探索"
                              : "unexplored"
                      }
                    >
                      {best ? number(best.outOfSampleResult.sharpeRatio) : niche ? "·" : ""}
                    </span>
                  );
                })
              )}
            </div>
          ))}
        </div>
      </section>

      {latestFactor && (
        <section className="page-card">
          <h2>{zh ? "信号质量（Alphalens 风格）" : "Signal quality (Alphalens-style)"}</h2>
          <p className="board-hint">
            {zh
              ? `评估的是原始信号本身（不只是组合）：信息系数 IC = 每期信号排名与未来收益排名的相关性。最近：${latestFactor.name}`
              : `Grades the raw signal itself, not just the portfolio: Information Coefficient (IC) = per-period rank correlation of the signal with forward returns. Latest: ${latestFactor.name}`}
          </p>
          <div className="factor-grid">
            <div className="factor-stat">
              <small>IC mean</small>
              <strong className={latestFactor.fa.icMean > 0.02 ? "good" : latestFactor.fa.icMean < -0.02 ? "bad" : ""}>
                {latestFactor.fa.icMean.toFixed(3)}
              </strong>
            </div>
            <div className="factor-stat">
              <small>IC-IR</small>
              <strong className={latestFactor.fa.icIR > 0.3 ? "good" : ""}>{latestFactor.fa.icIR.toFixed(2)}</strong>
            </div>
            <div className="factor-stat">
              <small>IC t-stat</small>
              <strong className={Math.abs(latestFactor.fa.icTStat) > 2 ? "good" : ""}>{latestFactor.fa.icTStat.toFixed(1)}</strong>
            </div>
            <div className="factor-stat">
              <small>{zh ? "分位单调" : "monotonic"}</small>
              <strong className={latestFactor.fa.quantileMonotonic ? "good" : "bad"}>
                {latestFactor.fa.quantileMonotonic ? (zh ? "是" : "yes") : zh ? "否" : "no"}
              </strong>
            </div>
            <div className="factor-stat">
              <small>{zh ? "分位价差" : "Q-spread"}</small>
              <strong>{percent(latestFactor.fa.quantileSpread, 2)}</strong>
            </div>
            <div className="factor-stat">
              <small>Sortino</small>
              <strong>{(latestFactor.oos.sortino ?? 0).toFixed(2)}</strong>
            </div>
            <div className="factor-stat">
              <small>Calmar</small>
              <strong>{(latestFactor.oos.calmar ?? 0).toFixed(2)}</strong>
            </div>
            <div className="factor-stat">
              <small>PSR</small>
              <strong className={(latestFactor.oos.probabilisticSharpe ?? 0) > 0.95 ? "good" : ""}>
                {percent(latestFactor.oos.probabilisticSharpe ?? 0, 0)}
              </strong>
            </div>
          </div>
          <p className="board-hint">
            {zh ? "IC 衰减（按持有周期，单位 bar）：" : "IC decay (by horizon, bars): "}
            {latestFactor.fa.icDecay.map((d) => `${d.horizon}d ${d.ic.toFixed(3)}`).join(" · ")}
            {" — "}
            {zh
              ? "IC-IR>0.3 不错、>0.5 优秀；|t|>2 才可信。"
              : "IC-IR>0.3 decent, >0.5 strong; |t|>2 to be credible."}
          </p>
        </section>
      )}

      {discovered.length > 0 && (
        <section className="page-card">
          <h2>{zh ? "已发现的策略（智能体研究）" : "Discovered strategies (agent research)"}</h2>
          <p className="board-hint">
            {zh
              ? "智能体从论文 / 新闻 / 机构报告里读来的新家族，已加入知识库，桥接模式下的回测内核会自动实现它们。"
              : "New families the agent read out of papers / news / institution reports — added to the knowledge base, and the bridge kernel implements them automatically."}
          </p>
          <div className="discovered-list">
            {discovered.map((family) => (
              <div className="discovered-item" key={family.key}>
                <div className="discovered-head">
                  <strong>{family.name}</strong>
                  <span className="discovered-tag">{family.factorKind.replaceAll("_", " ")}</span>
                </div>
                <p>{family.rationale}</p>
                {family.references && family.references.length > 0 && (
                  <div className="discovered-refs">
                    {family.references.slice(0, 4).map((ref, index) => {
                      const url = /^https?:\/\//.test(ref);
                      return url ? (
                        <a key={index} href={ref} target="_blank" rel="noreferrer noopener">
                          {ref.replace(/^https?:\/\/(www\.)?/, "").slice(0, 42)}
                        </a>
                      ) : (
                        <span key={index}>{ref.slice(0, 60)}</span>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="content-grid two-cols">
        <section className="page-card">
          <h2>{zh ? "方向老虎机（Thompson 采样）" : "Direction bandit (Thompson sampling)"}</h2>
          <div className="bandit-list">
            {posteriors.map((posterior) => (
              <div key={posterior.arm} className="bandit-row">
                <strong>{armLabels[posterior.arm]}</strong>
                <span>
                  {posterior.pulls} {zh ? "次拉杆" : "pulls"} · {zh ? "平均奖励" : "mean reward"}{" "}
                  {posterior.mean.toFixed(3)}
                </span>
                <div className="bandit-bar">
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(2, (posterior.mean + 0.1) * 320))}%`,
                      background: posterior.mean >= 0 ? "var(--teal)" : "var(--danger)"
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="board-hint">
            {zh
              ? "奖励 = 实验给候选池带来的 Sharpe 增量（池级 ΔSharpe）。"
              : "Reward = the pool-level ΔSharpe each experiment delivered to the candidate pool."}
          </p>
        </section>

        <section className="page-card">
          <h2>{zh ? "回测过拟合概率（CSCV）" : "Backtest overfitting (CSCV PBO)"}</h2>
          {pbo ? (
            <>
              <div className={`pbo-number ${pbo.pbo > 0.5 ? "bad" : pbo.pbo > 0.2 ? "warn" : "good"}`}>
                {percent(pbo.pbo, 0)}
              </div>
              <p className="board-hint">
                {zh
                  ? `基于最近 ${pbo.trialsUsed} 次真实数据试验、${pbo.combosUsed} 种时间块组合：样本内冠军在样本外跌出中位数的概率。超过 50% 说明全桌在挖噪音。`
                  : `Across the last ${pbo.trialsUsed} real-data trials and ${pbo.combosUsed} time-block splits: how often the in-sample winner falls below the out-of-sample median. Above 50% means the desk is mining noise.`}
              </p>
            </>
          ) : (
            <p className="board-hint">
              {zh
                ? "需要至少 5 个真实数据实验才能计算。让循环多跑几轮。"
                : "Needs at least 5 real-data experiments. Let the loop run a few more rounds."}
            </p>
          )}
        </section>
      </div>

      <section className="page-card">
        <h2>{zh ? "成就" : "Achievements"}</h2>
        <div className="achievement-grid">
          {ACHIEVEMENTS.map((achievement) => {
            const unlocked = Boolean(unlockedAchievements[achievement.id]);
            return (
              <div key={achievement.id} className={`achievement ${unlocked ? "unlocked" : ""}`}>
                <span className="achievement-icon">{achievement.icon}</span>
                <strong>{zh ? achievement.name.zh : achievement.name.en}</strong>
                <small>{zh ? achievement.detail.zh : achievement.detail.en}</small>
              </div>
            );
          })}
        </div>
      </section>

      <p className="board-hint">
        {zh
          ? `数据：${experiments.find((experiment) => experiment.dataSource === "real") ? "真实 20 年日线（Yahoo 调整收盘价）" : "确定性模拟"} · ${getFamily("xs_momentum").keyPapers[0]} 等文献先验`
          : `Data: ${experiments.find((experiment) => experiment.dataSource === "real") ? "real 20y dailies (Yahoo adjusted closes)" : "deterministic simulation"} · priors cite ${getFamily("xs_momentum").keyPapers[0]} and friends`}
      </p>
    </div>
  );
}
