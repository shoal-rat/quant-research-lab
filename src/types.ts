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
  | "archived";

export type RiskCheckStatus = "pass" | "warn" | "fail";

export type LoopPhase =
  | "idle"
  | "proposing"
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
export type Language = "en" | "zh";

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
  mockLLMEnabled: boolean;
  catchphrasesShown: boolean;
  casualOfficeChatter: boolean;
  reducedAnimation: boolean;
  themeMode: "warm" | "dark" | "light";
  officeViewMode: "2d" | "legacy3d";
  dialogueBackend: DialogueBackend;
  anthropicApiKey: string;
  openaiApiKey: string;
  bridgeUrl: string;
  language: Language;
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
  ideaMode: "explore" | "refine" | "boss_directive";
  ideaReasoning: string[];
  bossDirective?: string;
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
  concentrationScore: number;
  yearDependencyScore: number;
  deflatedSharpe: number;
  trialsAtDiscovery: number;
  alphaPoolCorrelation: number;
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
  ideaMode: "explore" | "refine" | "boss_directive";
  ideaReasoning: string[];
  bossDirective?: string;
  strategyParameters: Record<string, number | string | boolean>;
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
