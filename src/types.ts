export type AgentRole =
  | "strategy_researcher"
  | "code_engineer"
  | "risk_reviewer"
  | "skeptic_researcher"
  | "experiment_manager"
  | "data_manager";

export type AgentState =
  | "idle"
  | "walking"
  | "thinking"
  | "coding"
  | "debating"
  | "whispering"
  | "drinking_tea"
  | "checking_chart"
  | "excited"
  | "angry"
  | "tired"
  | "confused";

export type OfficeAreaId =
  | "workstations"
  | "whiteboard"
  | "meeting"
  | "tea"
  | "data_cabinet"
  | "leaderboard"
  | "backtest_computer"
  | "window";

export type ExperimentStatus =
  | "candidate"
  | "rejected"
  | "retest_needed"
  | "failed_to_run"
  | "archived"
  // synthetic / illustrative path: the active dataset cannot actually backtest
  // this family (e.g. a news/earnings factor on a close-only price panel), so the
  // numbers are from the mock simulator and must NEVER be promoted, pooled, or
  // counted in NAV. The UI shows it as "ILLUSTRATIVE — NO REAL DATA".
  | "not_backtestable";

export type RiskCheckStatus = "pass" | "warn" | "fail";

export type LoopPhase =
  | "idle"
  | "proposing"
  | "human_review"
  | "data_check"
  | "coding"
  | "backtesting"
  | "risk_review"
  | "debate"
  | "decision"
  | "saved";

export type PortfolioType = "long_short" | "long_only";
export type HoldingPeriod = 1 | 3 | 5 | 20;

export interface AgentCrop {
  scale: number;
  x: number;
  y: number;
}

export interface AgentAppearance {
  themeColor: string;
  hairColor: string;
  bubbleColor: string;
  clothingStyle: string;
  bodyStyle: string;
}

export interface AgentProfile {
  id: string;
  role: AgentRole;
  name: string;
  defaultAssetPath?: string;
  designSheetPath?: string;
  avatarDataUrl?: string;
  characterImageDataUrl?: string;
  crop: AgentCrop;
  appearance: AgentAppearance;
  catchphrases: string[];
  personality: string;
  defaultEmotion: AgentState;
  commonActions: AgentState[];
  visible: boolean;
  casualChatter: boolean;
  exaggeratedEmotions: boolean;
}

export interface AgentRuntime {
  agentId: string;
  state: AgentState;
  area: OfficeAreaId;
  x: number;
  y: number;
  emotionNote: string;
  message?: string;
  priorityUntil: number;
}

export type DialogueBackend = "local" | "anthropic" | "openai" | "claude-code" | "codex";
export type DataSource = "mock" | "real";
// This is an LLM-native project: the research brain is always one of the two
// agentic CLIs. There is no offline/heuristic brain to select.
export type ResearchBrain = "claude-code" | "codex";
export type IdeaMode = "explore" | "refine" | "boss_directive" | "repair" | "recombine";
export type Language = "en" | "zh";
export type ResearchSourceKind =
  | "sec_filing"
  | "earnings_call"
  | "regulatory_filing"
  | "company_press_release"
  | "academic_paper"
  | "industry_report"
  | "sell_side"
  | "news"
  | "github"
  | "forum"
  | "reddit"
  | "x"
  | "anonymous_rumor"
  | "other";
export type CredibilityTier = "high" | "medium_high" | "medium" | "low" | "very_low";
export type NoveltyVerdict = "novel" | "known_factor" | "duplicate" | "needs_review";
export type HumanReviewStatus = "pending" | "approved" | "rejected" | "edited" | "not_required";

export interface ResearchSourceCitation {
  title: string;
  sourceType: ResearchSourceKind;
  url?: string;
  publishedAt?: string;
  accessedAt?: string;
  credibilityScore: number;
  credibilityTier: CredibilityTier;
  note?: string;
}

export interface ResearchDiscoveryCard {
  phenomenon: string;
  whyAlphaMayExist: string;
  tradableUniverse: string;
  requiredData: string[];
  signalConstruction: string;
  timestampLag: string;
  holdingPeriod: string;
  failureRisks: string[];
  sourceCitations: ResearchSourceCitation[];
}

export interface CompiledSignal {
  universe: string;
  feature: string;
  rank: string;
  lag: string;
  hold: string;
  portfolio: PortfolioType;
  formula: string;
  rebalance: string;
}

export interface SourceCredibilityReport {
  score: number;
  tier: CredibilityTier;
  sources: ResearchSourceCitation[];
  warnings: string[];
}

export interface NoveltyCheck {
  verdict: NoveltyVerdict;
  nearestKnownFactor: string;
  knownFactorSimilarity: number;
  momentumOverlap: number;
  testedBefore: boolean;
  highCorrelationToPool: boolean;
  similarFailures: string[];
  notes: string[];
}

export interface PointInTimeDataLayer {
  asOfPolicy: string;
  timestampLag: string;
  requiredDatasets: string[];
  revisionPolicy: string;
  leakChecks: string[];
}

export interface ExperimentRegistryV2 {
  hypothesisSource: string;
  dataUsed: string[];
  parameterChanges: string[];
  failureReason?: string;
  similarPastExperiments: string[];
  repeatedIdea: boolean;
  forwardTested: boolean;
  reviewStatus: HumanReviewStatus;
}

export interface WalkForwardWindow {
  trainRange: string;
  testRange: string;
  testSharpe: number;
  testReturn: number;
  passed: boolean;
}

export interface WalkForwardReport {
  windows: WalkForwardWindow[];
  passRate: number;
  worstSharpe: number;
  summary: string;
}

export interface RegimeResult {
  regime: string;
  observations: number;
  sharpe: number;
  cumulativeReturn: number;
  maxDrawdown: number;
  note: string;
}

export interface RegimeAnalysis {
  regimes: RegimeResult[];
  bestRegime: string;
  worstRegime: string;
  summary: string;
}

export interface AlphaDecayReport {
  lifetimeSharpe: number;
  recentSharpe: number;
  sharpeDecline: number;
  turnoverTrend: string;
  crowdingTrend: string;
  retirementSignal: boolean;
  summary: string;
}

export interface CapacityReport {
  advParticipation: number;
  marketImpactBps: number;
  bidAskSpreadBps: number;
  borrowCostBps: number;
  maxDeployableCapitalUsd: number | null; // null until a real volume/ADV feed exists
  bottleneck: string;
  // these figures are algebra over turnover/concentration — there is no volume or
  // spread data in a close-only panel — so they are flagged illustrative, never
  // presented as liquidity-validated numbers.
  illustrative: boolean;
  basis: string;
}

export interface ExecutionSimulationReport {
  slippageBps: number;
  latencyMs: number;
  partialFillRate: number;
  openGapRisk: number;
  closeAuctionRisk: number;
  haltStressLoss: number;
  limitMoveRisk: number;
  summary: string;
  illustrative: boolean;
  basis: string;
}

export interface FeatureStoreRecord {
  featureName: string;
  dataSource: string;
  updateTime: string;
  timestampLag: string;
  coverage: number;
  missingRate: number;
  lookaheadRisk: "low" | "medium" | "high";
  owner: AgentRole;
}

export interface HumanReviewState {
  status: HumanReviewStatus;
  reviewer?: string;
  notes: string;
  checklist: string[];
}

export interface MemoryGraphNode {
  id: string;
  label: string;
  type: "idea" | "source" | "feature" | "strategy" | "failure" | "success";
  status?: string;
}

export interface MemoryGraphLink {
  from: string;
  to: string;
  relation: string;
  strength: number;
}

export interface ResearchMemoryGraph {
  nodes: MemoryGraphNode[];
  links: MemoryGraphLink[];
}

export interface PaperTradingSnapshot {
  status: "queued" | "running" | "complete";
  startDate: string;
  daysLive: number;
  forwardSharpe?: number;
  forwardReturn?: number;
  nextSignalDate: string;
  notes: string;
}

export interface AgentEvaluationReport {
  ideaAgent: string;
  compilerAgent: string;
  riskAgent: string;
  sourceUtilityScore: number;
  promptOverfitRisk: number;
  notes: string[];
}

export interface BaselineComparison {
  baseline: string;
  sharpe: number;
  excessSharpe: number;
  returnDelta: number;
  passed: boolean;
}

export interface StrategyLibraryCard {
  source: string;
  intuition: string;
  formula: string;
  backtest: string;
  risk: string;
  usableData: string[];
  currentStatus: ExperimentStatus;
}

export interface ResearchFeedEvent {
  id: string;
  timestamp: string;
  agent: string;
  action: string;
  detail: string;
  status: "info" | "blocked" | "approved" | "archived";
}

export interface ResearchWorkflowAudit {
  discoveryCard: ResearchDiscoveryCard;
  compiledSignal: CompiledSignal;
  credibility: SourceCredibilityReport;
  novelty: NoveltyCheck;
  pointInTime: PointInTimeDataLayer;
  registry: ExperimentRegistryV2;
  walkForward: WalkForwardReport;
  regimes: RegimeAnalysis;
  alphaDecay: AlphaDecayReport;
  capacity: CapacityReport;
  execution: ExecutionSimulationReport;
  feature: FeatureStoreRecord;
  humanReview: HumanReviewState;
  memoryGraph: ResearchMemoryGraph;
  paperTrading: PaperTradingSnapshot;
  agentEvaluation: AgentEvaluationReport;
  baselines: BaselineComparison[];
  libraryCard: StrategyLibraryCard;
  researchFeed: ResearchFeedEvent[];
}

// Pluggable datasets. "bundled" is the shipped 20y JSON; "mock" the
// deterministic simulator; "upload"/"remote" are user CSV/JSON parsed in the
// browser; "bridge" delegates to the connected CLI so a dataset too large to
// hold in the browser (a local file, Parquet, or a SQL database) is read where
// it lives and only the strategy's daily returns come back.
export type DatasetKind = "bundled" | "mock" | "upload" | "remote" | "bridge";
export type BridgeSourceKind = "file" | "url" | "parquet" | "duckdb" | "sqlite" | "postgres";

export interface DatasetColumns {
  date: string;
  ticker: string;
  close: string;
  industry?: string;
}

export interface DatasetConfig {
  kind: DatasetKind;
  label: string;
  // upload (raw CSV text is held in a runtime registry, not persisted)
  uploadName?: string;
  // remote CSV/JSON fetched into the browser
  remoteUrl?: string;
  // bridge: a reference the CLI resolves (path / URL / DSN) + how to read it
  bridgeRef?: string;
  bridgeSourceKind?: BridgeSourceKind;
  // optional SQL/where clause or table for database sources
  bridgeQuery?: string;
  // column mapping for csv-like sources (auto-detected when omitted)
  columns?: DatasetColumns;
  benchmarkSymbol?: string;
}

export interface Settings {
  researchTaskName: string;
  stockUniverse: string;
  startDate: string;
  endDate: string;
  holdingPeriod: HoldingPeriod;
  transactionCostBps: number;
  maximumLoopCount: number;
  experimentsPerLoop: number;
  newsEnabled: boolean;
  technicalIndicatorsEnabled: boolean;
  humanReviewRequired: boolean;
  mockLLMEnabled: boolean;
  catchphrasesShown: boolean;
  casualOfficeChatter: boolean;
  reducedAnimation: boolean;
  themeMode: "warm" | "dark" | "light";
  officeViewMode: "2d" | "legacy3d";
  dialogueBackend: DialogueBackend;
  anthropicApiKey: string;
  openaiApiKey: string;
  // Alpaca PAPER trading keys (optional). Sent only to the local bridge, which
  // calls the paper endpoint; never to any other host. Empty = the bridge uses its
  // own QRL_ALPACA_KEY_FILE instead.
  paperApiKey?: string;
  paperApiSecret?: string;
  bridgeUrl: string;
  language: Language;
  dataset: DatasetConfig;
  researchBrain: ResearchBrain;
}

export interface MarketRow {
  ticker: string;
  stockName: string;
  industry: string;
  date: string;
  close: number;
  dailyReturn: number;
  newsHeadline: string;
  newsTimestamp: string;
  relatedTicker: string;
  newsSentiment: number;
  eventType: string;
}

export type FactorKind =
  | "news_sentiment"
  | "momentum"
  | "mean_reversion"
  | "low_volatility"
  | "event_drift"
  | "quality_proxy"
  | "seasonality"
  | "lead_lag"
  | "pairs"
  | "vol_managed"
  | "earnings_revision"
  | "trend_overlay";

export interface StrategySpec {
  id: string;
  name: string;
  hypothesis: string;
  factorLogic: string;
  factorKind: FactorKind;
  familyKey: string;
  holdingPeriod: HoldingPeriod;
  portfolioType: PortfolioType;
  universe: string[];
  parameters: Record<string, number | string | boolean>;
  parentExperimentId?: string;
  generation: number;
  ideaMode: IdeaMode;
  ideaReasoning: string[];
  bossDirective?: string;
  discoveryCard?: ResearchDiscoveryCard;
  compiledSignal?: CompiledSignal;
}

export interface BacktestParameters {
  universe: string[];
  dateRange: {
    start: string;
    end: string;
  };
  holdingPeriod: HoldingPeriod;
  portfolioType: PortfolioType;
  transactionCostBps: number;
  benchmark: string;
}

export interface PerformanceMetrics {
  cumulativeReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
  turnover: number;
  returnAfterCosts: number;
  robustnessScore: number;
  overfittingRiskScore: number;
  randomBaselineSharpe: number;
  // true only when randomBaselineSharpe is an actually-simulated random-rank Sharpe
  // (not the sentinel 0). The "beat random" gate abstains when this is not true so a
  // hardcoded 0 can never silently satisfy it on the bridge/agent path.
  randomBaselineMeasured?: boolean;
  concentrationScore: number;
  yearDependencyScore: number;
  deflatedSharpe: number;
  trialsAtDiscovery: number;
  alphaPoolCorrelation: number;
  // expanded risk-adjusted metrics (empyrical/quantstats conventions); optional
  // so older stored experiments and the mock path stay valid
  sortino?: number;
  calmar?: number;
  probabilisticSharpe?: number;
}

export interface QuantileBucket {
  quantile: number;
  meanForwardReturn: number;
  count: number;
}

// Alphalens-style evaluation of the raw signal (not the portfolio).
export interface FactorAnalytics {
  horizon: number;
  observations: number;
  icMean: number;
  icStd: number;
  icIR: number;
  icTStat: number;
  hitRate: number;
  icDecay: Array<{ horizon: number; ic: number }>;
  quantiles: QuantileBucket[];
  quantileSpread: number;
  quantileMonotonic: boolean;
  rankAutocorrelation: number;
}

export interface EquityPoint {
  date: string;
  equity: number;
  benchmark: number;
  drawdown: number;
  split: "in_sample" | "out_of_sample";
}

export interface BacktestResult {
  inSample: PerformanceMetrics;
  outOfSample: PerformanceMetrics;
  full: PerformanceMetrics;
  equityCurve: EquityPoint[];
  generatedCode: string;
  dataUsed: string;
  factorAnalytics?: FactorAnalytics; // full-sample, for display
  factorAnalyticsOOS?: FactorAnalytics; // out-of-sample only, used by the admission gate
  // true when produced by the mock simulator (no real backtest possible for this
  // family on the active dataset); such results are illustrative and never promoted.
  synthetic?: boolean;
  // median recent daily dollar volume of the traded universe (when the dataset
  // carries volume), enabling a MEASURED capacity model instead of a heuristic.
  medianDollarVolume?: number;
}

export interface RiskCheck {
  id: string;
  label: string;
  status: RiskCheckStatus;
  detail: string;
}

export interface RiskReview {
  checks: RiskCheck[];
  summary: string;
  retestRecommendation: string;
  passedRiskChecks: number;
}

export interface DebateLine {
  role: AgentRole;
  speaker: string;
  message: string;
}

export interface ExperimentRecord {
  id: string;
  createdAt: string;
  lastUpdatedAt: string;
  strategyName: string;
  strategyHypothesis: string;
  familyKey: string;
  parentExperimentId?: string;
  generation: number;
  ideaMode: IdeaMode;
  ideaReasoning: string[];
  bossDirective?: string;
  strategyParameters: Record<string, number | string | boolean>;
  dataSource?: DataSource;
  datasetLabel?: string;
  dailyReturns?: number[];
  returnsStartIndex?: number;
  poolSharpeDelta?: number;
  factorAnalytics?: FactorAnalytics;
  factorAnalyticsOOS?: FactorAnalytics;
  synthetic?: boolean;
  dataRange: string;
  dataUsed: string;
  factorLogic: string;
  backtestParameters: BacktestParameters;
  generatedCode: string;
  inSampleResult: PerformanceMetrics;
  outOfSampleResult: PerformanceMetrics;
  fullResult: PerformanceMetrics;
  equityCurve: EquityPoint[];
  riskReview: RiskReview;
  skepticObjection: string;
  debate: DebateLine[];
  managerDecision: string;
  nextIterationSuggestion: string;
  status: ExperimentStatus;
  agentSpeechSummary: string[];
  workflowAudit?: ResearchWorkflowAudit;
}

export interface SpeechBubble {
  id: string;
  agentId: string;
  role: AgentRole;
  speaker: string;
  message: string;
  createdAt: number;
  tone: AgentState;
}

export interface ResearchMemory {
  id: string;
  text: string;
  textZh: string;
  weight: number;
}

export interface ResearchLoopState {
  phase: LoopPhase;
  running: boolean;
  autoRun: boolean;
  iteration: number;
  loopCountCompleted: number;
  currentExperimentId?: string;
  pendingExperiment?: Partial<ExperimentRecord>;
  statusMessage: string;
  activeObject?: OfficeAreaId;
}

export interface ProposalContext {
  settings: Settings;
  memory: ResearchMemory[];
  iteration: number;
  experiments: ExperimentRecord[];
  bossDirective?: string;
  explorationBias: number;
  // a short text profile of the active dataset (universe size, span, columns,
  // sample stats) so the CLI brain reasons about the data actually in front of
  // it rather than a fixed family table
  datasetProfile?: string;
  // family keys the active dataset can actually backtest (null = all)
  computableFamilies?: string[] | null;
}

export interface LLMCapabilities {
  proposeHypothesis(context: ProposalContext): Promise<StrategySpec>;
  generateStrategyLogic(strategy: StrategySpec): Promise<string>;
  reviewRisk(experiment: ExperimentRecord): Promise<RiskReview>;
  challengeResult(experiment: ExperimentRecord): Promise<string>;
  summarizeExperiment(experiment: ExperimentRecord): Promise<string>;
  suggestNextIteration(experiment: ExperimentRecord, memory: ResearchMemory[]): Promise<string>;
  generateOfficeSpeech(context: OfficeSpeechContext): Promise<SpeechBubble[]>;
}

export interface OfficeSpeechContext {
  phase: LoopPhase;
  experiment?: ExperimentRecord;
  agents: AgentProfile[];
  timestamp: number;
}

export interface AgentMood {
  agentId: string;
  morale: number;
  praises: number;
  scolds: number;
  lastBossAction?: "love" | "whip";
  lastBossActionAt: number;
}

export type BossActionKind = "love" | "whip" | "directive";

export interface BossEvent {
  id: string;
  kind: BossActionKind;
  text?: string;
  targetAgentId?: string;
  createdAt: number;
}

export interface ConversationLine {
  agentId: string;
  text: string;
  tone: AgentState;
}

export interface ConversationScript {
  id: string;
  topicKey: string;
  spot: string;
  participantIds: string[];
  lines: ConversationLine[];
  priority: number;
}
