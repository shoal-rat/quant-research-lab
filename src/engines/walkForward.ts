import { WalkForwardReport, WalkForwardWindow } from "../types";

// Rolling/anchored walk-forward validation with López de Prado purging + embargo.
// A single in-sample/out-of-sample split (the old 0.58 cut) can flatter a
// strategy that only worked in one regime; walk-forward reports out-of-sample
// Sharpe across several later windows. Because the strategy's labels are h-bar
// forward returns, adjacent train/test points share overlapping windows — so we
// PURGE the last h bars of train and EMBARGO a few bars after it before the test
// begins, removing the leakage plain splits miss.

function sharpe(returns: number[], periodsPerYear: number): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
  const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / (returns.length - 1);
  const sd = Math.sqrt(Math.max(variance, 1e-12));
  return (mean / sd) * Math.sqrt(periodsPerYear);
}

function cumulative(returns: number[]): number {
  return returns.reduce((eq, r) => eq * (1 + r), 1) - 1;
}

export function computeWalkForward(
  returns: number[],
  dates: string[] | undefined,
  options: { holding: number; folds?: number; embargoFraction?: number; periodsPerYear: number }
): WalkForwardReport | null {
  const { holding, periodsPerYear } = options;
  const folds = Math.max(2, options.folds ?? 4);
  const n = returns.length;
  // need enough data that each fold's test block is statistically meaningful
  if (n < (folds + 1) * 30) return null;

  const embargo = Math.max(0, Math.round(n * (options.embargoFraction ?? 0.02)));
  const gap = holding + embargo; // purge the label horizon + embargo before each test
  const label = (i: number) => (dates && dates[i] ? dates[i].slice(0, 10) : `t${i}`);

  const windows: WalkForwardWindow[] = [];
  for (let k = 1; k <= folds; k += 1) {
    const trainEnd = Math.floor((n * k) / (folds + 1));
    const testStart = Math.min(n - 1, trainEnd + gap);
    const testEnd = Math.floor((n * (k + 1)) / (folds + 1));
    if (testEnd - testStart < 20) continue; // skip degenerate windows
    const testReturns = returns.slice(testStart, testEnd);
    const testSharpe = sharpe(testReturns, periodsPerYear);
    windows.push({
      trainRange: `${label(0)}..${label(Math.max(0, trainEnd - gap))}`,
      testRange: `${label(testStart)}..${label(testEnd - 1)}`,
      testSharpe: Math.round(testSharpe * 100) / 100,
      testReturn: Math.round(cumulative(testReturns) * 10000) / 10000,
      passed: testSharpe > 0
    });
  }
  if (windows.length === 0) return null;

  const passRate = windows.filter((w) => w.passed).length / windows.length;
  const worstSharpe = Math.min(...windows.map((w) => w.testSharpe));
  const positive = windows.filter((w) => w.passed).length;
  const summary =
    `${positive}/${windows.length} out-of-sample windows positive (purge ${holding} + embargo ${embargo} bars); ` +
    `worst window Sharpe ${worstSharpe.toFixed(2)}.` +
    (passRate >= 0.75 ? " Holds up across periods." : passRate <= 0.5 ? " Likely a single-regime fluke." : " Mixed across regimes.");

  return { windows, passRate: Math.round(passRate * 100) / 100, worstSharpe, summary };
}
