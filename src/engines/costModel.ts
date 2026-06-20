// Transaction-cost model: commission + half bid-ask spread + market impact + short
// borrow. Replaces the old flat per-side commission so the backtest pays what a
// real book would. Spread and borrow widen for illiquid names (lower dollar
// volume); impact follows a square-root law in participation (Almgren-style).
// All outputs are in basis points / fractions so they slot straight into returns.

// Per-trade cost in BPS for a single name, given its average daily dollar volume
// (advUsd) and the participation = traded notional / ADV for this rebalance.
export function nameTradeCostBps(advUsd: number | null, commissionBps: number, participation: number): number {
  const advM = advUsd && advUsd > 0 ? advUsd / 1e6 : 0.5; // $M ADV; assume thin if unknown
  // half-spread: ~1.5-4 bps for very liquid mega-caps, wider as ADV shrinks
  const halfSpreadBps = Math.min(60, 1.5 + 10 / Math.sqrt(Math.max(0.05, advM)));
  // square-root market impact: ~12 bps at 100% ADV participation, scales with sqrt
  const impactBps = 12 * Math.sqrt(Math.max(0, participation));
  return commissionBps + halfSpreadBps + impactBps;
}

// Daily short-borrow cost in BPS for a name (annualized, /252). Hard-to-borrow
// (illiquid) names cost more; floored at a general-collateral rate.
export function borrowBpsPerDay(advUsd: number | null): number {
  const advM = advUsd && advUsd > 0 ? advUsd / 1e6 : 0.5;
  const annualBps = Math.min(800, 25 + 60 / Math.sqrt(Math.max(0.05, advM)));
  return annualBps / 252;
}

// Total fractional cost of a rebalance, summed over names. `deltas` are the
// absolute weight changes per name; `adv` maps name -> ADV (USD); refBookUsd is the
// assumed deployed book size used to size market impact.
export function rebalanceCostFraction(
  deltas: Map<string, number>,
  adv: Map<string, number | null>,
  commissionBps: number,
  refBookUsd: number
): number {
  let cost = 0;
  deltas.forEach((dw, symbol) => {
    if (dw <= 0) return;
    const a = adv.get(symbol) ?? null;
    const participation = a && a > 0 ? (dw * refBookUsd) / a : 0.5;
    cost += (dw * nameTradeCostBps(a, commissionBps, participation)) / 10000;
  });
  return cost;
}

// Daily borrow drag (fraction) for the current short book.
export function dailyBorrowFraction(weights: Map<string, number>, adv: Map<string, number | null>): number {
  let drag = 0;
  weights.forEach((w, symbol) => {
    if (w < 0) drag += (Math.abs(w) * borrowBpsPerDay(adv.get(symbol) ?? null)) / 10000;
  });
  return drag;
}
