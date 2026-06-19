// Alphalens-style evaluation of a RAW signal, before any portfolio is built.
// Professionals grade an alpha by how well its cross-sectional ranking predicts
// forward returns — the Information Coefficient — not just by an equity curve.
// Everything here is a pure function of (signal, forward-return) cross-sections
// the backtester already produces, so it adds no new data dependency.
// Refs: Alphalens factor_information_coefficient / mean_return_by_quantile
// (github.com/stefan-jansen/alphalens-reloaded), Grinold IC-IR.

import { FactorAnalytics, QuantileBucket } from "../types";

export interface FactorCrossSection {
  // one rebalance date: aligned per-name signal and forward returns by horizon
  signal: number[];
  forwardByHorizon: Record<number, number[]>; // horizon (bars) -> per-name fwd return
}

const HORIZONS = [1, 5, 10, 20];

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function std(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1));
}

// fractional (average-tie) ranks, like scipy.stats.rankdata
function ranks(values: number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const out = new Array<number>(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].value === order[i].value) j += 1;
    const avgRank = (i + j) / 2 + 1; // 1-based average rank for the tie block
    for (let k = i; k <= j; k += 1) out[order[k].index] = avgRank;
    i = j + 1;
  }
  return out;
}

function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  const ma = mean(a);
  const mb = mean(b);
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i += 1) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  if (va <= 0 || vb <= 0) return null;
  return cov / Math.sqrt(va * vb);
}

// Spearman rank IC: Pearson correlation of the cross-sectional ranks.
export function spearmanIC(signal: number[], forward: number[]): number | null {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < Math.min(signal.length, forward.length); i += 1) {
    if (Number.isFinite(signal[i]) && Number.isFinite(forward[i])) pairs.push([signal[i], forward[i]]);
  }
  if (pairs.length < 5) return null; // too few names to rank meaningfully
  return pearson(
    ranks(pairs.map((p) => p[0])),
    ranks(pairs.map((p) => p[1]))
  );
}

function icSeries(crossSections: FactorCrossSection[], horizon: number): number[] {
  const out: number[] = [];
  for (const cs of crossSections) {
    const fwd = cs.forwardByHorizon[horizon];
    if (!fwd) continue;
    const ic = spearmanIC(cs.signal, fwd);
    if (ic !== null && Number.isFinite(ic)) out.push(ic);
  }
  return out;
}

function quantileBuckets(crossSections: FactorCrossSection[], horizon: number, k: number): QuantileBucket[] {
  const sums = new Array<number>(k).fill(0);
  const counts = new Array<number>(k).fill(0);
  for (const cs of crossSections) {
    const fwd = cs.forwardByHorizon[horizon];
    if (!fwd) continue;
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < cs.signal.length; i += 1) {
      if (Number.isFinite(cs.signal[i]) && Number.isFinite(fwd[i])) pairs.push([cs.signal[i], fwd[i]]);
    }
    if (pairs.length < k) continue;
    pairs.sort((a, b) => a[0] - b[0]); // ascending by signal -> bucket 0 = lowest
    for (let i = 0; i < pairs.length; i += 1) {
      const bucket = Math.min(k - 1, Math.floor((i / pairs.length) * k));
      sums[bucket] += pairs[i][1];
      counts[bucket] += 1;
    }
  }
  return sums.map((sum, index) => ({
    quantile: index + 1,
    meanForwardReturn: counts[index] > 0 ? sum / counts[index] : 0,
    count: counts[index]
  }));
}

function rankAutocorrelation(crossSections: FactorCrossSection[]): number {
  const correlations: number[] = [];
  for (let t = 1; t < crossSections.length; t += 1) {
    const prev = crossSections[t - 1].signal;
    const cur = crossSections[t].signal;
    if (prev.length !== cur.length || prev.length < 5) continue;
    const correlation = pearson(ranks(prev), ranks(cur));
    if (correlation !== null) correlations.push(correlation);
  }
  return correlations.length > 0 ? mean(correlations) : 0;
}

// Pick the documented horizon closest to the holding period.
function primaryHorizon(holdingPeriod: number): number {
  return HORIZONS.reduce((best, h) => (Math.abs(h - holdingPeriod) < Math.abs(best - holdingPeriod) ? h : best), HORIZONS[0]);
}

export function computeFactorAnalytics(
  crossSections: FactorCrossSection[],
  holdingPeriod: number,
  quantileCount = 5
): FactorAnalytics | null {
  if (crossSections.length < 8) return null; // need a few dates for a stable IC
  const horizon = primaryHorizon(holdingPeriod);
  const ics = icSeries(crossSections, horizon);
  if (ics.length < 8) return null;

  const icMean = mean(ics);
  const icStd = std(ics);
  const icIR = icStd > 1e-9 ? icMean / icStd : 0;
  const icTStat = icStd > 1e-9 ? icMean / (icStd / Math.sqrt(ics.length)) : 0;
  const sign = Math.sign(icMean) || 1;
  const hitRate = ics.filter((ic) => Math.sign(ic) === sign).length / ics.length;

  const icDecay = HORIZONS.map((h) => ({ horizon: h, ic: round(mean(icSeries(crossSections, h)), 4) }));

  const quantiles = quantileBuckets(crossSections, horizon, quantileCount).map((bucket) => ({
    ...bucket,
    meanForwardReturn: round(bucket.meanForwardReturn, 5)
  }));
  const quantileSpread = quantiles.length >= 2 ? quantiles[quantiles.length - 1].meanForwardReturn - quantiles[0].meanForwardReturn : 0;
  let monotonic = true;
  for (let i = 1; i < quantiles.length; i += 1) {
    if (quantiles[i].meanForwardReturn < quantiles[i - 1].meanForwardReturn) {
      monotonic = false;
      break;
    }
  }

  return {
    horizon,
    observations: ics.length,
    icMean: round(icMean, 4),
    icStd: round(icStd, 4),
    icIR: round(icIR, 3),
    icTStat: round(icTStat, 2),
    hitRate: round(hitRate, 3),
    icDecay,
    quantiles,
    quantileSpread: round(quantileSpread, 5),
    quantileMonotonic: monotonic,
    rankAutocorrelation: round(rankAutocorrelation(crossSections), 3)
  };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
