import { describe, expect, it } from "vitest";
import { evolveFormula, MinerState } from "./alphaMiner";
import { buildRealMarketData, RealMarketData } from "./realMarket";
import { ensureTrialFloor, recordTrials, resetTrials, totalTrials, trialBreakdown } from "./trialRegistry";

function syntheticData(bars = 420, tickers = 10): RealMarketData {
  const dates: string[] = [];
  const d0 = Date.parse("2019-01-01T00:00:00Z");
  for (let i = 0; i < bars; i += 1) dates.push(new Date(d0 + i * 86_400_000).toISOString().slice(0, 10));
  const bundle = {
    source: "synthetic",
    fetchedAt: "2019-01-01",
    start: dates[0],
    end: dates[dates.length - 1],
    dates,
    benchmark: "BENCH",
    tickers: {} as RealMarketData["tickers"]
  };
  const names = ["BENCH", ...Array.from({ length: tickers }, (_, i) => `T${i}`)];
  names.forEach((symbol, t) => {
    const closes: number[] = [];
    const volumes: number[] = [];
    let price = 40 + t * 5;
    for (let i = 0; i < bars; i += 1) {
      // mild mean-reversion structure the miner can latch onto
      const cycle = Math.sin((i + t * 13) / 7) * 0.012;
      price = Math.max(2, price * (1 + 0.0002 + cycle));
      closes.push(Number(price.toFixed(4)));
      volumes.push(800_000 + ((i * 53 + t * 71) % 400_000));
    }
    bundle.tickers[symbol] = { name: symbol, industry: t % 2 === 0 ? "A" : "B", closes, volumes };
  });
  return buildRealMarketData(bundle);
}

function minerOptions(data: RealMarketData, seed: string, state: MinerState | null = null) {
  const industryPeers: Record<string, string[]> = {};
  for (const [ticker, meta] of Object.entries(data.tickers)) {
    if (ticker === data.benchmark) continue;
    (industryPeers[meta.industry] = industryPeers[meta.industry] ?? []).push(ticker);
  }
  return {
    state,
    data,
    universe: Object.keys(data.tickers).filter((t) => t !== data.benchmark),
    industryPeers,
    periodsPerYear: 252,
    searchEndIndex: 380,
    seed
  };
}

describe("alphaMiner", () => {
  it("is deterministic for a fixed seed", () => {
    const a = evolveFormula(minerOptions(syntheticData(), "s1"));
    const b = evolveFormula(minerOptions(syntheticData(), "s1"));
    expect(a.formula).toBe(b.formula);
    expect(a.fitness).toBeCloseTo(b.fitness, 12);
    expect(a.evaluations).toBe(b.evaluations);
  });

  it("never reads bars at or past searchEndIndex", () => {
    const clean = evolveFormula(minerOptions(syntheticData(), "s2"));
    const corrupted = syntheticData();
    for (const symbol of Object.keys(corrupted.tickers)) {
      const t = corrupted.tickers[symbol];
      for (let i = 380; i < t.closes.length; i += 1) {
        (t.closes as number[])[i] = 1e9;
        corrupted.returns[symbol][i] = 9;
      }
    }
    const dirty = evolveFormula(minerOptions(corrupted, "s2"));
    expect(dirty.formula).toBe(clean.formula);
    expect(dirty.fitness).toBeCloseTo(clean.fitness, 12);
  });

  it("carries state across generations and avoids exact repeats", () => {
    const data = syntheticData();
    const first = evolveFormula(minerOptions(data, "s3"));
    expect(first.state.generation).toBe(1);
    const second = evolveFormula(minerOptions(data, "s3-next", first.state));
    expect(second.state.generation).toBe(2);
    expect(second.state.tried.length).toBeGreaterThanOrEqual(2);
  });

  it("reports evaluations for the trial registry", () => {
    const result = evolveFormula(minerOptions(syntheticData(), "s4"));
    // at least the population must have been fitness-evaluated
    expect(result.evaluations).toBeGreaterThanOrEqual(24);
  });
});

describe("trialRegistry", () => {
  it("accumulates and totals trials across sources", () => {
    resetTrials();
    recordTrials(3, "lab");
    recordTrials(40, "miner");
    recordTrials(2, "lab");
    expect(totalTrials()).toBe(45);
    expect(trialBreakdown()).toEqual({ lab: 5, miner: 40 });
    resetTrials();
    expect(totalTrials()).toBe(0);
  });

  it("ignores non-positive and non-finite counts", () => {
    resetTrials();
    recordTrials(0, "lab");
    recordTrials(-5, "lab");
    recordTrials(Number.NaN, "lab");
    expect(totalTrials()).toBe(0);
    resetTrials();
  });

  it("lifts a pre-registry desk to its historical real-run floor without double counting", () => {
    resetTrials();
    ensureTrialFloor(12);
    expect(totalTrials()).toBe(12);
    ensureTrialFloor(8);
    expect(totalTrials()).toBe(12);
    ensureTrialFloor(15);
    expect(totalTrials()).toBe(15);
    resetTrials();
  });
});
