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
