import { describe, expect, it } from "vitest";
import { computeWalkForward } from "./walkForward";
import { preprocessSignal } from "./signalPreprocess";

function series(n: number, perBar: number, noise = 0): number[] {
  // deterministic, no Math.random: small alternating wobble around a drift
  return Array.from({ length: n }, (_, i) => perBar + (i % 2 === 0 ? noise : -noise));
}

describe("computeWalkForward", () => {
  it("returns null when there is not enough data for honest folds", () => {
    expect(computeWalkForward(series(40, 0.001), undefined, { holding: 5, periodsPerYear: 252 })).toBeNull();
  });

  it("flags a consistently positive strategy as passing across windows", () => {
    const r = series(400, 0.002, 0.001);
    const report = computeWalkForward(r, undefined, { holding: 5, periodsPerYear: 252 });
    expect(report).not.toBeNull();
    expect(report!.windows.length).toBeGreaterThanOrEqual(3);
    expect(report!.passRate).toBe(1);
    expect(report!.worstSharpe).toBeGreaterThan(0);
  });

  it("catches a strategy that only worked in the first half", () => {
    // strong early, negative late -> later out-of-sample windows should fail
    const r = [...series(200, 0.004, 0.001), ...series(200, -0.003, 0.001)];
    const report = computeWalkForward(r, undefined, { holding: 5, periodsPerYear: 252 });
    expect(report).not.toBeNull();
    expect(report!.passRate).toBeLessThan(1);
    expect(report!.worstSharpe).toBeLessThan(0);
  });

  it("purges the label horizon + embargo between train and test", () => {
    const r = series(600, 0.001, 0.0005);
    const dates = Array.from({ length: 600 }, (_, i) => `2020-01-${String((i % 28) + 1).padStart(2, "0")}`);
    const report = computeWalkForward(r, dates, { holding: 10, folds: 4, embargoFraction: 0.02, periodsPerYear: 252 });
    expect(report).not.toBeNull();
    // summary should mention the purge + embargo it actually applied
    expect(report!.summary).toMatch(/purge 10/);
  });
});

describe("preprocessSignal pipeline", () => {
  it("z-score preserves cross-sectional rank order (rank-invariant transform)", () => {
    const raw = [3, 1, 4, 1.5, 9, 2.6];
    const z = preprocessSignal(raw, { standardize: "zscore" });
    const rankOf = (arr: number[]) => arr.map((v) => arr.filter((x) => x < v).length);
    expect(rankOf(z)).toEqual(rankOf(raw));
  });

  it("sector-demeaning removes the average group tilt", () => {
    const raw = [10, 12, 1, 3];
    const groups = ["a", "a", "b", "b"];
    const out = preprocessSignal(raw, { groups });
    // each group should now sum to ~0
    expect(out[0] + out[1]).toBeCloseTo(0, 9);
    expect(out[2] + out[3]).toBeCloseTo(0, 9);
  });

  it("beta-residualization makes the signal orthogonal to beta", () => {
    const betas = [0.5, 1.0, 1.5, 2.0, 2.5];
    const raw = betas.map((b) => 2 * b + 1); // perfectly collinear with beta
    const out = preprocessSignal(raw, { betas });
    out.forEach((v) => expect(Math.abs(v)).toBeLessThan(1e-6)); // nothing left after removing beta
  });
});
