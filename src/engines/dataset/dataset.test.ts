import { describe, expect, it } from "vitest";
import { parseMarketCsv } from "./csvParse";
import { InMemoryDatasetProvider } from "./inMemoryProvider";
import { metricsFromDailyReturns } from "../realBacktestEngine";
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

  it("turns a CLI daily-return series into bounded honest metrics (bridge path)", () => {
    const dates = isoDates(500);
    const returns = walk(5, 500).map((_, i) => Math.sin(i / 8) * 0.003 + 0.0002);
    const output = metricsFromDailyReturns({
      returns,
      dates,
      trials: 4,
      priorCandidates: [],
      avgTurnover: 0.2,
      universeSize: 30,
      dataUsed: "big.parquet via codex CLI"
    });
    expect(output.result.outOfSample.deflatedSharpe).toBeGreaterThanOrEqual(0);
    expect(output.result.outOfSample.deflatedSharpe).toBeLessThanOrEqual(1);
    expect(output.result.equityCurve.length).toBeGreaterThan(10);
    expect(Number.isFinite(output.result.full.sharpeRatio)).toBe(true);
  });
});
