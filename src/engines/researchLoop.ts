import {
  BacktestParameters,
  DebateLine,
  ExperimentRecord,
  LLMCapabilities,
  ResearchMemory,
  Settings,
  StrategySpec
} from "../types";
import { makeMockMarketData } from "./mockMarketData";
import { runBacktest } from "./backtestEngine";
import { decideExperimentStatus, reviewBacktestRisk } from "./riskReviewEngine";

export interface IterationInput {
  settings: Settings;
  memory: ResearchMemory[];
  iteration: number;
  experiments: ExperimentRecord[];
  bossDirective?: string;
  explorationBias: number;
  strictnessBias: number;
}

function managerDecision(status: ExperimentRecord["status"]): string {
  if (status === "candidate") return "Promote it as a candidate, but schedule one stress retest.";
  if (status === "retest_needed") return "Send it back for retest. The edge is not clean yet.";
  if (status === "rejected") return "Reject this version. Preserve the lesson and move on.";
  if (status === "failed_to_run") return "Archive the run log and simplify the implementation.";
  return "Archive it as informative but not worth current desk attention.";
}

function debateFor(
  strategy: StrategySpec,
  experiment: Omit<ExperimentRecord, "debate" | "skepticObjection" | "managerDecision" | "nextIterationSuggestion" | "agentSpeechSummary">,
  skepticObjection: string
): DebateLine[] {
  return [
    {
      role: "strategy_researcher",
      speaker: "Strategy Researcher",
      message: `${strategy.holdingPeriod}-day result has a plausible market story: ${strategy.hypothesis.slice(0, 90)}`
    },
    {
      role: "risk_reviewer",
      speaker: "Risk Reviewer",
      message: experiment.riskReview.summary
    },
    {
      role: "skeptic_researcher",
      speaker: "Skeptic Researcher",
      message: skepticObjection
    },
    {
      role: "experiment_manager",
      speaker: "Experiment Manager",
      message: managerDecision(experiment.status)
    }
  ];
}

export async function runResearchIteration(adapter: LLMCapabilities, input: IterationInput): Promise<ExperimentRecord> {
  const { settings, memory, iteration, experiments, bossDirective, explorationBias, strictnessBias } = input;
  const strategy = await adapter.proposeHypothesis({
    settings,
    memory,
    iteration,
    experiments,
    bossDirective,
    explorationBias
  });
  const generatedCode = await adapter.generateStrategyLogic(strategy);
  const marketRows = makeMockMarketData(settings.startDate, 430);
  const params: BacktestParameters = {
    universe: strategy.universe,
    dateRange: { start: settings.startDate, end: settings.endDate },
    holdingPeriod: strategy.holdingPeriod,
    portfolioType: strategy.portfolioType,
    transactionCostBps: settings.transactionCostBps,
    benchmark: "SPY"
  };
  const familyAttempts = experiments.filter((experiment) => experiment.familyKey === strategy.familyKey).length;
  const priorCandidates = experiments.filter((experiment) => experiment.status === "candidate");
  const backtest = runBacktest(strategy, params, marketRows, generatedCode, {
    familyAttempts,
    totalTrials: experiments.length + 1,
    priorCandidates
  });
  const riskReview = reviewBacktestRisk(strategy, backtest);
  const status = decideExperimentStatus(backtest, riskReview, generatedCode, strictnessBias);
  const createdAt = new Date().toISOString();

  const baseExperiment = {
    id: `EXP-${String(iteration).padStart(4, "0")}-${strategy.id.split("-").pop()}`,
    createdAt,
    lastUpdatedAt: createdAt,
    strategyName: strategy.name,
    strategyHypothesis: strategy.hypothesis,
    familyKey: strategy.familyKey,
    parentExperimentId: strategy.parentExperimentId,
    generation: strategy.generation,
    ideaMode: strategy.ideaMode,
    ideaReasoning: strategy.ideaReasoning,
    bossDirective: strategy.bossDirective,
    strategyParameters: strategy.parameters,
    dataRange: `${settings.startDate} to ${settings.endDate}`,
    dataUsed: backtest.dataUsed,
    factorLogic: strategy.factorLogic,
    backtestParameters: params,
    generatedCode,
    inSampleResult: backtest.inSample,
    outOfSampleResult: backtest.outOfSample,
    fullResult: backtest.full,
    equityCurve: backtest.equityCurve,
    riskReview,
    status
  };

  const skepticObjection = await adapter.challengeResult(baseExperiment as ExperimentRecord);
  const partial = { ...baseExperiment, skepticObjection } as Omit<
    ExperimentRecord,
    "debate" | "managerDecision" | "nextIterationSuggestion" | "agentSpeechSummary"
  >;
  const debate = debateFor(strategy, partial, skepticObjection);
  const nextIterationSuggestion = await adapter.suggestNextIteration({ ...partial, debate } as ExperimentRecord, memory);
  const decision = managerDecision(status);

  return {
    ...partial,
    debate,
    managerDecision: decision,
    nextIterationSuggestion,
    agentSpeechSummary: debate.map((line) => `${line.speaker}: ${line.message}`)
  };
}
