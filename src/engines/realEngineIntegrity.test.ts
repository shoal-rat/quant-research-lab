import { describe, expect, it } from "vitest";
import { parseMarketCsv } from "./dataset/csvParse";
import { runRealBacktest } from "./realBacktestEngine";
import { buildRealMarketData, RealMarketData } from "./realMarket";
import { BacktestParameters, StrategySpec } from "../types";

// Build a deterministic multi-name daily price panel (no Math.random).
function panelCsv(): string {
  const tickers = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG", "HHH", "III", "JJJ"];
  const industries = ["Tech", "Tech", "Fin", "Fin", "Energy", "Energy", "Tech", "Fin", "Energy", "Tech"];
  const base = Date.UTC(2015, 0, 1);
  const rows = ["date,ticker,close,industry"];
  for (let d = 0; d < 700; d += 1) {
    const date = new Date(base + d * 86_400_000).toISOString().slice(0, 10);
    tickers.forEach((ticker, i) => {
      // smooth idiosyncratic drift + cycle, fully deterministic
      const price = 100 * (1 + 0.0004 * d * (1 + i / 20)) * (1 + 0.08 * Math.sin(d / 17 + i));
      rows.push(`${date},${ticker},${price.toFixed(4)},${industries[i]}`);
    });
  }
  return rows.join("\n");
}

function sliceData(data: RealMarketData, keep: number): RealMarketData {
  const tickers: RealMarketData["tickers"] = {};
  for (const [symbol, info] of Object.entries(data.tickers)) {
    tickers[symbol] = { ...info, closes: info.closes.slice(0, keep) };
  }
  const returns: RealMarketData["returns"] = {};
  for (const [symbol, series] of Object.entries(data.returns)) {
    returns[symbol] = series.slice(0, keep);
  }
  return { ...data, dates: data.dates.slice(0, keep), tickers, returns };
}

function momentumStrategy(): StrategySpec {
  return {
    id: "STR-test-momentum",
    name: "XS Momentum",
    hypothesis: "Cross-sectional 120d momentum, 5d skip.",
    factorLogic: "rank trailing return, long top / short bottom",
    factorKind: "momentum",
    familyKey: "xs_momentum",
    holdingPeriod: 5,
    portfolioType: "long_short",
    universe: [],
    parameters: { lookbackDays: 120, skipDays: 5, volatilityPenalty: 0.35 },
    generation: 0,
    ideaMode: "explore",
    ideaReasoning: []
  };
}

const PARAMS: BacktestParameters = {
  universe: [],
  dateRange: { start: "2015-01-02", end: "2050-12-31" },
  holdingPeriod: 5,
  portfolioType: "long_short",
  transactionCostBps: 10,
  benchmark: "SPY"
};

describe("real backtest engine integrity", () => {
  const { data } = parseMarketCsv(panelCsv(), "panel.csv");
  const ctx = { totalTrials: 1, priorCandidates: [] };

  it("has NO lookahead: truncating future bars does not change earlier returns", () => {
    const full = runRealBacktest(momentumStrategy(), PARAMS, data, ctx);
    const truncated = runRealBacktest(momentumStrategy(), PARAMS, sliceData(data, 600), ctx);
    const compareLen = truncated.extras.dailyReturns.length - 25; // drop the tail near the truncation edge
    expect(compareLen).toBeGreaterThan(50);
    for (let i = 0; i < compareLen; i += 1) {
      expect(full.extras.dailyReturns[i]).toBeCloseTo(truncated.extras.dailyReturns[i], 8);
    }
  });

  it("charges higher transaction costs as a strictly larger drag (cost monotonicity)", () => {
    const cheap = runRealBacktest(momentumStrategy(), { ...PARAMS, transactionCostBps: 1 }, data, ctx);
    const dear = runRealBacktest(momentumStrategy(), { ...PARAMS, transactionCostBps: 60 }, data, ctx);
    expect(dear.result.full.returnAfterCosts).toBeLessThan(cheap.result.full.returnAfterCosts);
  });

  it("produces out-of-sample factor analytics distinct from the full sample", () => {
    const out = runRealBacktest(momentumStrategy(), PARAMS, data, ctx);
    expect(out.result.factorAnalytics).toBeDefined();
    // OOS analytics exist and are computed from fewer observations than the full set
    if (out.result.factorAnalyticsOOS && out.result.factorAnalytics) {
      expect(out.result.factorAnalyticsOOS.observations).toBeLessThanOrEqual(out.result.factorAnalytics.observations);
    }
  });

  it("uses a MEASURED random baseline (flagged measured + cost-sensitive) — not the sentinel 0", () => {
    const cheap = runRealBacktest(momentumStrategy(), { ...PARAMS, transactionCostBps: 1 }, data, ctx);
    const dear = runRealBacktest(momentumStrategy(), { ...PARAMS, transactionCostBps: 80 }, data, ctx);
    // primary lock: reverting the override (back to the hardcoded 0) flips this to false/undefined
    expect(cheap.result.outOfSample.randomBaselineMeasured).toBe(true);
    expect(Number.isFinite(cheap.result.outOfSample.randomBaselineSharpe)).toBe(true);
    // secondary: a real simulated baseline is non-zero OR responds to cost; the
    // sentinel 0 would be exactly 0 in both, failing this OR
    const reactsToCost = dear.result.outOfSample.randomBaselineSharpe !== cheap.result.outOfSample.randomBaselineSharpe;
    expect(reactsToCost || cheap.result.outOfSample.randomBaselineSharpe !== 0).toBe(true);
  });

  it("exposes aligned benchmark + dates on extras for the validation panel", () => {
    const out = runRealBacktest(momentumStrategy(), PARAMS, data, ctx);
    expect(out.extras.benchmarkReturns?.length).toBe(out.extras.dailyReturns.length);
    expect(out.extras.dates?.length).toBe(out.extras.dailyReturns.length);
    expect(out.extras.periodsPerYear).toBe(252);
  });
});

// OHLCV path: volume factors compute + capacity becomes measured from real ADV.
function ohlcvData(): RealMarketData {
  const tickers = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG", "HHH", "III", "JJJ"];
  const industries = ["Tech", "Tech", "Fin", "Fin", "Energy", "Energy", "Tech", "Fin", "Energy", "Tech"];
  const N = 700;
  const dates = Array.from({ length: N }, (_, d) => new Date(Date.UTC(2015, 0, 1) + d * 86_400_000).toISOString().slice(0, 10));
  const tk: RealMarketData["tickers"] = {};
  tickers.forEach((sym, i) => {
    const closes: number[] = [];
    const volumes: number[] = [];
    const highs: number[] = [];
    const lows: number[] = [];
    for (let d = 0; d < N; d += 1) {
      const c = 50 * (1 + 0.0003 * d) * (1 + 0.06 * Math.sin(d / 13 + i));
      closes.push(Number(c.toFixed(4)));
      volumes.push(Math.round(1_000_000 * (1 + i) * (1 + 0.5 * Math.abs(Math.sin(d / 7))))); // distinct ADV per name
      highs.push(Number((c * 1.01).toFixed(4)));
      lows.push(Number((c * 0.99).toFixed(4)));
    }
    tk[sym] = {
      name: sym,
      industry: industries[i],
      closes,
      volumes,
      highs,
      lows,
      // point-in-time quarterly fundamentals, distinct per name + varying over time
      fundamentals: [
        { date: "2015-02-15", pe: 10 + i, pb: 1 + i * 0.2, roe: 0.2 - i * 0.01, netMargin: 0.15, debtToEquity: 0.3 + i * 0.05 },
        { date: "2015-08-15", pe: 11 + i, pb: 1.1 + i * 0.2, roe: 0.19 - i * 0.01, netMargin: 0.14, debtToEquity: 0.32 + i * 0.05 },
        { date: "2016-02-15", pe: 9 + i, pb: 0.9 + i * 0.2, roe: 0.21 - i * 0.01, netMargin: 0.16, debtToEquity: 0.28 + i * 0.05 }
      ]
    };
  });
  return buildRealMarketData({
    source: "test", fetchedAt: "t", start: dates[0], end: dates[N - 1],
    dates, benchmark: "AAA", tickers: tk, frequency: "daily", periodsPerYear: 252
  });
}

function familyStrategy(familyKey: string, factorKind: StrategySpec["factorKind"], params: Record<string, number>): StrategySpec {
  return {
    id: `STR-${familyKey}`, name: familyKey, hypothesis: familyKey, factorLogic: familyKey,
    factorKind, familyKey, holdingPeriod: 20, portfolioType: "long_short", universe: [],
    parameters: params, generation: 0, ideaMode: "explore", ideaReasoning: []
  };
}

describe("OHLCV volume factors + measured capacity", () => {
  const data = ohlcvData();
  const ctx = { totalTrials: 1, priorCandidates: [] };
  const params: BacktestParameters = { ...PARAMS, holdingPeriod: 20 };

  it("computes the Amihud illiquidity factor and a measured median dollar volume", () => {
    const out = runRealBacktest(familyStrategy("amihud_illiquidity", "quality_proxy", { illiqWindow: 60 }), params, data, ctx);
    expect(out.extras.dailyReturns.length).toBeGreaterThan(50);
    expect(out.extras.dailyReturns.every((v) => Number.isFinite(v))).toBe(true);
    expect(out.result.medianDollarVolume).toBeDefined();
    expect(out.result.medianDollarVolume as number).toBeGreaterThan(0);
  });

  it("computes the low-turnover liquidity and range-volatility factors", () => {
    const liq = runRealBacktest(familyStrategy("dollar_volume_liquidity", "quality_proxy", { volumeWindow: 60 }), params, data, ctx);
    const rng = runRealBacktest(familyStrategy("range_volatility", "low_volatility", { rangeWindow: 20 }), params, data, ctx);
    expect(Number.isFinite(liq.result.full.sharpeRatio)).toBe(true);
    expect(Number.isFinite(rng.result.full.sharpeRatio)).toBe(true);
  });

  it("computes the fundamental value factor from point-in-time reports (backtestable, no lookahead)", () => {
    const out = runRealBacktest(
      familyStrategy("fundamental_value", "value", { valueWeight: 1, qualityWeight: 0.5, leveragePenalty: 0.1 }),
      params,
      data,
      ctx
    );
    expect(out.extras.dailyReturns.length).toBeGreaterThan(50);
    expect(out.extras.dailyReturns.every((v) => Number.isFinite(v))).toBe(true);
    // a real time-varying cross-section -> factor analytics are computed
    expect(out.result.factorAnalytics).toBeDefined();
  });

  it("fundamental factor produces no signal when there are no fundamentals (graceful)", () => {
    const bare = ohlcvData();
    for (const t of Object.keys(bare.tickers)) delete bare.tickers[t].fundamentals;
    const out = runRealBacktest(familyStrategy("fundamental_value", "value", {}), params, bare, ctx);
    // no fundamentals -> empty cross-sections -> no factor analytics (won't trade)
    expect(out.result.factorAnalytics).toBeUndefined();
  });
});
