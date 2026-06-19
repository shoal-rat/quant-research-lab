// Cross-sectional signal preprocessing, in the canonical Qlib/Alphalens order:
// drop non-finite -> winsorize -> standardize -> (optional) neutralize. Every
// step is per-date (cross-sectional), never pooled across history, so it can be
// applied inside one rebalance. Validated against numpy/scipy/statsmodels in
// scripts/quant_reference/reference.py — the winsorize / zscore / rankNormalize /
// demeanByGroup / betaResidualize golden cases live in src/engines/quantGolden.test.ts.

export type StandardizeMethod = "none" | "zscore" | "robust" | "rank";

export interface PreprocessOptions {
  winsorize?: number; // tail fraction clipped each side (e.g. 0.01 = 1/99 pct); 0 disables
  standardize?: StandardizeMethod;
  groups?: string[]; // sector/industry per name -> sector-demean (neutralize the average sector tilt)
  betas?: number[]; // per-name beta -> residualize on [1, beta] (market/beta neutral)
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo); // linear interpolation (numpy default)
}

export function winsorize(values: number[], tail = 0.01): number[] {
  if (tail <= 0 || values.length < 3) return values.slice();
  const sorted = [...values].sort((a, b) => a - b);
  const lo = quantile(sorted, tail);
  const hi = quantile(sorted, 1 - tail);
  return values.map((v) => Math.min(hi, Math.max(lo, v)));
}

function mean(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

export function zscore(values: number[]): number[] {
  if (values.length < 2) return values.map(() => 0);
  const m = mean(values);
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1));
  if (sd < 1e-12) return values.map(() => 0);
  return values.map((v) => (v - m) / sd);
}

// robust standardization: (x - median) / (1.4826 * MAD), clipped to +/-3
export function robustZscore(values: number[]): number[] {
  if (values.length < 2) return values.map(() => 0);
  const sorted = [...values].sort((a, b) => a - b);
  const median = quantile(sorted, 0.5);
  const absDev = values.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = quantile(absDev, 0.5);
  const scale = 1.4826 * mad;
  if (scale < 1e-12) return values.map(() => 0);
  return values.map((v) => Math.max(-3, Math.min(3, (v - median) / scale)));
}

// Alphalens CSRankNorm: percentile rank mapped to ~N(0,1): (pctRank - 0.5)*sqrt(12)
export function rankNormalize(values: number[]): number[] {
  const n = values.length;
  if (n < 2) return values.map(() => 0);
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const pct = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && order[j + 1].v === order[i].v) j += 1;
    const avgRank = (i + j) / 2; // 0-based average rank for ties
    for (let k = i; k <= j; k += 1) pct[order[k].i] = (avgRank + 0.5) / n;
    i = j + 1;
  }
  return pct.map((p) => (p - 0.5) * Math.sqrt(12));
}

function standardize(values: number[], method: StandardizeMethod): number[] {
  switch (method) {
    case "zscore":
      return zscore(values);
    case "robust":
      return robustZscore(values);
    case "rank":
      return rankNormalize(values);
    default:
      return values.slice();
  }
}

// Subtract the group (sector) mean from each member: strips the average sector
// tilt so the signal expresses only within-sector relative attractiveness.
export function demeanByGroup(values: number[], groups: string[]): number[] {
  const sums = new Map<string, number>();
  const counts = new Map<string, number>();
  values.forEach((v, i) => {
    const g = groups[i] ?? "_";
    sums.set(g, (sums.get(g) ?? 0) + v);
    counts.set(g, (counts.get(g) ?? 0) + 1);
  });
  return values.map((v, i) => {
    const g = groups[i] ?? "_";
    return v - (sums.get(g) as number) / (counts.get(g) as number);
  });
}

// Residualize the signal on [1, beta] by cross-sectional OLS and return the
// residual (the part of the signal orthogonal to market beta -> beta-neutral).
export function betaResidualize(values: number[], betas: number[]): number[] {
  const n = Math.min(values.length, betas.length);
  if (n < 3) return values.slice();
  const mx = mean(betas.slice(0, n));
  const my = mean(values.slice(0, n));
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = betas[i] - mx;
    sxx += dx * dx;
    sxy += dx * (values[i] - my);
  }
  if (sxx < 1e-12) return values.slice();
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  return values.map((v, i) => v - (intercept + slope * betas[i]));
}

export function preprocessSignal(values: number[], options: PreprocessOptions = {}): number[] {
  let out = values.map((v) => (Number.isFinite(v) ? v : 0));
  if (options.winsorize && options.winsorize > 0) out = winsorize(out, options.winsorize);
  out = standardize(out, options.standardize ?? "none");
  if (options.groups && options.groups.length === out.length) out = demeanByGroup(out, options.groups);
  if (options.betas && options.betas.length === out.length) out = betaResidualize(out, options.betas);
  return out;
}
