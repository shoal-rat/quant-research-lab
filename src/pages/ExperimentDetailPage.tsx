import { ArrowLeft, Code2 } from "lucide-react";
import { navigate } from "../App";
import { DrawdownChart, EquityCurveChart } from "../components/Charts";
import { MetricCard } from "../components/MetricCard";
import { StatusBadge } from "../components/StatusBadge";
import { number, percent, shortDate } from "../components/format";
import { useAppStore } from "../store/AppStore";

export function ExperimentDetailPage({ id }: { id: string }): JSX.Element {
  const { experiments } = useAppStore();
  const experiment = experiments.find((item) => item.id === id);

  if (!experiment) {
    return (
      <div className="page-card">
        <button className="secondary-button" onClick={() => navigate("/history")}>
          <ArrowLeft size={16} /> Back to history
        </button>
        <h1>Experiment not found</h1>
      </div>
    );
  }
  const audit = experiment.workflowAudit;

  return (
    <div className="detail-page">
      <div className="page-heading">
        <button className="secondary-button" onClick={() => navigate("/office")}>
          <ArrowLeft size={16} /> Office
        </button>
        <div>
          <small>{experiment.id}</small>
          <h1>{experiment.strategyName}</h1>
          <p>{experiment.strategyHypothesis}</p>
        </div>
        <StatusBadge status={experiment.status} />
      </div>

      <div className="metric-grid">
        <MetricCard label="OOS Sharpe" value={number(experiment.outOfSampleResult.sharpeRatio)} hint="out-of-sample" />
        <MetricCard label="Return After Costs" value={percent(experiment.outOfSampleResult.returnAfterCosts)} />
        <MetricCard label="Max Drawdown" value={percent(experiment.outOfSampleResult.maxDrawdown)} />
        <MetricCard label="Turnover" value={percent(experiment.outOfSampleResult.turnover, 0)} />
        <MetricCard
          label="Deflated Sharpe"
          value={percent(experiment.outOfSampleResult.deflatedSharpe ?? 0.5, 0)}
          hint={`survives ${experiment.outOfSampleResult.trialsAtDiscovery ?? 1} trials`}
        />
        <MetricCard
          label="Pool Correlation"
          value={percent(experiment.outOfSampleResult.alphaPoolCorrelation ?? 0, 0)}
        />
        <MetricCard label="Robustness" value={number(experiment.outOfSampleResult.robustnessScore, 1)} />
        <MetricCard label="Overfitting Risk" value={number(experiment.outOfSampleResult.overfittingRiskScore, 1)} />
      </div>

      {experiment.ideaReasoning && experiment.ideaReasoning.length > 0 && (
        <section className="page-card">
          <h2>
            Idea Reasoning{" "}
            <small>
              {experiment.ideaMode === "refine"
                ? `refined from ${experiment.parentExperimentId ?? "a parent"} (gen ${experiment.generation})`
                : experiment.ideaMode === "boss_directive"
                  ? "steered by a boss directive"
                  : "fresh exploration"}
            </small>
          </h2>
          <ol className="reasoning-list">
            {experiment.ideaReasoning.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ol>
          {experiment.bossDirective && (
            <p className="boss-directive-note">Boss directive: “{experiment.bossDirective}”</p>
          )}
        </section>
      )}

      {audit && (
        <>
          <section className="page-card">
            <h2>Research Workflow 2.0</h2>
            <p>
              This experiment keeps the full idea audit: discovery card, signal compiler, source credibility, point-in-time
              contract, validation, operations, feature-store, paper-trading, baseline, and research-feed diagnostics.
            </p>
          </section>

          <section className="page-card">
            <h2>Discovery Card</h2>
            <div className="workflow-grid">
              <div className="workflow-item">
                <small>Phenomenon</small>
                <strong>{audit.discoveryCard.phenomenon}</strong>
                <span>{audit.discoveryCard.whyAlphaMayExist}</span>
              </div>
              <div className="workflow-item">
                <small>Tradable universe</small>
                <strong>{audit.discoveryCard.tradableUniverse}</strong>
                <span>{audit.discoveryCard.requiredData.join(", ")}</span>
              </div>
              <div className="workflow-item">
                <small>Signal compiler</small>
                <strong>{audit.compiledSignal.formula}</strong>
                <span>{audit.compiledSignal.lag} / {audit.compiledSignal.hold}</span>
              </div>
              <div className="workflow-item">
                <small>Novelty</small>
                <strong>{audit.novelty.verdict.replace("_", " ")}</strong>
                <span>{audit.novelty.notes.join(" ")}</span>
              </div>
            </div>
            {audit.credibility.sources.length > 0 && (
              <div className="source-list">
                {audit.credibility.sources.slice(0, 6).map((source, index) => (
                  <span key={`${source.title}-${index}`}>
                    {source.url ? (
                      <a href={source.url} target="_blank" rel="noreferrer noopener">{source.title}</a>
                    ) : (
                      source.title
                    )}{" "}
                    ({source.credibilityTier.replace("_", " ")})
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="content-grid two-cols">
            <article className="page-card">
              <h2>Validation</h2>
              <div className="risk-list">
                {audit.walkForward.windows.map((window) => (
                  <div key={window.testRange} className="risk-row">
                    <StatusBadge status={window.passed ? "pass" : "warn"} />
                    <div>
                      <strong>{window.testRange}</strong>
                      <span>Sharpe {number(window.testSharpe)} / return {percent(window.testReturn)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p>{audit.regimes.summary}</p>
            </article>
            <article className="page-card">
              <h2>Operations {audit.capacity.illustrative ? <span className="scaffold-tag">illustrative scaffold</span> : null}</h2>
              <dl className="kv-list">
                <div>
                  <dt>Capacity</dt>
                  <dd>
                    {audit.capacity.maxDeployableCapitalUsd === null
                      ? `n/a (${audit.capacity.bottleneck})`
                      : `$${(audit.capacity.maxDeployableCapitalUsd / 1_000_000).toFixed(0)}M / ${audit.capacity.bottleneck}`}
                  </dd>
                </div>
                <div><dt>Impact</dt><dd>{number(audit.capacity.marketImpactBps, 1)} bps</dd></div>
                <div><dt>Slippage</dt><dd>{number(audit.execution.slippageBps, 1)} bps</dd></div>
                <div><dt>Partial fills</dt><dd>{percent(audit.execution.partialFillRate, 0)}</dd></div>
                <div><dt>Decay</dt><dd>{audit.alphaDecay.summary}</dd></div>
                {audit.capacity.illustrative ? (
                  <div><dt>Basis</dt><dd className="muted">{audit.capacity.basis}</dd></div>
                ) : null}
              </dl>
            </article>
          </section>

          <section className="content-grid three-cols">
            <article className="page-card">
              <h2>Point-in-Time Layer</h2>
              <p>{audit.pointInTime.asOfPolicy}</p>
              <ul className="compact-list">
                {audit.pointInTime.leakChecks.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
            <article className="page-card">
              <h2>Feature Store</h2>
              <dl className="kv-list">
                <div><dt>Feature</dt><dd>{audit.feature.featureName}</dd></div>
                <div><dt>Coverage</dt><dd>{percent(audit.feature.coverage, 0)}</dd></div>
                <div><dt>Missing</dt><dd>{percent(audit.feature.missingRate, 0)}</dd></div>
                <div><dt>Lookahead</dt><dd>{audit.feature.lookaheadRisk}</dd></div>
              </dl>
            </article>
            <article className="page-card">
              <h2>Paper Trading</h2>
              <p>{audit.paperTrading.notes}</p>
              <strong className="section-conclusion">{audit.paperTrading.status} from {audit.paperTrading.startDate}</strong>
            </article>
          </section>

          <section className="content-grid two-cols">
            <article className="page-card">
              <h2>Baselines</h2>
              <div className="risk-list">
                {audit.baselines.map((baseline) => (
                  <div key={baseline.baseline} className="risk-row">
                    <StatusBadge status={baseline.passed ? "pass" : "warn"} />
                    <div>
                      <strong>{baseline.baseline.replaceAll("_", " ")}</strong>
                      <span>Sharpe {number(baseline.sharpe)} / excess {number(baseline.excessSharpe)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </article>
            <article className="page-card">
              <h2>Research Feed</h2>
              <div className="debate-list">
                {audit.researchFeed.map((event) => (
                  <blockquote key={event.id}>
                    <strong>{event.agent} {event.action}</strong>
                    <span>{event.detail}</span>
                  </blockquote>
                ))}
              </div>
            </article>
          </section>
        </>
      )}

      <section className="content-grid two-cols">
        <article className="page-card wide">
          <h2>Equity Curve</h2>
          <EquityCurveChart data={experiment.equityCurve} />
        </article>
        <article className="page-card">
          <h2>Drawdown</h2>
          <DrawdownChart data={experiment.equityCurve} />
          <div className="split-summary">
            <span>In-sample Sharpe <strong>{number(experiment.inSampleResult.sharpeRatio)}</strong></span>
            <span>Out-of-sample Sharpe <strong>{number(experiment.outOfSampleResult.sharpeRatio)}</strong></span>
          </div>
        </article>
      </section>

      <section className="content-grid three-cols">
        <article className="page-card">
          <h2>Data Used</h2>
          <p>{experiment.dataUsed}</p>
          <dl className="kv-list">
            <div><dt>Range</dt><dd>{experiment.dataRange}</dd></div>
            <div><dt>Holding</dt><dd>{experiment.backtestParameters.holdingPeriod} day</dd></div>
            <div><dt>Portfolio</dt><dd>{experiment.backtestParameters.portfolioType.replace("_", "-")}</dd></div>
            <div><dt>Cost</dt><dd>{experiment.backtestParameters.transactionCostBps} bps</dd></div>
            <div><dt>Created</dt><dd>{shortDate(experiment.createdAt)}</dd></div>
          </dl>
        </article>
        <article className="page-card">
          <h2>Factor Logic</h2>
          <p>{experiment.factorLogic}</p>
          <button className="secondary-button" onClick={() => navigator.clipboard?.writeText(experiment.generatedCode)}>
            <Code2 size={15} /> Copy simulated code
          </button>
        </article>
        <article className="page-card">
          <h2>Decision</h2>
          <p>{experiment.managerDecision}</p>
          <strong className="section-conclusion">{experiment.nextIterationSuggestion}</strong>
        </article>
      </section>

      <section className="content-grid two-cols">
        <article className="page-card">
          <h2>Risk Review</h2>
          <div className="risk-list">
            {experiment.riskReview.checks.map((check) => (
              <div key={check.id} className="risk-row">
                <StatusBadge status={check.status} />
                <div>
                  <strong>{check.label}</strong>
                  <span>{check.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </article>
        <article className="page-card">
          <h2>Debate</h2>
          <div className="debate-list">
            {experiment.debate.map((line) => (
              <blockquote key={`${line.role}-${line.message}`}>
                <strong>{line.speaker}</strong>
                <span>{line.message}</span>
              </blockquote>
            ))}
          </div>
          <h3>Skeptic objection</h3>
          <p>{experiment.skepticObjection}</p>
        </article>
      </section>

      <details className="code-details">
        <summary>Generated simulated strategy code</summary>
        <pre>{experiment.generatedCode}</pre>
      </details>
    </div>
  );
}
