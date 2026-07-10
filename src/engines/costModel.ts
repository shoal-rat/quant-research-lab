// Transaction-cost model: commission + half bid-ask spread + market impact + short
// borrow. Replaces the old flat per-side commission so the backtest pays what a
// real book would. Spread and borrow widen for illiquid names (lower dollar
// volume); impact follows a square-root law in participation (Almgren-style).
// All outputs are in basis points / fractions so they slot straight into returns.
//
// v3: costs are also VOL-AWARE — a benchmark-volatility multiplier (point-in-time,
// clamped 0.7..3) widens the spread and the borrow premium so 2008/2020 stress
// windows no longer trade at calm-market costs.

function clampVolMultiplier(volMultiplier: number): number {
  if (!Number.isFinite(volMultiplier) || volMultiplier <= 0) return 1;
  return Math.min(3, Math.max(0.7, volMultiplier));
}

// Per-trade cost in BPS for a single name, given its average daily dollar volume
// (advUsd) and the participation = traded notional / ADV for this rebalance.
export function nameTradeCostBps(
  advUsd: number | null,
  commissionBps: number,
  participation: number,
  volMultiplier = 1
): number {
  const advM = advUsd && advUsd > 0 ? advUsd / 1e6 : 0.5; // $M ADV; assume thin if unknown
  const vm = clampVolMultiplier(volMultiplier);
  // half-spread: ~1.5-4 bps for very liquid mega-caps, wider as ADV shrinks,
  // wider again when the market itself is volatile
  const halfSpreadBps = Math.min(60, (1.5 + 10 / Math.sqrt(Math.max(0.05, advM))) * vm);
  // square-root market impact: ~12 bps at 100% ADV participation, scales with sqrt
  const impactBps = 12 * Math.sqrt(Math.max(0, participation));
  return commissionBps + halfSpreadBps + impactBps;
}

// Short-borrow cost in BPS per bar (annualized / periodsPerYear). Hard-to-borrow
// (illiquid) names cost more; floored at a general-collateral rate. The premium
// above the GC floor widens with market volatility (borrow gets scarce in stress).
export function borrowBpsPerDay(advUsd: number | null, volMultiplier = 1, periodsPerYear = 252): number {
  const advM = advUsd && advUsd > 0 ? advUsd / 1e6 : 0.5;
  const vm = clampVolMultiplier(volMultiplier);
  const premium = (60 / Math.sqrt(Math.max(0.05, advM))) * vm;
  const annualBps = Math.min(800, 25 + premium);
  return annualBps / Math.max(1, periodsPerYear);
}

// Total fractional cost of a rebalance, summed over names. `deltas` are the
// absolute weight changes per name; `adv` maps name -> ADV (USD); refBookUsd is the
// assumed deployed book size used to size market impact.
export function rebalanceCostFraction(
  deltas: Map<string, number>,
  adv: Map<string, number | null>,
  commissionBps: number,
  refBookUsd: number,
  volMultiplier = 1
): number {
  let cost = 0;
  deltas.forEach((dw, symbol) => {
    if (dw <= 0) return;
    const a = adv.get(symbol) ?? null;
    const participation = a && a > 0 ? (dw * refBookUsd) / a : 0.5;
    cost += (dw * nameTradeCostBps(a, commissionBps, participation, volMultiplier)) / 10000;
  });
  return cost;
}

// Borrow drag (fraction) for the current short book, charged per bar.
export function dailyBorrowFraction(
  weights: Map<string, number>,
  adv: Map<string, number | null>,
  volMultiplier = 1,
  periodsPerYear = 252
): number {
  let drag = 0;
  weights.forEach((w, symbol) => {
    if (w < 0) drag += (Math.abs(w) * borrowBpsPerDay(adv.get(symbol) ?? null, volMultiplier, periodsPerYear)) / 10000;
  });
  return drag;
}
