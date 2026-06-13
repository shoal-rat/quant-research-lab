import { BacktestParameters, ExperimentRecord, StrategySpec } from "../../types";
import { RealBacktestOutput } from "../realBacktestEngine";

// A pluggable source of market data the research loop can backtest against.
// In-memory providers (bundled JSON, uploaded/remote CSV) hold the data in the
// browser; the bridge provider keeps a dataset too large to hold in the browser
// where it lives and delegates the heavy read to the connected CLI.
export interface DatasetMeta {
  kind: string;
  label: string;
  tickers: number;
  start: string;
  end: string;
  rows: number;
  inMemory: boolean;
  note?: string;
}

export interface DatasetBacktestContext {
  totalTrials: number;
  priorCandidates: ExperimentRecord[];
}

export interface DatasetProvider {
  meta(): DatasetMeta;
  // a compact human/LLM-readable profile so the CLI research brain reasons
  // about the data actually in front of it
  profileText(): string;
  // family keys this dataset can backtest (null = the CLI decides for itself)
  computableFamilies(): string[] | null;
  canBacktest(familyKey: string): boolean;
  // returns null on any failure so the caller can degrade to the mock simulator
  runBacktest(
    strategy: StrategySpec,
    params: BacktestParameters,
    context: DatasetBacktestContext
  ): Promise<RealBacktestOutput | null>;
}
