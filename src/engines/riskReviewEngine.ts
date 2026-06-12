import { BacktestResult, ExperimentStatus, RiskCheck, RiskReview, StrategySpec } from "../types";

function check(id: string, label: string, status: RiskCheck["status"], detail: string): RiskCheck {
  return { id, label, status, detail };
}

export function reviewBacktestRisk(strategy: StrategySpec, backtest: BacktestResult): RiskReview {
  const is = backtest.inSample;
  const oos = backtest.outOfSample;
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
      oos.sharpeRatio < oos.randomBaselineSharpe + 0.2 ? "fail" : oos.sharpeRatio < oos.randomBaselineSharpe + 0.55 ? "warn" : "pass",
      `Random baseline Sharpe is ${oos.randomBaselineSharpe.toFixed(2)}.`
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
  strictnessBias = 0
): ExperimentStatus {
  const failCount = review.checks.filter((item) => item.status === "fail").length;
  const warnCount = review.checks.filter((item) => item.status === "warn").length;
  if (generatedCode.length % 29 === 0) {
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
  if (
    backtest.outOfSample.sharpeRatio > 1 + strictnessBias * 0.1 &&
    backtest.outOfSample.returnAfterCosts > 0.035 &&
    backtest.outOfSample.deflatedSharpe >= 0.5
  ) {
    return "candidate";
  }
  return "archived";
}
