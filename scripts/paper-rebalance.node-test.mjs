import assert from "node:assert/strict";
import test from "node:test";
import { planEqualWeightRebalance } from "./paper-rebalance.mjs";

test("repeat equal-weight deployment is idempotent inside tolerance", () => {
  const plan = planEqualWeightRebalance({
    equity: 100_000,
    targets: ["AAA", "BBB"],
    positions: [
      { symbol: "AAA", qty: "10", market_value: "49000" },
      { symbol: "BBB", qty: "20", market_value: "49000" }
    ]
  });
  assert.equal(plan.targetNotional, 49_000);
  assert.deepEqual(plan.closes, []);
  assert.deepEqual(plan.orders, []);
});

test("planner closes stale names and trades only desired-value deltas", () => {
  const plan = planEqualWeightRebalance({
    equity: 100_000,
    targets: ["AAA", "BBB", "BBB"],
    positions: [
      { symbol: "AAA", qty: "10", market_value: "40000" },
      { symbol: "BBB", qty: "20", market_value: "55000" },
      { symbol: "OLD", qty: "2", market_value: "3000" }
    ],
    toleranceBps: 0
  });
  assert.deepEqual(plan.closes, ["OLD"]);
  assert.deepEqual(plan.orders, [
    { symbol: "AAA", side: "buy", notional: 9000 },
    { symbol: "BBB", side: "sell", notional: 6000 }
  ]);
});

test("short target is closed and deferred instead of racing a new buy", () => {
  const plan = planEqualWeightRebalance({
    equity: 50_000,
    targets: ["AAA"],
    positions: [{ symbol: "AAA", qty: "-5", market_value: "-1200" }]
  });
  assert.deepEqual(plan.closes, ["AAA"]);
  assert.deepEqual(plan.orders, []);
});
