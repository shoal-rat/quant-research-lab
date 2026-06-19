import { normCdf } from "./backtestEngine";

// Performance-metric formulas matching the open-source quant conventions
// (empyrical / quantstats / ffn) so the lab reports the same numbers a
// professional would. All take a per-period return series + the annualization
// factor (periods per year) so they are correct at any frequency.

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// Sortino: like Sharpe but the denominator is downside deviation. empyrical
// convention divides the squared downside by the FULL count (not just the
// negatives), so a series with few losses scores higher.
export function sortinoRatio(returns: number[], periodsPerYear: number): number {
  if (returns.length < 2) return 0;
  const m = mean(returns);
  const downside = Math.sqrt(returns.reduce((sum, r) => sum + Math.min(r, 0) ** 2, 0) / returns.length);
  if (downside < 1e-9) return 0;
  return (m / downside) * Math.sqrt(periodsPerYear);
}

// Calmar: annualized return over the magnitude of the worst drawdown.
export function calmarRatio(annualizedReturn: number, maxDrawdown: number): number {
  const dd = Math.abs(maxDrawdown);
  if (dd < 1e-6) return 0;
  return annualizedReturn / dd;
}

// Probabilistic Sharpe Ratio (Bailey & Lopez de Prado): the confidence that the
// observed Sharpe exceeds a benchmark Sharpe (default 0), adjusting the Sharpe's
// standard error for skew and kurtosis of the returns. Sibling of the deflated
// Sharpe already in backtestEngine, but for a single SR0 instead of N trials.
export function probabilisticSharpe(
  sharpeAnnual: number,
  returns: number[],
  periodsPerYear: number,
  benchmarkSharpeAnnual = 0
): number {
  const T = returns.length;
  if (T < 20) return 0;
  const sr = sharpeAnnual / Math.sqrt(Math.max(1, periodsPerYear)); // per-period Sharpe
  const sr0 = benchmarkSharpeAnnual / Math.sqrt(Math.max(1, periodsPerYear));
  const m = mean(returns);
  const sd = Math.sqrt(returns.reduce((sum, r) => sum + (r - m) ** 2, 0) / Math.max(1, T - 1)) || 1e-9;
  const skew = returns.reduce((sum, r) => sum + ((r - m) / sd) ** 3, 0) / T;
  const kurt = returns.reduce((sum, r) => sum + ((r - m) / sd) ** 4, 0) / T;
  const denom = Math.sqrt(Math.max(1e-12, 1 - skew * sr + ((kurt - 1) / 4) * sr * sr));
  const z = ((sr - sr0) * Math.sqrt(T - 1)) / denom;
  return clamp01(normCdf(z));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
