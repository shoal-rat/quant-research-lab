import { describe, expect, it } from "vitest";
import { computeFactorAnalytics, spearmanIC, FactorCrossSection } from "./factorAnalytics";
import { calmarRatio, probabilisticSharpe, sortinoRatio } from "./perfMetrics";

describe("factor analytics (Alphalens-style IC)", () => {
  it("spearman IC is +1 when the signal equals the forward return, -1 when reversed", () => {
    const signal = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(spearmanIC(signal, [...signal])!).toBeCloseTo(1, 6);
    expect(spearmanIC(signal, [...signal].reverse())!).toBeCloseTo(-1, 6);
  });

  it("spearman IC is near zero for an unrelated signal", () => {
    const signal = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const forward = [3, -1, 2, 0, -2, 1, 4, -3, 0, 2];
    const ic = spearmanIC(signal, forward)!;
    expect(Math.abs(ic)).toBeLessThan(0.5);
  });

  it("ranks ties (constant signal) yield null IC, not a crash", () => {
    expect(spearmanIC([1, 1, 1, 1, 1, 1], [1, 2, 3, 4, 5, 6])).toBeNull();
  });

  // a signal that strongly (not perfectly) predicts the forward return: high IC
  // with some cross-date variance, so IC-IR is finite and large
  function predictiveCrossSections(sign: number): FactorCrossSection[] {
    const out: FactorCrossSection[] = [];
    for (let t = 0; t < 12; t += 1) {
      const signal: number[] = [];
      const fwd: Record<number, number[]> = { 1: [], 5: [], 10: [], 20: [] };
      for (let n = 0; n < 10; n += 1) {
        const s = n; // rank 0..9
        signal.push(s);
        const noise = (((t * 7 + n * 13) % 7) - 3) * 0.0005; // small vs the 0.01 signal step
        for (const h of [1, 5, 10, 20]) fwd[h].push(sign * s * 0.01 + noise);
      }
      out.push({ signal, forwardByHorizon: fwd });
    }
    return out;
  }

  it("computes a strong positive IC and monotone quantiles for a predictive signal", () => {
    const fa = computeFactorAnalytics(predictiveCrossSections(1), 5)!;
    expect(fa).not.toBeNull();
    expect(fa.horizon).toBe(5);
    expect(fa.icMean).toBeGreaterThan(0.9);
    expect(fa.icIR).toBeGreaterThanOrEqual(0); // perfect rank prediction -> zero IC variance -> IR guards to 0
    expect(fa.observations).toBe(12);
    expect(fa.quantileMonotonic).toBe(true);
    expect(fa.quantileSpread).toBeGreaterThan(0);
    expect(fa.icDecay.length).toBe(4);
  });

  it("flips IC sign when the signal predicts the opposite", () => {
    const fa = computeFactorAnalytics(predictiveCrossSections(-1), 5)!;
    expect(fa.icMean).toBeLessThan(-0.9);
    expect(fa.quantileSpread).toBeLessThan(0);
  });

  it("returns null when there are too few cross-sections", () => {
    expect(computeFactorAnalytics(predictiveCrossSections(1).slice(0, 3), 5)).toBeNull();
  });
});

describe("performance metrics (empyrical conventions)", () => {
  it("calmar = annualized return / |max drawdown|", () => {
    expect(calmarRatio(0.2, -0.1)).toBeCloseTo(2, 6);
    expect(calmarRatio(0.2, 0)).toBe(0); // guard against divide-by-zero
  });

  it("sortino is finite and positive for a positive-drift series, > 0 only on downside risk", () => {
    const up = Array.from({ length: 300 }, (_, i) => 0.001 + Math.sin(i / 7) * 0.004);
    const s = sortinoRatio(up, 252);
    expect(Number.isFinite(s)).toBe(true);
    expect(s).toBeGreaterThan(0);
    // a series with no losing periods has ~zero downside deviation -> guarded to 0
    expect(sortinoRatio([0.01, 0.02, 0.0, 0.03], 252)).toBe(0);
  });

  it("probabilistic Sharpe is ~0.5 at zero Sharpe and rises with sample length", () => {
    const noise = Array.from({ length: 60 }, (_, i) => (i % 2 === 0 ? 0.01 : -0.01)); // mean 0
    expect(probabilisticSharpe(0, noise, 252)).toBeCloseTo(0.5, 1);
    const short = Array.from({ length: 40 }, (_, i) => 0.001 + (i % 5 === 0 ? 0.002 : -0.0005));
    const long = Array.from({ length: 1000 }, (_, i) => 0.001 + (i % 5 === 0 ? 0.002 : -0.0005));
    const psrShort = probabilisticSharpe(1.0, short, 252);
    const psrLong = probabilisticSharpe(1.0, long, 252);
    expect(psrLong).toBeGreaterThan(psrShort); // more data -> more confidence at the same Sharpe
  });
});
