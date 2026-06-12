import { ExperimentRecord } from "../types";
import { round } from "./random";

// Alpha-pool analytics (AlphaGen / QuantEvolve / Bailey-Lopez de Prado):
// - pool-level Sharpe and the marginal ΔSharpe of adding one experiment
// - MAP-Elites niche archive over family x horizon x risk buckets
// - desk-level probability of backtest overfitting via CSCV

const TRADING_DAYS = 252;

interface Series {
  dailyReturns: number[];
  returnsStartIndex: number;
}

function hasSeries(experiment: ExperimentRecord): experiment is ExperimentRecord & Series {
  return Boolean(experiment.dailyReturns && experiment.dailyReturns.length > 60 && experiment.returnsStartIndex !== undefined);
}

function sharpeOf(returns: number[]): number {
  if (returns.length < 20) return 0;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, returns.length - 1);
  const vol = Math.sqrt(Math.max(variance, 1e-12));
  return (mean / vol) * Math.sqrt(TRADING_DAYS);
}

// equal-weight pool of stored return series, aligned on the union calendar
function poolReturns(members: Series[]): number[] {
  if (members.length === 0) return [];
  const start = Math.min(...members.map((member) => member.returnsStartIndex));
  const end = Math.max(...members.map((member) => member.returnsStartIndex + member.dailyReturns.length));
  const pooled: number[] = [];
  for (let index = start; index < end; index += 1) {
    let sum = 0;
    let count = 0;
    for (const member of members) {
      const offset = index - member.returnsStartIndex;
      if (offset >= 0 && offset < member.dailyReturns.length) {
        sum += member.dailyReturns[offset];
        count += 1;
      }
    }
    if (count > 0) pooled.push(sum / count);
  }
  return pooled;
}

export function poolSharpe(candidates: ExperimentRecord[]): number {
  const members = candidates.filter(hasSeries);
  return round(sharpeOf(poolReturns(members)), 2);
}

// the headline reward: how much does the candidate pool's Sharpe move if this
// experiment joins it?
export function poolSharpeDelta(experiment: Series, candidates: ExperimentRecord[]): number {
  const members = candidates.filter(hasSeries);
  const before = sharpeOf(poolReturns(members));
  const after = sharpeOf(poolReturns([...members, experiment]));
  return round(after - before, 3);
}

export function poolEquitySeries(candidates: ExperimentRecord[]): number[] {
  const returns = poolReturns(candidates.filter(hasSeries));
  const equity: number[] = [];
  let value = 1;
  for (const ret of returns) {
    value *= 1 + ret;
    equity.push(round(value, 4));
  }
  return equity;
}

// ---------------------------------------------------------------------------
// MAP-Elites niche archive: family x holding bucket x risk bucket
// ---------------------------------------------------------------------------

export interface Niche {
  key: string;
  familyKey: string;
  holdingBucket: "fast" | "weekly" | "monthly";
  riskBucket: "calm" | "normal" | "wild";
  best?: ExperimentRecord;
  attempts: number;
}

export function nicheKeyFor(experiment: ExperimentRecord): string {
  const holding = experiment.backtestParameters.holdingPeriod;
  const holdingBucket = holding <= 3 ? "fast" : holding <= 5 ? "weekly" : "monthly";
  const dd = Math.abs(experiment.outOfSampleResult.maxDrawdown);
  const riskBucket = dd < 0.08 ? "calm" : dd < 0.18 ? "normal" : "wild";
  return `${experiment.familyKey}|${holdingBucket}|${riskBucket}`;
}

export function eliteScore(experiment: ExperimentRecord): number {
  const oos = experiment.outOfSampleResult;
  return oos.sharpeRatio * 0.6 + oos.deflatedSharpe * 1.2 + oos.robustnessScore / 100 - oos.alphaPoolCorrelation * 0.4;
}

export function buildArchive(experiments: ExperimentRecord[]): Map<string, Niche> {
  const archive = new Map<string, Niche>();
  for (const experiment of experiments) {
    const key = nicheKeyFor(experiment);
    const [familyKey, holdingBucket, riskBucket] = key.split("|") as [string, Niche["holdingBucket"], Niche["riskBucket"]];
    const niche = archive.get(key) ?? { key, familyKey, holdingBucket, riskBucket, attempts: 0 };
    niche.attempts += 1;
    if (
      (experiment.status === "candidate" || experiment.status === "retest_needed") &&
      (!niche.best || eliteScore(experiment) > eliteScore(niche.best))
    ) {
      niche.best = experiment;
    }
    archive.set(key, niche);
  }
  return archive;
}

// ---------------------------------------------------------------------------
// CSCV probability of backtest overfitting (Bailey, Borwein, Lopez de Prado,
// Zhu): split time into S blocks, for every half-split find the in-sample
// winner among trials and check whether it beats the median out-of-sample.
// ---------------------------------------------------------------------------

function combinations<T>(items: T[], choose: number): T[][] {
  const results: T[][] = [];
  const recurse = (start: number, current: T[]) => {
    if (current.length === choose) {
      results.push([...current]);
      return;
    }
    for (let index = start; index < items.length; index += 1) {
      current.push(items[index]);
      recurse(index + 1, current);
      current.pop();
    }
  };
  recurse(0, []);
  return results;
}

export interface PboReport {
  pbo: number;
  trialsUsed: number;
  combosUsed: number;
}

export function computePbo(experiments: ExperimentRecord[], blocks = 8): PboReport | null {
  const trials = experiments.filter(hasSeries).slice(-20);
  if (trials.length < 5) return null;
  // align on the shared overlap window
  const start = Math.max(...trials.map((trial) => trial.returnsStartIndex));
  const end = Math.min(...trials.map((trial) => trial.returnsStartIndex + trial.dailyReturns!.length));
  const length = end - start;
  if (length < blocks * 20) return null;

  const blockSize = Math.floor(length / blocks);
  const blockSharpe: number[][] = trials.map((trial) => {
    const offset = start - trial.returnsStartIndex;
    const perBlock: number[] = [];
    for (let block = 0; block < blocks; block += 1) {
      const slice = trial.dailyReturns!.slice(offset + block * blockSize, offset + (block + 1) * blockSize);
      perBlock.push(sharpeOf(slice));
    }
    return perBlock;
  });

  const indices = Array.from({ length: blocks }, (_, index) => index);
  const splits = combinations(indices, blocks / 2);
  let overfit = 0;
  let used = 0;
  for (const inBlocks of splits) {
    const outBlocks = indices.filter((index) => !inBlocks.includes(index));
    const inScores = blockSharpe.map((perBlock) => inBlocks.reduce((sum, block) => sum + perBlock[block], 0));
    const outScores = blockSharpe.map((perBlock) => outBlocks.reduce((sum, block) => sum + perBlock[block], 0));
    const winner = inScores.indexOf(Math.max(...inScores));
    const sortedOut = [...outScores].sort((a, b) => a - b);
    const rank = sortedOut.indexOf(outScores[winner]);
    const relative = rank / (sortedOut.length - 1);
    if (relative < 0.5) overfit += 1;
    used += 1;
  }
  return { pbo: round(overfit / Math.max(1, used), 3), trialsUsed: trials.length, combosUsed: used };
}
