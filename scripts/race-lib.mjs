// Pure helpers for the strategy horse race (scripts/horse-race-loop.mjs), split
// out so tests can import them without starting the race's main loop.

// Recursively sort object keys so JSON key order can never defeat config dedupe
// (JSON.stringify({a:1,b:2}) !== JSON.stringify({b:2,a:1}) otherwise).
export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

// canonical identity of a strategy config: family + sorted-key params + holding
export function canonicalKey(config) {
  return `${config.familyKey}|${JSON.stringify(canonicalize(config.params || {}))}|${config.holding || ""}`;
}

// Live price when a fresh snapshot exists, else the position's last known price.
// A missing snapshot must NEVER value (or liquidate) a position at $0 — that was
// corrupting NAV and therefore the eviction signal itself.
export function positionPrice(position, livePrice) {
  if (typeof livePrice === "number" && livePrice > 0) return livePrice;
  return position && position.lastPrice > 0 ? position.lastPrice : 0;
}

// Mark all positions to market, recording lastPrice on each position as we go so
// later marks/liquidations can carry it when a snapshot goes missing.
export function markPositions(positions, prices) {
  let value = 0;
  for (const [sym, position] of Object.entries(positions || {})) {
    const p = positionPrice(position, prices[sym]);
    if (p > 0) position.lastPrice = p;
    value += position.sh * p;
  }
  return value;
}

// Daily NAV marks ([{date, nav}], chronological) -> daily simple returns.
export function dailyReturnsFromMarks(marks) {
  const out = [];
  for (let i = 1; i < (marks || []).length; i += 1) {
    const prev = marks[i - 1]?.nav;
    const cur = marks[i]?.nav;
    if (prev > 0 && cur > 0) out.push(cur / prev - 1);
  }
  return out;
}

// Annualized Sharpe of a daily-return series; null when there is too little data.
export function annualizedSharpe(returns, periodsPerYear = 252) {
  if (!Array.isArray(returns) || returns.length < 2) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
  const sd = Math.sqrt(variance);
  if (!(sd > 0)) return 0;
  return (mean / sd) * Math.sqrt(periodsPerYear);
}

// Live-vs-backtest verdict for one sleeve/strategy (pure, unit-testable).
// Bands (REDESIGN_V3 B4): "demote" on cumulative live return < -8%, or realized
// Sharpe < 0 after >= 15 marks; "degrading" when realized Sharpe < 25% of the
// backtest OOS Sharpe after >= 10 marks; "healthy" otherwise.
export function reconcileVerdict({ liveDays, liveSharpe, cumReturn, backtestSharpe }) {
  if (typeof cumReturn === "number" && cumReturn < -0.08) {
    return { verdict: "demote", note: `cumulative live return ${(cumReturn * 100).toFixed(1)}% < -8%` };
  }
  if (liveDays >= 15 && typeof liveSharpe === "number" && liveSharpe < 0) {
    return { verdict: "demote", note: `realized Sharpe ${liveSharpe.toFixed(2)} < 0 after ${liveDays} marks` };
  }
  if (
    liveDays >= 10 &&
    typeof liveSharpe === "number" &&
    typeof backtestSharpe === "number" &&
    backtestSharpe > 0 &&
    liveSharpe < 0.25 * backtestSharpe
  ) {
    return { verdict: "degrading", note: `realized Sharpe ${liveSharpe.toFixed(2)} < 25% of backtest OOS ${backtestSharpe.toFixed(2)}` };
  }
  return { verdict: "healthy", note: "within band of backtest expectation" };
}
