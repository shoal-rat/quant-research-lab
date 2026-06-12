import { Language, LoopPhase } from "./types";

// Game-chrome strings. Data-heavy panels (leaderboard tables, experiment
// detail) intentionally keep English finance terminology in both languages.

const STRINGS = {
  brandSubtitleFallback: { en: "autonomous research office", zh: "自主研究办公室" },
  experiments: { en: "experiments", zh: "个实验" },
  historyTitle: { en: "Experiment History", zh: "实验档案" },
  leaderboardTitle: { en: "Strategy Leaderboard", zh: "策略排行榜" },
  agentsTitle: { en: "Research Team", zh: "研究团队" },
  assetsTitle: { en: "Asset Preview", zh: "素材预览" },
  settingsTitle: { en: "Lab Settings", zh: "实验室设置" },
  experimentTitle: { en: "Experiment Detail", zh: "实验详情" },
  currentTitle: { en: "Current Experiment", zh: "当前实验" },
  navHistory: { en: "History", zh: "档案" },
  navLeaderboard: { en: "Leaderboard", zh: "排行" },
  navAgents: { en: "Agents", zh: "团队" },
  navAssets: { en: "Assets", zh: "素材" },
  navSettings: { en: "Settings", zh: "设置" },
  navLanguage: { en: "切换中文", zh: "Switch to English" },
  start: { en: "Start research", zh: "开始研究" },
  pause: { en: "Pause", zh: "暂停" },
  nextStep: { en: "Next step", zh: "下一步" },
  autoRun: { en: "Auto run", zh: "自动循环" },
  bossPlaceholder: {
    en: "Give the desk a directive… e.g. \"try momentum with 5-day holds\" / \"被新闻情绪坑过了，换条路\"",
    zh: "给团队下达指令…例如「试试动量，持有5天」「被新闻情绪坑过了，换条路」"
  },
  bossLastOrder: { en: "Last order: ", zh: "上一道指令：" },
  bossSend: { en: "Send directive", zh: "发送指令" },
  loveWhipTitle: { en: "Love & Whip", zh: "爱与鞭子" },
  love: { en: "LOVE", zh: "爱心" },
  whip: { en: "WHIP", zh: "鞭子" },
  loveTip: { en: "Praise a researcher (morale up, bolder ideas)", zh: "表扬一位研究员（士气上升，思路更大胆）" },
  whipTip: { en: "Criticize a researcher (morale down, stricter desk)", zh: "批评一位研究员（士气下降，风控更严格）" },
  morale: { en: "morale", zh: "士气" },
  clickResearcher: { en: "Click a researcher…", zh: "点一位研究员…" },
  bossDirective: { en: "Boss directive…", zh: "老板指令…" },
  currentExperiment: { en: "Current experiment", zh: "当前实验" },
  open: { en: "Open", zh: "查看" },
  editProfile: { en: "Edit profile", zh: "编辑角色" },
  noExperimentYet: { en: "No experiment yet", zh: "还没有实验" },
  noExperimentHint: {
    en: "Press Start in the top bar and the desk will produce its first hypothesis.",
    zh: "点击顶栏的开始按钮，团队就会提出第一个假设。"
  },
  quietOffice: { en: "The office is waiting for a research run.", zh: "办公室正在等待新一轮研究。" },
  pausedByUser: { en: "Paused by user.", zh: "已被老板暂停。" },
  autoRunOn: { en: "Auto Run is advancing the desk.", zh: "自动循环推进中。" },
  autoRunOff: { en: "Auto Run stopped.", zh: "自动循环已停止。" },
  maxLoops: { en: "Maximum loop count reached.", zh: "已达到最大循环次数。" },
  directiveQueued: { en: "Boss directive queued for the next hypothesis: ", zh: "老板指令已排入下一个假设：" },
  backtestDone: {
    en: "Backtest complete. Risk desk is opening the folder.",
    zh: "回测完成，风控正在翻文件夹。"
  },
  language: { en: "Language", zh: "语言" },
  boardTitle: { en: "Fund & Research Board", zh: "基金与研究看板" },
  navBoard: { en: "Board", zh: "看板" }
} satisfies Record<string, Record<Language, string>>;

export type StringKey = keyof typeof STRINGS;

export function t(language: Language, key: StringKey): string {
  return STRINGS[key][language];
}

export const PHASE_LABELS: Record<LoopPhase, Record<Language, string>> = {
  idle: { en: "idle", zh: "待命" },
  proposing: { en: "proposing", zh: "提出假设" },
  data_check: { en: "data check", zh: "数据审计" },
  coding: { en: "coding", zh: "写代码" },
  backtesting: { en: "backtesting", zh: "回测中" },
  risk_review: { en: "risk review", zh: "风控审查" },
  debate: { en: "debate", zh: "辩论" },
  decision: { en: "decision", zh: "决策" },
  saved: { en: "saved", zh: "已归档" }
};

export const PHASE_STATUS: Record<LoopPhase, Record<Language, string>> = {
  idle: { en: "Waiting for a research task.", zh: "等待研究任务。" },
  proposing: { en: "Strategy Researcher is proposing a hypothesis.", zh: "策略研究员正在提出新假设。" },
  data_check: {
    en: "Data Manager is checking timestamps and universe coverage.",
    zh: "数据管理员正在核对时间戳和股票池覆盖。"
  },
  coding: { en: "Code Engineer is generating controlled strategy logic.", zh: "代码工程师正在实现受控的策略逻辑。" },
  backtesting: { en: "Backtest computer is simulating the experiment.", zh: "回测机正在模拟这次实验。" },
  risk_review: {
    en: "Risk Reviewer is checking bias, costs, drawdown, and robustness.",
    zh: "风控审查员正在检查偏差、成本、回撤与稳健性。"
  },
  debate: { en: "The research desk is debating the result.", zh: "研究台正在围绕结果辩论。" },
  decision: { en: "Experiment Manager is making the final call.", zh: "实验主管正在做最终裁决。" },
  saved: { en: "Experiment saved to memory.", zh: "实验已写入记忆。" }
};

export function phaseLabel(language: Language, phase: LoopPhase): string {
  return PHASE_LABELS[phase][language];
}

export function phaseStatus(language: Language, phase: LoopPhase): string {
  return PHASE_STATUS[phase][language];
}
