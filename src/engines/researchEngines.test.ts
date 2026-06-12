import { describe, expect, it } from "vitest";
import { defaultSettings } from "../data/defaultSettings";
import { makeMockMarketData, parseUniverse } from "./mockMarketData";
import { MockQuantLLMAdapter } from "./llmAdapters";
import { runBacktest } from "./backtestEngine";
import { reviewBacktestRisk } from "./riskReviewEngine";
import { parseBossDirective, proposeStrategy } from "./hypothesisEngine";
import { getFamily } from "./strategyKnowledge";
import { DIALOGUE_TEMPLATES } from "./dialogue/banks/generated";
import { ProposalContext } from "../types";

function proposalContext(overrides: Partial<ProposalContext> = {}): ProposalContext {
  return {
    settings: defaultSettings,
    memory: [],
    iteration: 3,
    experiments: [],
    explorationBias: 0,
    ...overrides
  };
}

describe("research engines", () => {
  it("generates deterministic but non-empty mock market data", () => {
    const data = makeMockMarketData("2021-01-04", 12);
    expect(data.length).toBeGreaterThan(50);
    expect(data[0]).toMatchObject({
      ticker: "AAPL",
      eventType: "earnings"
    });
    expect(makeMockMarketData("2021-01-04", 12)[4]).toEqual(data[4]);
  });

  it("proposes strategies with a family, reasoning trace, and parameters", () => {
    const strategy = proposeStrategy(proposalContext());
    expect(strategy.familyKey.length).toBeGreaterThan(0);
    expect(strategy.ideaReasoning.length).toBeGreaterThanOrEqual(3);
    expect(Object.keys(strategy.parameters).length).toBeGreaterThanOrEqual(2);
    expect(strategy.generation).toBe(0);
    // deterministic for the same context
    const again = proposeStrategy(proposalContext());
    expect(again.familyKey).toBe(strategy.familyKey);
  });

  it("the authored dialogue bank is large, bilingual, and well-formed", () => {
    expect(DIALOGUE_TEMPLATES.length).toBeGreaterThanOrEqual(140);
    const topics = new Set(DIALOGUE_TEMPLATES.map((template) => template.topic));
    ["proposing", "risk_review", "debate", "saved", "gossip", "boss_ack", "love", "whip"].forEach((topic) =>
      expect(topics.has(topic)).toBe(true)
    );
    DIALOGUE_TEMPLATES.forEach((template) => {
      expect(template.lines.length).toBeGreaterThanOrEqual(2);
      template.lines.forEach((line) => {
        expect(line.en.length).toBeGreaterThan(1);
        expect(line.zh).toMatch(/[一-鿿]/);
      });
    });
  });

  it("mutated parameters always stay inside their documented [min, max] ranges", () => {
    for (let iteration = 1; iteration <= 40; iteration += 1) {
      const strategy = proposeStrategy(proposalContext({ iteration }));
      const family = getFamily(strategy.familyKey);
      family.parameters.forEach((parameter) => {
        const value = strategy.parameters[parameter.name] as number;
        expect(value).toBeGreaterThanOrEqual(parameter.min);
        expect(value).toBeLessThanOrEqual(parameter.max);
      });
    }
  });

  it("directive keywords do not fire on lookalike words", () => {
    expect(parseBossDirective("watch the two sigma crowd and gamma exposure").familyKeys).not.toContain("trend_overlay");
    expect(parseBossDirective("universe of 152 stocks please").familyKeys).not.toContain("fifty_two_week_high");
    expect(parseBossDirective("use a 200ma trend filter").familyKeys).toContain("trend_overlay");
  });

  it("boss directives steer family choice and horizon", () => {
    const hints = parseBossDirective("Try momentum with 5 day holds, long only, and be strict about risk");
    expect(hints.familyKeys).toContain("xs_momentum");
    expect(hints.holdingPeriod).toBe(5);
    expect(hints.portfolioType).toBe("long_only");
    expect(hints.stricter).toBe(true);

    const strategy = proposeStrategy(proposalContext({ bossDirective: "momentum please" }));
    expect(strategy.ideaMode).toBe("boss_directive");
    expect(strategy.familyKey).toBe("xs_momentum");
  });

  it("transaction costs reduce reported returns", async () => {
    const adapter = new MockQuantLLMAdapter();
    const strategy = await adapter.proposeHypothesis(proposalContext());
    const code = await adapter.generateStrategyLogic(strategy);
    const data = makeMockMarketData(defaultSettings.startDate, 220);
    const params = (costBps: number) => ({
      universe: parseUniverse(defaultSettings.stockUniverse),
      dateRange: { start: defaultSettings.startDate, end: defaultSettings.endDate },
      holdingPeriod: strategy.holdingPeriod,
      portfolioType: strategy.portfolioType,
      transactionCostBps: costBps,
      benchmark: "SPY"
    });
    const lowCost = runBacktest(strategy, params(1), data, code);
    const highCost = runBacktest(strategy, params(60), data, code);
    expect(highCost.outOfSample.returnAfterCosts).toBeLessThan(lowCost.outOfSample.returnAfterCosts);
  });

  it("deflated Sharpe shrinks as the trial count grows", async () => {
    const adapter = new MockQuantLLMAdapter();
    const strategy = await adapter.proposeHypothesis(proposalContext());
    const code = await adapter.generateStrategyLogic(strategy);
    const data = makeMockMarketData(defaultSettings.startDate, 220);
    const params = {
      universe: parseUniverse(defaultSettings.stockUniverse),
      dateRange: { start: defaultSettings.startDate, end: defaultSettings.endDate },
      holdingPeriod: strategy.holdingPeriod,
      portfolioType: strategy.portfolioType,
      transactionCostBps: 12,
      benchmark: "SPY"
    };
    const fewTrials = runBacktest(strategy, params, data, code, { familyAttempts: 0, totalTrials: 1, priorCandidates: [] });
    const manyTrials = runBacktest(strategy, params, data, code, { familyAttempts: 0, totalTrials: 60, priorCandidates: [] });
    expect(manyTrials.outOfSample.deflatedSharpe).toBeLessThanOrEqual(fewTrials.outOfSample.deflatedSharpe);
    expect(manyTrials.outOfSample.trialsAtDiscovery).toBe(60);
  });

  it("risk review can fail weak or overfit experiments and includes the new gates", async () => {
    const adapter = new MockQuantLLMAdapter();
    const strategy = await adapter.proposeHypothesis(proposalContext({ iteration: 7, settings: { ...defaultSettings, holdingPeriod: 1 } }));
    const code = await adapter.generateStrategyLogic(strategy);
    const backtest = runBacktest(
      strategy,
      {
        universe: parseUniverse(defaultSettings.stockUniverse),
        dateRange: { start: defaultSettings.startDate, end: defaultSettings.endDate },
        holdingPeriod: 1,
        portfolioType: "long_short",
        transactionCostBps: 95,
        benchmark: "SPY"
      },
      makeMockMarketData(defaultSettings.startDate, 220),
      code
    );
    const review = reviewBacktestRisk(strategy, backtest);
    expect(review.checks.some((check) => check.status === "warn" || check.status === "fail")).toBe(true);
    expect(review.checks.some((check) => check.id === "deflated_sharpe")).toBe(true);
    expect(review.checks.some((check) => check.id === "alpha_pool_correlation")).toBe(true);
    expect(review.passedRiskChecks).toBeLessThanOrEqual(review.checks.length);
  });
});
