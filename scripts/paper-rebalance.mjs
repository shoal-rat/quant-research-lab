// Pure, deterministic equal-weight rebalance planning shared by both paper
// deployment paths. Planning against current market values makes repeat requests
// idempotent instead of buying a full sleeve again on every call.

function finiteMoney(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function planEqualWeightRebalance({
  equity,
  targets,
  positions = [],
  allocationFraction = 0.98,
  toleranceBps = 100,
  minNotional = 10
}) {
  const accountEquity = finiteMoney(equity);
  const uniqueTargets = [...new Set((targets ?? []).map(String).filter(Boolean))];
  const targetSet = new Set(uniqueTargets);
  const current = new Map();
  for (const position of positions ?? []) {
    const symbol = String(position?.symbol ?? "");
    if (!symbol) continue;
    current.set(symbol, {
      marketValue: finiteMoney(position.market_value ?? position.marketValue),
      qty: finiteMoney(position.qty)
    });
  }

  const closes = [];
  for (const [symbol, position] of current) {
    if (!targetSet.has(symbol) || position.qty < 0 || position.marketValue < 0) closes.push(symbol);
  }

  if (accountEquity <= 0 || uniqueTargets.length === 0) {
    return { targetNotional: 0, reserveFraction: 1 - allocationFraction, closes, orders: [] };
  }

  const fraction = Math.min(1, Math.max(0, finiteMoney(allocationFraction)));
  const targetNotional = Math.floor((accountEquity * fraction) / uniqueTargets.length);
  const tolerance = Math.max(finiteMoney(minNotional), (targetNotional * Math.max(0, finiteMoney(toleranceBps))) / 10_000);
  const orders = [];
  for (const symbol of uniqueTargets) {
    const position = current.get(symbol);
    // A target that is currently short is closed first and intentionally deferred
    // until a later idempotent call; do not race a covering close with a new buy.
    if (position && (position.qty < 0 || position.marketValue < 0)) continue;
    const delta = targetNotional - Math.max(0, position?.marketValue ?? 0);
    if (Math.abs(delta) < tolerance) continue;
    const notional = Math.floor(Math.abs(delta));
    if (notional < minNotional) continue;
    orders.push({ symbol, side: delta > 0 ? "buy" : "sell", notional });
  }

  return { targetNotional, reserveFraction: 1 - fraction, closes, orders };
}
