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
import { RealBacktestExtras } from "./realBacktestEngine";
import { poolSharpeDelta } from "./poolAnalytics";
import { decideExperimentStatus, reviewBacktestRisk } from "./riskReviewEngine";
import { DatasetProvider } from "./dataset/types";
import { buildResearchWorkflowAudit } from "./researchWorkflow";
import { computeWalkForward } from "./walkForward";

export interface IterationInput {
  settings: Settings;
  memory: ResearchMemory[];
  iteration: number;
  experiments: ExperimentRecord[];
  bossDirective?: string;
  explorationBias: number;
  strictnessBias: number;
  datasetProvider: DatasetProvider | null;
}

function managerDecision(status: ExperimentRecord["status"]): string {
  if (status === "candidate") return "Promote it as a candidate, but schedule one stress retest.";
  if (status === "retest_needed") return "Send it back for retest. The edge is not clean yet.";
  if (status === "rejected") return "Reject this version. Preserve the lesson and move on.";
  if (status === "failed_to_run") return "Archive the run log and simplify the implementation.";
  if (status === "not_backtestable")
    return "Illustrative only — the dataset can't backtest this family, so it can't be scored or promoted.";
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

export interface IterationDraft {
  iteration: number;
  strategy: StrategySpec;
  generatedCode: string;
  // the provider the hypothesis was grounded in; the backtest reuses this exact
  // instance so a mid-iteration dataset switch can't desync proposal vs backtest
  provider: DatasetProvider | null;
}

// Phase 1: the hypothesis exists from the moment "proposing" starts, so the
// office can narrate the real new idea during data_check/coding.
export async function prepareIteration(
  adapter: LLMCapabilities,
  input: Omit<IterationInput, "strictnessBias">
): Promise<IterationDraft> {
  const { settings, memory, iteration, experiments, bossDirective, explorationBias, datasetProvider } = input;
  const strategy = await adapter.proposeHypothesis({
    settings,
    memory,
    iteration,
    experiments,
    bossDirective,
    explorationBias,
    datasetProfile: datasetProvider?.profileText(),
    computableFamilies: datasetProvider ? datasetProvider.computableFamilies() : null
  });
  const generatedCode = await adapter.generateStrategyLogic(strategy);
  return { iteration, strategy, generatedCode, provider: datasetProvider };
}

// Phase 2: backtest + review + debate for a previously prepared draft.
export async function completeIteration(
  adapter: LLMCapabilities,
  input: IterationInput,
  draft: IterationDraft
): Promise<ExperimentRecord> {
  const { settings, memory, iteration, experiments, strictnessBias } = input;
  const { strategy, generatedCode, provider: datasetProvider } = draft;
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

  // The active dataset provider (bundled / your CSV / remote / a large source
  // read by the CLI) backtests price-computable families; anything else — or a
  // provider that fails — degrades to the deterministic mock simulator so the
  // office never stalls.
  let backtest;
  let extras: RealBacktestExtras | undefined;
  let datasetLabel: string | undefined;
  const output =
    datasetProvider && datasetProvider.canBacktest(strategy.familyKey)
      ? await datasetProvider.runBacktest(strategy, params, { totalTrials: experiments.length + 1, priorCandidates })
      : null;
  if (output) {
    backtest = output.result;
    backtest.generatedCode = generatedCode;
    backtest.synthetic = false;
    extras = output.extras;
    datasetLabel = datasetProvider?.meta().label;
    // keep stored series bounded for localStorage (last ~6 years)
    if (extras.dailyReturns.length > 1500) {
      extras.returnsStartIndex += extras.dailyReturns.length - 1500;
      extras.dailyReturns = extras.dailyReturns.slice(-1500);
    }
  } else {
    // No real backtest is possible for this family on the active dataset (e.g. a
    // news/earnings factor on a close-only price panel). The mock simulator
    // produces an ILLUSTRATIVE curve so the office has something to narrate, but
    // the result is flagged synthetic and hard-locked to "not_backtestable" — it
    // never reaches the admission gate, the pool, the leaderboard, or NAV.
    const marketRows = makeMockMarketData(settings.startDate, 430);
    backtest = runBacktest(strategy, params, marketRows, generatedCode, {
      familyAttempts,
      totalTrials: experiments.length + 1,
      priorCandidates
    });
    backtest.synthetic = true;
    datasetLabel = "Illustrative mock simulator (no real data for this family)";
  }
  const riskReview = reviewBacktestRisk(strategy, backtest);
  // the candidate gate uses the pool-ΔSharpe (does this alpha ADD to the pool?);
  // synthetic results are excluded from any real decision.
  const poolDelta = extras ? poolSharpeDelta(extras, priorCandidates) : undefined;
  // purged + embargoed walk-forward on the true daily series, fed INTO the gate so
  // a single-regime fluke can't be promoted (previously this was display-only).
  const walkForwardPassRate =
    extras && extras.dailyReturns.length > 0
      ? computeWalkForward(extras.dailyReturns, extras.dates, {
          holding: strategy.holdingPeriod,
          periodsPerYear: extras.periodsPerYear ?? 252
        })?.passRate
      : undefined;
  const status: ExperimentRecord["status"] = backtest.synthetic
    ? "not_backtestable"
    : decideExperimentStatus(backtest, riskReview, generatedCode, strictnessBias, poolDelta, walkForwardPassRate);
  const createdAt = new Date().toISOString();
  const workflowAudit = buildResearchWorkflowAudit({
    strategy,
    backtest,
    riskReview,
    experiments,
    settings,
    params,
    dataUsed: backtest.dataUsed,
    status,
    humanReviewRequired: settings.humanReviewRequired,
    // feed the validation panel the FULL per-bar daily series + true annualization
    // (not the decimated equity curve), so walk-forward/regime/decay Sharpes are right
    dailyReturns: extras?.dailyReturns,
    benchmarkReturns: extras?.benchmarkReturns,
    returnDates: extras?.dates,
    periodsPerYear: extras?.periodsPerYear
  });

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
    dataSource: extras ? ("real" as const) : ("mock" as const),
    datasetLabel,
    dailyReturns: extras?.dailyReturns,
    returnsStartIndex: extras?.returnsStartIndex,
    poolSharpeDelta: poolDelta,
    factorAnalytics: backtest.factorAnalytics,
    factorAnalyticsOOS: backtest.factorAnalyticsOOS,
    synthetic: backtest.synthetic,
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
    status,
    workflowAudit
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

export async function runResearchIteration(adapter: LLMCapabilities, input: IterationInput): Promise<ExperimentRecord> {
  const draft = await prepareIteration(adapter, input);
  return completeIteration(adapter, input, draft);
}
