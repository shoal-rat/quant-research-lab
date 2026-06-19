import { BacktestResult, ExperimentStatus, RiskCheck, RiskReview, StrategySpec } from "../types";
import { getFamily } from "./strategyKnowledge";

function check(id: string, label: string, status: RiskCheck["status"], detail: string): RiskCheck {
  return { id, label, status, detail };
}

export function reviewBacktestRisk(strategy: StrategySpec, backtest: BacktestResult): RiskReview {
  const is = backtest.inSample;
  const oos = backtest.outOfSample;
  const family = getFamily(strategy.familyKey);
  const checks: RiskCheck[] = [];

  checks.push(
    check(
      "lookahead",
      "Possible lookahead bias",
      strategy.parameters.timestampLagHours === 0 ? "fail" : strategy.factorKind === "event_drift" ? "pass" : "warn",
      strategy.factorKind === "event_drift"
        ? "Event headlines are lagged before signal generation."
        : "Mock adapter flags this for timestamp audit before real data integration."
    )
  );

  checks.push(
    check(
      "year_dependency",
      "Excessive dependence on one year",
      oos.yearDependencyScore > 0.68 ? "fail" : oos.yearDependencyScore > 0.48 ? "warn" : "pass",
      `Year dependency score is ${(oos.yearDependencyScore * 100).toFixed(0)}%.`
    )
  );

  checks.push(
    check(
      "stock_concentration",
      "Excessive dependence on a few stocks",
      oos.concentrationScore > 0.72 ? "fail" : oos.concentrationScore > 0.52 ? "warn" : "pass",
      `Concentration score is ${(oos.concentrationScore * 100).toFixed(0)}%.`
    )
  );

  checks.push(
    check(
      "transaction_costs",
      "Failure after transaction costs",
      oos.returnAfterCosts < 0 ? "fail" : oos.returnAfterCosts < is.cumulativeReturn * 0.28 ? "warn" : "pass",
      `Out-of-sample after-cost return is ${(oos.returnAfterCosts * 100).toFixed(1)}%.`
    )
  );

  checks.push(
    check(
      "oos_degradation",
      "Out-of-sample degradation",
      oos.sharpeRatio < is.sharpeRatio * 0.4 ? "fail" : oos.sharpeRatio < is.sharpeRatio * 0.65 ? "warn" : "pass",
      `In-sample Sharpe ${is.sharpeRatio.toFixed(2)} vs out-of-sample ${oos.sharpeRatio.toFixed(2)}.`
    )
  );

  checks.push(
    check(
      "turnover",
      "Excessive turnover",
      oos.turnover > 0.9 ? "fail" : oos.turnover > 0.68 ? "warn" : "pass",
      `Average turnover is ${(oos.turnover * 100).toFixed(0)}% per rebalance.`
    )
  );

  checks.push(
    check(
      "drawdown",
      "Excessive maximum drawdown",
      oos.maxDrawdown < -0.28 ? "fail" : oos.maxDrawdown < -0.18 ? "warn" : "pass",
      `Out-of-sample max drawdown is ${(oos.maxDrawdown * 100).toFixed(1)}%.`
    )
  );

  checks.push(
    check(
      "random_baseline",
      "Comparison against random baseline",
      // abstain (warn) when the baseline was not actually simulated, so a sentinel 0
      // can never silently satisfy "beat random" on the bridge/agent path
      oos.randomBaselineMeasured === false
        ? "warn"
        : oos.sharpeRatio < oos.randomBaselineSharpe + 0.2
          ? "fail"
          : oos.sharpeRatio < oos.randomBaselineSharpe + 0.55
            ? "warn"
            : "pass",
      oos.randomBaselineMeasured === false
        ? "Random-rank baseline not measurable on this path (return series only); check abstains rather than passing on an assumed 0."
        : `Measured random-rank baseline Sharpe is ${oos.randomBaselineSharpe.toFixed(2)}.`
    )
  );

  checks.push(
    check(
      "deflated_sharpe",
      "Deflated Sharpe after multiple testing",
      oos.deflatedSharpe < 0.5 ? "fail" : oos.deflatedSharpe < 0.8 ? "warn" : "pass",
      `Probability the Sharpe survives ${oos.trialsAtDiscovery} family trials is ${(oos.deflatedSharpe * 100).toFixed(0)}% (Bailey-Lopez de Prado).`
    )
  );

  checks.push(
    check(
      "alpha_pool_correlation",
      "Correlation with existing alpha pool",
      oos.alphaPoolCorrelation > 0.7 ? "fail" : oos.alphaPoolCorrelation > 0.5 ? "warn" : "pass",
      `Max correlation with promoted candidates is ${(oos.alphaPoolCorrelation * 100).toFixed(0)}%.`
    )
  );

  const credibilityScore = family.sourceCredibility?.score ?? (family.origin === "researched" ? 0.55 : 0.82);
  checks.push(
    check(
      "source_credibility",
      "Source credibility",
      credibilityScore < 0.35 ? "fail" : credibilityScore < 0.58 ? "warn" : "pass",
      `Average attached source credibility is ${(credibilityScore * 100).toFixed(0)}%.`
    )
  );

  checks.push(
    check(
      "point_in_time_data",
      "Point-in-time data contract",
      strategy.parameters.timestampLagHours === 0 ? "fail" : family.newsDriven || family.factorKind === "earnings_revision" ? "warn" : "pass",
      family.newsDriven || family.factorKind === "earnings_revision"
        ? "External event data requires explicit vendor availability timestamps before production use."
        : "Price-derived signal uses t to t+1 alignment with no same-bar return use."
    )
  );

  const capacityStress = oos.turnover * 0.45 + oos.concentrationScore * 0.45 + (strategy.portfolioType === "long_short" ? 0.08 : 0);
  checks.push(
    check(
      "capacity_model",
      "Capacity and liquidity",
      capacityStress > 0.72 ? "fail" : capacityStress > 0.5 ? "warn" : "pass",
      `Capacity stress score is ${(capacityStress * 100).toFixed(0)}% from turnover, concentration, and shorting needs.`
    )
  );

  const executionStress = oos.turnover * 0.55 + Math.abs(oos.maxDrawdown) * 1.2 + (strategy.holdingPeriod <= 3 ? 0.12 : 0);
  checks.push(
    check(
      "execution_simulator",
      "Execution simulator stress",
      executionStress > 0.78 ? "fail" : executionStress > 0.52 ? "warn" : "pass",
      `Execution stress score is ${(executionStress * 100).toFixed(0)}% after slippage, partial-fill, gap, halt, and auction assumptions.`
    )
  );

  const failCount = checks.filter((item) => item.status === "fail").length;
  const warnCount = checks.filter((item) => item.status === "warn").length;
  const summary =
    failCount > 0
      ? "Risk desk found a blocking issue."
      : warnCount > 1
        ? "Risk desk wants a retest before promotion."
        : "Risk desk has no blocking objection.";

  const retestRecommendation =
    failCount > 0
      ? "Reject or redesign with stricter timestamp, cost, and concentration controls."
      : warnCount > 0
        ? "Run a walk-forward split, increase costs, and test another universe slice."
        : "Promote as a candidate after one higher-cost stress test.";

  return {
    checks,
    summary,
    retestRecommendation,
    passedRiskChecks: checks.filter((item) => item.status === "pass").length
  };
}

export function decideExperimentStatus(
  backtest: BacktestResult,
  review: RiskReview,
  generatedCode: string,
  strictnessBias = 0,
  poolDelta?: number
): ExperimentStatus {
  const failCount = review.checks.filter((item) => item.status === "fail").length;
  const warnCount = review.checks.filter((item) => item.status === "warn").length;
  // A real "failed to run" only when no implementation was produced — not a
  // pseudo-random kill keyed on code length (which used to inject 1-in-29 noise).
  if (!generatedCode || generatedCode.trim().length < 20) {
    return "failed_to_run";
  }
  // strictnessBias > 0 when the boss has been whipping the risk desk: the bar rises.
  const rejectAt = Math.max(1, 2 - Math.floor(strictnessBias / 2));
  const warnLimit = Math.max(2, 3 - strictnessBias);
  if (failCount >= rejectAt || backtest.outOfSample.returnAfterCosts < -0.08) {
    return "rejected";
  }
  if (failCount >= 1 || warnCount >= warnLimit || backtest.outOfSample.overfittingRiskScore > 72 - strictnessBias * 4) {
    return "retest_needed";
  }
  const oos = backtest.outOfSample;
  const passesBase = oos.sharpeRatio > 1 + strictnessBias * 0.1 && oos.returnAfterCosts > 0.035 && oos.deflatedSharpe >= 0.5;
  if (passesBase) {
    // Admission gates — all FAIL-CLOSED (missing evidence does NOT pass):
    //  1. not redundant: max pool correlation <= 0.9
    //  2. additive: pool-ΔSharpe is defined AND positive (AlphaGen). undefined =>
    //     we could not prove it adds to the book => not a candidate.
    //  3. real OOS predictive skill: the raw signal's OUT-OF-SAMPLE Alphalens IC
    //     must show positive evidence (t-stat >= 1.5 over >= 10 rebalance dates),
    //     not merely "absence of disproof". In-sample IC is not accepted here.
    const redundant = oos.alphaPoolCorrelation > 0.9;
    const additive = poolDelta !== undefined && poolDelta > 0;
    // OUT-OF-SAMPLE IC only — NO fallback to full-sample analytics. If OOS
    // cross-sections are too sparse to compute (null), the skill claim is not
    // proven and the candidate is sent back, rather than borrowing in-sample IC.
    const factor = backtest.factorAnalyticsOOS;
    const hasOosSkill = factor !== undefined && factor.observations >= 10 && factor.icTStat >= 1.5;
    if (redundant || !additive || !hasOosSkill) return "retest_needed";
    return "candidate";
  }
  return "archived";
}
