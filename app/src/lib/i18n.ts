import type { Lang } from "./types";

const T = {
  club: { zh: "量化研究部", en: "Quant Research Club" },
  academy: { zh: "星轨学园", en: "Stellar Orbit Academy" },
  start: { zh: "开始研究", en: "Start research" },
  pause: { zh: "暂停", en: "Pause" },
  oneRound: { zh: "开一次会", en: "One meeting" },
  running: { zh: "研究中", en: "Researching" },
  idle: { zh: "待机", en: "Idle" },
  fundNav: { zh: "基金净值", en: "Fund NAV" },
  pulls: { zh: "抽卡", en: "Pulls" },
  adopted: { zh: "采用", en: "Adopted" },
  meeting: { zh: "会议", en: "Meeting" },
  room: { zh: "部室", en: "Club" },
  dex: { zh: "图鉴", en: "Codex" },
  fund: { zh: "基金", en: "Fund" },
  log: { zh: "日志", en: "Log" },
  theory: { zh: "理论", en: "Theory" },
  settings: { zh: "设置", en: "Settings" },
  directive: { zh: "向研究部下达指示……（例：试试多资产趋势，控制换手）", en: "Give the club an order... (e.g. try multi-asset trend, keep turnover low)" },
  send: { zh: "下达", en: "Send" },
  pat: { zh: "摸头", en: "Head pat" },
  bonk: { zh: "敲头", en: "Bonk" },
  profile: { zh: "档案", en: "Profile" },
  enter: { zh: "进入部室", en: "Enter the club" },
  tapToStart: { zh: "点击开始", en: "Tap to start" },
  offline: { zh: "引擎未连接 —— 运行 ./start.sh 或 `uv run qrl serve`", en: "Engine offline — run ./start.sh or `uv run qrl serve`" },
  expectedLive: { zh: "预期实盘夏普", en: "Expected live Sharpe" },
  netSharpe: { zh: "扣费夏普", en: "Net Sharpe" },
  grossSharpe: { zh: "毛夏普", en: "Gross Sharpe" },
  all: { zh: "全部", en: "All" },
  promoted: { zh: "采用", en: "Adopted" },
  reserve: { zh: "候补", en: "Reserve" },
  rejected: { zh: "驳回", en: "Rejected" },
  empty: { zh: "还没有记录。点「开始研究」让研究部动起来。", en: "Nothing yet. Press Start research to wake the club." },
  close: { zh: "关闭", en: "Close" },
  stages: { zh: "审查流程", en: "Review pipeline" },
  waiting: { zh: "等待下一次会议……", en: "Waiting for the next meeting..." },
  source: { zh: "来源", en: "Source" },
  skip: { zh: "点击继续", en: "Click to continue" },
} as const;

export type Key = keyof typeof T;
export const t = (k: Key, lang: Lang) => T[k][lang];

export const STAGE_NAME: Record<string, { zh: string; en: string }> = {
  proposal: { zh: "假说", en: "Hypothesis" },
  integrity: { zh: "数据", en: "Data" },
  signal: { zh: "信号", en: "Signal" },
  backtest: { zh: "回测", en: "Backtest" },
  risk: { zh: "风控", en: "Risk" },
  skeptic: { zh: "审查", en: "Skeptic" },
  verdict: { zh: "决议", en: "Verdict" },
};

export const SOURCE_NAME: Record<string, { zh: string; en: string }> = {
  llm: { zh: "灵感", en: "Idea" },
  library: { zh: "文献", en: "Literature" },
  miner: { zh: "挖掘", en: "Miner" },
  refine: { zh: "改良", en: "Refine" },
  boss: { zh: "顾问", en: "Advisor" },
  manual: { zh: "手动", en: "Manual" },
};

export const UNIVERSE_NAME: Record<string, { zh: string; en: string }> = {
  us: { zh: "标普500", en: "S&P 500" },
  macro: { zh: "多资产", en: "Multi-asset" },
  sectors: { zh: "行业ETF", en: "Sectors" },
};

export const MODE_NAME: Record<string, { zh: string; en: string }> = {
  long_short: { zh: "多空", en: "Long/short" },
  long_only: { zh: "纯多", en: "Long-only" },
  time_series: { zh: "趋势", en: "Time-series" },
};

export const GATE_NAME: Record<string, { zh: string; en: string }> = {
  evidence: { zh: "证据强度", en: "Evidence" },
  consistency: { zh: "前后一致", en: "Consistency" },
  costs: { zh: "成本", en: "Costs" },
  stability: { zh: "稳定性", en: "Stability" },
  deflation: { zh: "多重检验", en: "Deflation" },
  posterior: { zh: "后验夏普", en: "Posterior" },
  novelty: { zh: "新颖性", en: "Novelty" },
  lockbox: { zh: "保险箱", en: "Lockbox" },
};
