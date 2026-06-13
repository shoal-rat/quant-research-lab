import { describe, expect, it } from "vitest";
import { parseMarketCsv } from "./csvParse";
import { InMemoryDatasetProvider } from "./inMemoryProvider";
import { metricsFromReturnSeries } from "../realBacktestEngine";
import { detectFrequency } from "../realMarket";
import { proposeStrategy } from "../hypothesisEngine";
import { defaultSettings } from "../../data/defaultSettings";
import { STRATEGY_FAMILIES } from "../strategyKnowledge";
import { BacktestParameters, ProposalContext } from "../../types";

const PRICE_FAMILIES = STRATEGY_FAMILIES.filter((family) => family.priceComputable).map((family) => family.key);

function isoDates(count: number): string[] {
  const dates: string[] = [];
  const base = Date.UTC(2015, 0, 1);
  for (let i = 0; i < count; i += 1) {
    dates.push(new Date(base + i * 86_400_000).toISOString().slice(0, 10));
  }
  return dates;
}

// deterministic pseudo-random walk so the test never flakes
function walk(seed: number, count: number): number[] {
  let state = seed * 7919 + 13;
  const out: number[] = [];
  let price = 100;
  for (let i = 0; i < count; i += 1) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    const shock = (state / 0x7fffffff - 0.5) * 0.04 + 0.0003;
    price = Math.max(1, price * (1 + shock));
    out.push(Number(price.toFixed(4)));
  }
  return out;
}

const TICKERS = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG", "HHH"];

function longCsv(): string {
  const dates = isoDates(420);
  const series = new Map(TICKERS.map((t, i) => [t, walk(i + 1, dates.length)]));
  const rows = ["date,ticker,close,industry"];
  dates.forEach((date, d) => {
    for (const ticker of TICKERS) {
      rows.push(`${date},${ticker},${series.get(ticker)![d]},Tech`);
    }
  });
  return rows.join("\n");
}

function wideCsv(): string {
  const dates = isoDates(420);
  const series = new Map(TICKERS.map((t, i) => [t, walk(i + 11, dates.length)]));
  const rows = [["date", ...TICKERS].join(",")];
  dates.forEach((date, d) => {
    rows.push([date, ...TICKERS.map((t) => series.get(t)![d])].join(","));
  });
  return rows.join("\n");
}

function proposalContext(overrides: Partial<ProposalContext> = {}): ProposalContext {
  return {
    settings: defaultSettings,
    memory: [],
    iteration: 3,
    experiments: [],
    explorationBias: 0,
    computableFamilies: PRICE_FAMILIES,
    ...overrides
  };
}

const PARAMS: BacktestParameters = {
  universe: TICKERS,
  dateRange: { start: "2015-01-02", end: "2016-12-31" },
  holdingPeriod: 5,
  portfolioType: "long_short",
  transactionCostBps: 12,
  benchmark: "SPY"
};

describe("pluggable datasets", () => {
  it("parses a long-format CSV into a price panel with a synthesized benchmark", () => {
    const { data, detected } = parseMarketCsv(longCsv(), "long.csv");
    expect(detected.layout).toBe("long");
    expect(data.dates.length).toBe(420);
    expect(Object.keys(data.tickers)).toContain("AAA");
    expect(data.benchmark).toBe("__EWBENCH__");
    expect(data.returns.AAA.length).toBe(420);
  });

  it("parses a wide-format CSV (one price column per ticker)", () => {
    const { data, detected } = parseMarketCsv(wideCsv(), "wide.csv");
    expect(detected.layout).toBe("wide");
    expect(Object.keys(data.tickers).length).toBeGreaterThanOrEqual(8);
    expect(data.dates.length).toBe(420);
  });

  it("backtests a user CSV through the in-memory provider without NaNs", async () => {
    const { data } = parseMarketCsv(longCsv(), "long.csv");
    const provider = new InMemoryDatasetProvider(data, "upload", "long.csv");
    expect(provider.meta().tickers).toBe(TICKERS.length);
    expect(provider.canBacktest("xs_momentum")).toBe(true);
    expect(provider.canBacktest("news_sentiment_momentum")).toBe(false);

    const strategy = proposeStrategy(proposalContext({ bossDirective: "momentum please" }));
    const output = await provider.runBacktest(strategy, PARAMS, { totalTrials: 1, priorCandidates: [] });
    expect(output).not.toBeNull();
    expect(output!.extras.dailyReturns.every((value) => Number.isFinite(value))).toBe(true);
    expect(Number.isFinite(output!.result.outOfSample.sharpeRatio)).toBe(true);
  });

  it("turns a CLI per-period return series into bounded honest metrics (bridge path)", () => {
    const dates = isoDates(500);
    const returns = walk(5, 500).map((_, i) => Math.sin(i / 8) * 0.003 + 0.0002);
    const output = metricsFromReturnSeries({
      returns,
      dates,
      trials: 4,
      priorCandidates: [],
      avgTurnover: 0.2,
      universeSize: 30,
      periodsPerYear: 252,
      dataUsed: "big.parquet via codex CLI"
    });
    expect(output.result.outOfSample.deflatedSharpe).toBeGreaterThanOrEqual(0);
    expect(output.result.outOfSample.deflatedSharpe).toBeLessThanOrEqual(1);
    expect(output.result.equityCurve.length).toBeGreaterThan(10);
    expect(Number.isFinite(output.result.full.sharpeRatio)).toBe(true);
  });

  it("detects sampling frequency from timestamp spacing", () => {
    const daily = isoDates(300);
    expect(detectFrequency(daily).frequency).toBe("daily");
    expect(detectFrequency(daily).periodsPerYear).toBe(252);

    // hourly timestamps (1-hour bars)
    const hourly: string[] = [];
    const base = Date.UTC(2020, 0, 1, 9, 0, 0);
    for (let i = 0; i < 300; i += 1) hourly.push(new Date(base + i * 3_600_000).toISOString().slice(0, 19));
    expect(detectFrequency(hourly).frequency).toBe("hourly");
    expect(detectFrequency(hourly).periodsPerYear).toBeGreaterThan(1000);

    // weekly timestamps (7-day bars)
    const weekly: string[] = [];
    for (let i = 0; i < 120; i += 1) weekly.push(new Date(Date.UTC(2015, 0, 1) + i * 7 * 86_400_000).toISOString().slice(0, 10));
    expect(detectFrequency(weekly).frequency).toBe("weekly");
    expect(detectFrequency(weekly).periodsPerYear).toBe(52);
  });

  it("annualizes Sharpe by frequency: weekly periodsPerYear is not daily", () => {
    const dates = isoDates(400);
    const series = walk(9, 400).map((_, i) => 0.002 + Math.sin(i / 11) * 0.001);
    const daily = metricsFromReturnSeries({ returns: series, dates, trials: 1, priorCandidates: [], universeSize: 20, periodsPerYear: 252, dataUsed: "d" });
    const weekly = metricsFromReturnSeries({ returns: series, dates, trials: 1, priorCandidates: [], universeSize: 20, periodsPerYear: 52, dataUsed: "w" });
    // same per-period series, different annualization -> different Sharpe by ~sqrt(252/52)
    expect(Math.abs(daily.result.full.sharpeRatio)).toBeGreaterThan(Math.abs(weekly.result.full.sharpeRatio));
  });

  it("parses intraday (hourly) CSV without collapsing bars to one day", () => {
    const rows = ["timestamp,ticker,close"];
    const base = Date.UTC(2021, 0, 4, 9, 30, 0);
    for (let bar = 0; bar < 300; bar += 1) {
      const ts = new Date(base + bar * 3_600_000).toISOString().slice(0, 19);
      for (const ticker of ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF"]) {
        rows.push(`${ts},${ticker},${(100 + bar * 0.1 + ticker.charCodeAt(0)).toFixed(2)}`);
      }
    }
    const { data, detected } = parseMarketCsv(rows.join("\n"), "intraday.csv");
    expect(data.dates.length).toBe(300); // 300 distinct hourly bars, NOT collapsed to a handful of days
    expect(detected.frequency).toBe("hourly");
    expect(data.periodsPerYear).toBeGreaterThan(1000);
  });
});
