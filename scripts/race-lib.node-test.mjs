import assert from "node:assert/strict";
import test from "node:test";
import {
  annualizedSharpe,
  canonicalKey,
  dailyReturnsFromMarks,
  markPositions,
  reconcileVerdict
} from "./race-lib.mjs";

test("canonicalKey ignores object-key order, including nested parameters", () => {
  const a = canonicalKey({
    familyKey: "xs_momentum",
    holding: 5,
    params: { lookback: 120, nested: { skip: 5, weight: 0.4 } }
  });
  const b = canonicalKey({
    familyKey: "xs_momentum",
    holding: 5,
    params: { nested: { weight: 0.4, skip: 5 }, lookback: 120 }
  });
  assert.equal(a, b);
});

test("markPositions retains a last-known mark when a quote is missing", () => {
  const positions = {
    AAA: { sh: 2, lastPrice: 10 },
    BBB: { sh: 1.5, lastPrice: 20 }
  };
  assert.equal(markPositions(positions, { AAA: 12 }), 54);
  assert.equal(positions.AAA.lastPrice, 12);
  assert.equal(markPositions(positions, {}), 54);
});

test("daily returns and annualized Sharpe derive from chronological daily marks", () => {
  const returns = dailyReturnsFromMarks([
    { date: "2026-01-02", nav: 100 },
    { date: "2026-01-05", nav: 105 },
    { date: "2026-01-06", nav: 110.25 }
  ]);
  assert.equal(returns.length, 2);
  assert.ok(returns.every((value) => Math.abs(value - 0.05) < 1e-12));
  assert.equal(annualizedSharpe(returns), 0);
});

test("reconciliation demotes clear live failures and flags degradation", () => {
  assert.equal(reconcileVerdict({ liveDays: 1, liveSharpe: null, cumReturn: -0.081, backtestSharpe: 1 }).verdict, "demote");
  assert.equal(reconcileVerdict({ liveDays: 15, liveSharpe: -0.01, cumReturn: 0.01, backtestSharpe: 1 }).verdict, "demote");
  assert.equal(reconcileVerdict({ liveDays: 10, liveSharpe: 0.2, cumReturn: 0.01, backtestSharpe: 1 }).verdict, "degrading");
  assert.equal(reconcileVerdict({ liveDays: 10, liveSharpe: 0.4, cumReturn: 0.01, backtestSharpe: 1 }).verdict, "healthy");
});
