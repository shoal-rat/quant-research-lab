import { describe, expect, it } from "vitest";
import { borrowBpsPerDay, dailyBorrowFraction, nameTradeCostBps, rebalanceCostFraction } from "./costModel";

describe("transaction cost model", () => {
  it("half-spread widens as a name gets less liquid", () => {
    const liquid = nameTradeCostBps(500e6, 0, 0); // $500M ADV, no commission/impact
    const thin = nameTradeCostBps(5e6, 0, 0); // $5M ADV
    expect(thin).toBeGreaterThan(liquid);
    expect(liquid).toBeLessThan(6); // mega-cap half-spread is a few bps
  });

  it("market impact follows a square-root law in participation", () => {
    const at1 = nameTradeCostBps(100e6, 0, 0.01) - nameTradeCostBps(100e6, 0, 0);
    const at4 = nameTradeCostBps(100e6, 0, 0.04) - nameTradeCostBps(100e6, 0, 0);
    expect(at4 / at1).toBeCloseTo(2, 1); // 4x participation -> ~2x impact (sqrt)
  });

  it("commission is added on top", () => {
    expect(nameTradeCostBps(100e6, 10, 0) - nameTradeCostBps(100e6, 0, 0)).toBeCloseTo(10, 6);
  });

  it("borrow is positive and higher for illiquid names", () => {
    expect(borrowBpsPerDay(500e6)).toBeGreaterThan(0);
    expect(borrowBpsPerDay(2e6)).toBeGreaterThan(borrowBpsPerDay(500e6));
  });

  it("rebalance cost scales with traded weight and only charges traded names", () => {
    const adv = new Map<string, number | null>([["A", 200e6], ["B", 200e6]]);
    const small = rebalanceCostFraction(new Map([["A", 0.1]]), adv, 5, 5e6);
    const big = rebalanceCostFraction(new Map([["A", 0.2]]), adv, 5, 5e6);
    expect(big).toBeGreaterThan(small);
    expect(rebalanceCostFraction(new Map(), adv, 5, 5e6)).toBe(0);
  });

  it("daily borrow only charges short positions", () => {
    const adv = new Map<string, number | null>([["A", 50e6], ["B", 50e6]]);
    const longOnly = dailyBorrowFraction(new Map([["A", 0.5]]), adv);
    const withShort = dailyBorrowFraction(new Map([["A", 0.5], ["B", -0.5]]), adv);
    expect(longOnly).toBe(0);
    expect(withShort).toBeGreaterThan(0);
  });
});
