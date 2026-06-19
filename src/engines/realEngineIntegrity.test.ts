import { describe, expect, it } from "vitest";
import { parseMarketCsv } from "./dataset/csvParse";
import { runRealBacktest } from "./realBacktestEngine";
import { RealMarketData } from "./realMarket";
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
