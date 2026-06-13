import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { defaultSettings } from "../data/defaultSettings";
import { chooseDirection, armPosteriors } from "./banditEngine";
import { computePbo, poolSharpe, poolSharpeDelta, buildArchive } from "./poolAnalytics";
import { computeLevel, computeXp, ACHIEVEMENTS } from "./progression";
import { runRealBacktest } from "./realBacktestEngine";
import { RealMarketData } from "./realMarket";
import { proposeStrategy } from "./hypothesisEngine";
import { STRATEGY_FAMILIES } from "./strategyKnowledge";
import { ExperimentRecord, ProposalContext } from "../types";

const PRICE_FAMILIES = STRATEGY_FAMILIES.filter((family) => family.priceComputable).map((family) => family.key);

function loadDataset(): RealMarketData {
  const file = path.join(__dirname, "..", "..", "public", "assets", "data", "market-real.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as RealMarketData;
  data.returns = {};
  for (const [symbol, ticker] of Object.entries(data.tickers)) {
    const returns: (number | null)[] = [null];
    for (let index = 1; index < ticker.closes.length; index += 1) {
      const previous = ticker.closes[index - 1];
      const current = ticker.closes[index];
      returns.push(previous && current ? current / previous - 1 : null);
    }
    data.returns[symbol] = returns;
  }
  return data;
}

const dataset = loadDataset();

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

function fakeExperiment(overrides: Partial<ExperimentRecord>): ExperimentRecord {
  const metrics = {
    cumulativeReturn: 0.2,
    annualizedReturn: 0.08,
    maxDrawdown: -0.1,
    sharpeRatio: 1,
    winRate: 0.55,
    turnover: 0.4,
    returnAfterCosts: 0.2,
    robustnessScore: 60,
    overfittingRiskScore: 30,
    randomBaselineSharpe: 0,
    concentrationScore: 0.3,
    yearDependencyScore: 0.3,
    deflatedSharpe: 0.7,
    trialsAtDiscovery: 3,
    alphaPoolCorrelation: 0.2
  };
  return {
    id: "EXP-T",
    createdAt: "",
    lastUpdatedAt: "",
    strategyName: "Test",
    strategyHypothesis: "",
    familyKey: "xs_momentum",
    generation: 0,
    ideaMode: "explore",
    ideaReasoning: [],
    strategyParameters: {},
    dataRange: "",
    dataUsed: "",
    factorLogic: "",
    backtestParameters: {
      universe: [],
      dateRange: { start: "2015-01-02", end: "2026-06-12" },
      holdingPeriod: 5,
      portfolioType: "long_short",
      transactionCostBps: 12,
      benchmark: "SPY"
    },
    generatedCode: "",
    inSampleResult: metrics,
    outOfSampleResult: metrics,
    fullResult: metrics,
    equityCurve: [],
    riskReview: { checks: [], summary: "", retestRecommendation: "", passedRiskChecks: 0 },
    skepticObjection: "",
    debate: [],
    managerDecision: "",
    nextIterationSuggestion: "",
    status: "candidate",
    agentSpeechSummary: [],
    ...overrides
  };
}

describe("real-data engine", () => {
  it("bundled dataset spans ~20 years with a full cross-section", () => {
    expect(dataset.dates.length).toBeGreaterThan(4500);
    expect(Object.keys(dataset.tickers).length).toBeGreaterThanOrEqual(25);
    expect(dataset.dates[0] < "2007-01-01").toBe(true);
  });

  it("backtests momentum on real prices without lookahead artifacts or NaNs", () => {
    const strategy = proposeStrategy(proposalContext({ bossDirective: "momentum please" }));
    const { result, extras } = runRealBacktest(
      strategy,
      {
        universe: strategy.universe,
        dateRange: { start: "2015-01-02", end: "2026-06-12" },
        holdingPeriod: 5,
        portfolioType: "long_short",
        transactionCostBps: 12,
        benchmark: "SPY"
      },
      dataset,
      { totalTrials: 1, priorCandidates: [] }
    );
    expect(extras.dailyReturns.length).toBeGreaterThan(500);
    expect(extras.dailyReturns.every((value) => Number.isFinite(value))).toBe(true);
    expect(Number.isFinite(result.outOfSample.sharpeRatio)).toBe(true);
    expect(result.outOfSample.deflatedSharpe).toBeGreaterThanOrEqual(0);
    expect(result.outOfSample.deflatedSharpe).toBeLessThanOrEqual(1);
    expect(result.equityCurve[0].date >= "2015-01-02").toBe(true);
    // a sane daily long/short portfolio never moves 50% in a day
    expect(Math.max(...extras.dailyReturns.map(Math.abs))).toBeLessThan(0.5);
  });

  it("higher costs strictly reduce real-data returns", () => {
    const strategy = proposeStrategy(proposalContext({ bossDirective: "momentum please" }));
    const run = (costBps: number) =>
      runRealBacktest(
        strategy,
        {
          universe: strategy.universe,
          dateRange: { start: "2018-01-02", end: "2024-12-31" },
          holdingPeriod: 5,
          portfolioType: "long_short",
          transactionCostBps: costBps,
          benchmark: "SPY"
        },
        dataset,
        { totalTrials: 1, priorCandidates: [] }
      ).result.full.cumulativeReturn;
    expect(run(80)).toBeLessThan(run(1));
  });

  it("real-mode proposals never pick news-driven families", () => {
    for (let iteration = 1; iteration <= 25; iteration += 1) {
      const strategy = proposeStrategy(proposalContext({ iteration }));
      expect(["pead", "news_sentiment_momentum", "crowded_news_fade", "earnings_revision"]).not.toContain(
        strategy.familyKey
      );
    }
  });

  it("the direction bandit is deterministic and respects eligibility", () => {
    const a = chooseDirection([], { hasRefinable: false, hasRepairable: false, hasRecombinable: false, explorationBias: 0, seed: "x" });
    const b = chooseDirection([], { hasRefinable: false, hasRepairable: false, hasRecombinable: false, explorationBias: 0, seed: "x" });
    expect(a.arm).toBe(b.arm);
    expect(a.arm).toBe("explore");
    expect(armPosteriors([]).length).toBe(4);
  });

  it("pool ΔSharpe and PBO behave sanely on synthetic series", () => {
    const up = Array.from({ length: 400 }, (_, index) => 0.001 + Math.sin(index / 9) * 0.004);
    const down = up.map((value) => -value);
    const member = fakeExperiment({ id: "A", dailyReturns: up, returnsStartIndex: 100 });
    const hedge = { dailyReturns: down, returnsStartIndex: 100 };
    expect(poolSharpe([member])).toBeGreaterThan(0);
    // adding the perfect hedge collapses pool Sharpe
    expect(poolSharpeDelta(hedge, [member])).toBeLessThan(0);

    const trials = Array.from({ length: 6 }, (_, t) =>
      fakeExperiment({
        id: `T${t}`,
        dailyReturns: up.map((value, index) => value * Math.sin(index / (7 + t))),
        returnsStartIndex: 100
      })
    );
    const report = computePbo(trials);
    expect(report).not.toBeNull();
    expect(report!.pbo).toBeGreaterThanOrEqual(0);
    expect(report!.pbo).toBeLessThanOrEqual(1);
  });

  it("MAP-Elites archive keeps the best per niche", () => {
    const weak = fakeExperiment({ id: "W", outOfSampleResult: { ...fakeExperiment({}).outOfSampleResult, sharpeRatio: 0.4 } });
    const strong = fakeExperiment({ id: "S", outOfSampleResult: { ...fakeExperiment({}).outOfSampleResult, sharpeRatio: 1.6 } });
    const archive = buildArchive([weak, strong]);
    const niche = [...archive.values()][0];
    expect(niche.attempts).toBe(2);
    expect(niche.best?.id).toBe("S");
  });

  it("progression levels rise with achievements earnable", () => {
    const empty = computeLevel(computeXp({ experiments: [], bossEvents: [], mood: {} }));
    expect(empty.level).toBe(1);
    const many = Array.from({ length: 30 }, (_, index) => fakeExperiment({ id: `E${index}` }));
    const leveled = computeLevel(computeXp({ experiments: many, bossEvents: [], mood: {} }));
    expect(leveled.level).toBeGreaterThan(3);
    const first = ACHIEVEMENTS.find((achievement) => achievement.id === "first-candidate")!;
    expect(first.earned({ experiments: many, bossEvents: [], mood: {}, settings: defaultSettings })).toBe(true);
  });
});
