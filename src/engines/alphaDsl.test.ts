import { describe, expect, it } from "vitest";
import {
  alphaComplexity,
  crossoverAlpha,
  evaluateAlpha,
  formatAlpha,
  mutateAlpha,
  parseAlpha,
  randomAlpha,
  validateAlpha,
  AlphaContext
} from "./alphaDsl";
import { buildRealMarketData, RealMarketData } from "./realMarket";
import { seededRandom } from "./random";

// deterministic synthetic dataset: 8 tickers, 400 bars, two industries
function syntheticData(bars = 400, tickers = 8): RealMarketData {
  const dates: string[] = [];
  const d0 = Date.parse("2020-01-01T00:00:00Z");
  for (let i = 0; i < bars; i += 1) {
    dates.push(new Date(d0 + i * 86_400_000).toISOString().slice(0, 10));
  }
  const bundle = {
    source: "synthetic",
    fetchedAt: "2020-01-01",
    start: dates[0],
    end: dates[dates.length - 1],
    dates,
    benchmark: "BENCH",
    tickers: {} as RealMarketData["tickers"]
  };
  const names = ["BENCH", ...Array.from({ length: tickers }, (_, i) => `T${i}`)];
  names.forEach((symbol, t) => {
    const closes: number[] = [];
    const highs: number[] = [];
    const lows: number[] = [];
    const volumes: number[] = [];
    let price = 50 + t * 10;
    for (let i = 0; i < bars; i += 1) {
      // deterministic pseudo-walk with per-ticker drift + weekly wiggle
      const drift = 0.0003 * (t - 3);
      const wiggle = Math.sin((i + t * 7) / 9) * 0.01;
      price = Math.max(2, price * (1 + drift + wiggle));
      closes.push(Number(price.toFixed(4)));
      highs.push(Number((price * 1.01).toFixed(4)));
      lows.push(Number((price * 0.99).toFixed(4)));
      volumes.push(1_000_000 + ((i * 37 + t * 101) % 500_000));
    }
    bundle.tickers[symbol] = {
      name: symbol,
      industry: t % 2 === 0 ? "Tech" : "Retail",
      closes,
      highs,
      lows,
      volumes
    };
  });
  return buildRealMarketData(bundle);
}

function contextFor(data: RealMarketData, symbol: string, at: number): AlphaContext {
  const industryPeers: Record<string, string[]> = {};
  for (const [ticker, meta] of Object.entries(data.tickers)) {
    if (ticker === data.benchmark) continue;
    (industryPeers[meta.industry] = industryPeers[meta.industry] ?? []).push(ticker);
  }
  return { data, symbol, at, industryPeers, periodsPerYear: 252 };
}

describe("alphaDsl parsing", () => {
  it("round-trips parse -> format -> parse", () => {
    const sources = [
      "mom(120, 5)",
      "zn(mom(120, 5)) + zn(neg(vol(20)))",
      "ts_corr(returns, ts_mean(volume, 5), 20)",
      "close / ts_max(close, 250) - 1",
      "clamp(delta(ts_rank(close, 60), 5), -2, 2)",
      "-3 * rev(5)"
    ];
    for (const src of sources) {
      const once = formatAlpha(parseAlpha(src));
      const twice = formatAlpha(parseAlpha(once));
      expect(twice).toBe(once);
    }
  });

  it("respects arithmetic precedence", () => {
    const ctx = contextFor(syntheticData(60), "T1", 50);
    const a = evaluateAlpha(parseAlpha("2 + 3 * 4"), ctx);
    expect(a).toBe(14);
    const b = evaluateAlpha(parseAlpha("(2 + 3) * 4"), ctx);
    expect(b).toBe(20);
  });

  it("rejects unknown identifiers, bad windows, and oversized trees", () => {
    expect(validateAlpha("nonsense(5)").ok).toBe(false);
    expect(validateAlpha("ts_mean(close, close)").ok).toBe(false);
    expect(validateAlpha("").ok).toBe(false);
    // depth cap: nest 12 neg() calls
    let deep = "close";
    for (let i = 0; i < 12; i += 1) deep = `neg(${deep})`;
    expect(validateAlpha(deep).ok).toBe(false);
  });

  it("clamps window literals into the legal range", () => {
    const canonical = formatAlpha(parseAlpha("ts_mean(close, 9999)"));
    expect(canonical).toBe("ts_mean(close, 500)");
  });

  it("preserves one-bar lags for delta and delay", () => {
    const canonical = formatAlpha(parseAlpha("delta(close, 1) + delay(close, 1)"));
    expect(canonical).toBe("delta(close, 1) + delay(close, 1)");
  });
});

describe("alphaDsl evaluation", () => {
  const data = syntheticData();

  it("never reads past ctx.at (no lookahead)", () => {
    const formulas = ["mom(60, 5)", "ts_zscore(close, 20)", "ts_corr(returns, volume, 20)", "rev(5) * ts_rank(dollarvol, 20)"];
    for (const src of formulas) {
      const expr = parseAlpha(src);
      const before = evaluateAlpha(expr, contextFor(data, "T2", 300));
      // corrupt everything after bar 300
      const corrupted = syntheticData();
      for (const symbol of Object.keys(corrupted.tickers)) {
        const t = corrupted.tickers[symbol];
        for (let i = 301; i < t.closes.length; i += 1) {
          (t.closes as number[])[i] = 1e9;
          (t.volumes as number[])[i] = 1;
          corrupted.returns[symbol][i] = 5;
        }
      }
      const after = evaluateAlpha(expr, contextFor(corrupted, "T2", 300));
      expect(after).toBe(before);
    }
  });

  it("propagates nulls from missing data", () => {
    const gappy = syntheticData();
    (gappy.tickers.T3.closes as (number | null)[])[295] = null;
    const value = evaluateAlpha(parseAlpha("ts_mean(close, 10)"), contextFor(gappy, "T3", 300));
    expect(value).toBeNull();
  });

  it("returns null for series the dataset lacks", () => {
    const priceOnly = syntheticData();
    delete priceOnly.tickers.T1.volumes;
    const value = evaluateAlpha(parseAlpha("ts_mean(volume, 5)"), contextFor(priceOnly, "T1", 300));
    expect(value).toBeNull();
  });

  it("computes ts_rank and ts_zscore against known values", () => {
    // strictly increasing close: current bar is the max of any trailing window
    const rising = syntheticData();
    const t = rising.tickers.T0;
    for (let i = 0; i < t.closes.length; i += 1) (t.closes as number[])[i] = 10 + i;
    const rank = evaluateAlpha(parseAlpha("ts_rank(close, 20)"), contextFor(rising, "T0", 300));
    expect(rank).toBe(1);
    const z = evaluateAlpha(parseAlpha("ts_zscore(close, 21)"), contextFor(rising, "T0", 300));
    // arithmetic ramp: (x_n - mean) / std is a fixed known constant
    expect(z).toBeGreaterThan(1.5);
    expect(z).toBeLessThan(1.8);
  });

  it("divide-by-zero yields null, not Infinity", () => {
    const value = evaluateAlpha(parseAlpha("close / (close - close)"), contextFor(data, "T1", 300));
    expect(value).toBeNull();
  });

  it("zn performs a true per-date cross-sectional z-score", () => {
    const at = 300;
    const symbols = Object.keys(data.tickers).filter((symbol) => symbol !== data.benchmark);
    const values = symbols.map((symbol) => data.tickers[symbol].closes[at] as number);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
    const expected = ((data.tickers.T2.closes[at] as number) - mean) / sd;
    const actual = evaluateAlpha(parseAlpha("zn(close)"), contextFor(data, "T2", at));
    expect(actual).toBeCloseTo(expected, 10);
  });
});

describe("alphaDsl genetics helpers", () => {
  it("randomAlpha produces valid formulas deterministically", () => {
    const a1 = randomAlpha(seededRandom("g1"), 4);
    const a2 = randomAlpha(seededRandom("g1"), 4);
    expect(a1).toBe(a2);
    expect(validateAlpha(a1).ok).toBe(true);
  });

  it("mutateAlpha and crossoverAlpha keep formulas valid and inside caps", () => {
    const rng = seededRandom("g2");
    let current = "zn(mom(120, 5)) + zn(neg(vol(20)))";
    for (let i = 0; i < 25; i += 1) {
      current = mutateAlpha(current, rng);
      expect(validateAlpha(current).ok).toBe(true);
    }
    const crossed = crossoverAlpha(current, "ts_corr(returns, ts_mean(volume, 5), 20)", rng);
    expect(validateAlpha(crossed).ok).toBe(true);
    expect(alphaComplexity(parseAlpha(crossed))).toBeLessThan(100);
  });
});
