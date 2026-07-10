// Genetic alpha miner (redesign v3, pillar A3): breeds alpha-DSL expression
// trees against the TRAINING region only (fitness never reads bars at or past
// searchEndIndex, which excludes both the OOS window and the lockbox). One
// generation per call keeps a mine step interactive; state carries across
// iterations. Novelty is enforced by signal correlation against already-tried
// and pooled formulas so the search cannot converge onto clones of the pool.

import {
  alphaComplexity,
  crossoverAlpha,
  evaluateAlpha,
  formatAlpha,
  mutateAlpha,
  parseAlpha,
  randomAlpha,
} from "./alphaDsl";
import { RealMarketData } from "./realMarket";
import { seededRandom } from "./random";

export interface MinerState {
  population: string[];
  generation: number;
  tried: string[];
  bestFormula?: string;
  bestFitness?: number;
}

export interface EvolveOptions {
  state: MinerState | null;
  data: RealMarketData;
  universe: string[];
  industryPeers: Record<string, string[]>;
  periodsPerYear: number;
  searchEndIndex: number;
  avoidSignals?: Array<{ formula: string }>;
  seed: string;
}

const POPULATION = 24;
const SAMPLE_DATES = 40;
const FORWARD_BARS = 5;
const WARMUP = 260;
const NOVELTY_CORR_CAP = 0.75;
const COMPLEXITY_PENALTY = 0.002;
const TOURNAMENT = 3;
const CROSSOVER_RATE = 0.6;
const MUTATION_RATE = 0.35;
const ELITE_KEEP = 2;
const MAX_TRIED = 400;

// motif seeds: composable starting points built from the classic factor menu
const MOTIFS = [
  "mom(120, 5)",
  "rev(5)",
  "neg(vol(20))",
  "r52wk(250)",
  "amihud(60)",
  "peer_gap(60)",
  "quality_drift(60)",
  "zn(mom(120, 5)) + zn(neg(vol(20)))",
  "zn(rev(5)) * ts_rank(volume, 20)",
  "delta(ts_rank(close, 60), 5)",
  "ts_corr(returns, ts_mean(volume, 5), 20)",
  "ts_zscore(dollarvol, 60) * rev(5)"
];

interface FitnessCase {
  at: number;
  forward: Map<string, number>;
}

// Spearman rank correlation with fractional ranks for ties.
function spearman(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 4) return null;
  const rank = (values: number[]): number[] => {
    const order = values.map((value, index) => [value, index] as [number, number]).sort((a, b) => a[0] - b[0]);
    const ranks = new Array<number>(n);
    let i = 0;
    while (i < order.length) {
      let end = i;
      while (end + 1 < order.length && order[end + 1][0] === order[i][0]) end += 1;
      const average = (i + end) / 2;
      for (let j = i; j <= end; j += 1) ranks[order[j][1]] = average;
      i = end + 1;
    }
    return ranks;
  };
  const rx = rank(xs);
  const ry = rank(ys);
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i += 1) {
    mx += rx[i];
    my += ry[i];
  }
  mx /= n;
  my /= n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i += 1) {
    cov += (rx[i] - mx) * (ry[i] - my);
    vx += (rx[i] - mx) ** 2;
    vy += (ry[i] - my) ** 2;
  }
  const denom = Math.sqrt(vx * vy);
  if (denom < 1e-12) return null;
  return cov / denom;
}

function buildCases(opts: EvolveOptions): FitnessCase[] {
  const lastUsable = Math.min(opts.searchEndIndex - FORWARD_BARS - 1, opts.data.dates.length - FORWARD_BARS - 1);
  if (lastUsable <= WARMUP + 10) return [];
  const span = lastUsable - WARMUP;
  const count = Math.min(SAMPLE_DATES, span);
  const step = span / count;
  const cases: FitnessCase[] = [];
  for (let i = 0; i < count; i += 1) {
    const at = Math.min(lastUsable, Math.round(WARMUP + i * step));
    const forward = new Map<string, number>();
    for (const symbol of opts.universe) {
      const closes = opts.data.tickers[symbol]?.closes;
      if (!closes) continue;
      const c0 = closes[at];
      const c1 = closes[at + FORWARD_BARS];
      if (c0 && c1) forward.set(symbol, c1 / c0 - 1);
    }
    if (forward.size >= 6) cases.push({ at, forward });
  }
  return cases;
}

// cross-sectional signal values for one formula on every fitness case;
// null when the formula can't produce enough coverage
function signalMatrix(formula: string, opts: EvolveOptions, cases: FitnessCase[]): Array<Map<string, number>> | null {
  let expr;
  try {
    expr = parseAlpha(formula);
  } catch {
    return null;
  }
  const matrix: Array<Map<string, number>> = [];
  for (const c of cases) {
    const row = new Map<string, number>();
    for (const symbol of opts.universe) {
      if (!c.forward.has(symbol)) continue;
      const value = evaluateAlpha(expr, {
        data: opts.data,
        symbol,
        at: c.at,
        industryPeers: opts.industryPeers,
        periodsPerYear: opts.periodsPerYear
      });
      if (value !== null) row.set(symbol, value);
    }
    matrix.push(row);
  }
  return matrix;
}

interface Evaluated {
  formula: string;
  fitness: number;
  matrix: Array<Map<string, number>>;
}

function fitnessOf(formula: string, opts: EvolveOptions, cases: FitnessCase[]): Evaluated | null {
  const matrix = signalMatrix(formula, opts, cases);
  if (!matrix) return null;
  let icSum = 0;
  let icCount = 0;
  let degenerate = 0;
  for (let i = 0; i < cases.length; i += 1) {
    const row = matrix[i];
    if (row.size < 6) {
      degenerate += 1;
      continue;
    }
    const xs: number[] = [];
    const ys: number[] = [];
    row.forEach((value, symbol) => {
      const fwd = cases[i].forward.get(symbol);
      if (fwd !== undefined) {
        xs.push(value);
        ys.push(fwd);
      }
    });
    const mean = xs.reduce((sum, value) => sum + value, 0) / xs.length;
    const spread = Math.sqrt(xs.reduce((sum, value) => sum + (value - mean) ** 2, 0) / xs.length);
    if (spread < 1e-10) {
      degenerate += 1;
      continue;
    }
    const ic = spearman(xs, ys);
    if (ic !== null) {
      icSum += ic;
      icCount += 1;
    }
  }
  if (cases.length === 0 || degenerate / cases.length > 0.3 || icCount < Math.max(4, cases.length * 0.4)) {
    return { formula, fitness: -1, matrix };
  }
  let complexity = 0;
  try {
    complexity = alphaComplexity(parseAlpha(formula));
  } catch {
    return null;
  }
  return { formula, fitness: icSum / icCount - COMPLEXITY_PENALTY * complexity, matrix };
}

// Pearson correlation between two signal matrices over their shared cells
function matrixCorrelation(a: Array<Map<string, number>>, b: Array<Map<string, number>>): number | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    a[i].forEach((value, symbol) => {
      const other = b[i].get(symbol);
      if (other !== undefined) {
        xs.push(value);
        ys.push(other);
      }
    });
  }
  const n = xs.length;
  if (n < 20) return null;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i += 1) {
    mx += xs[i];
    my += ys[i];
  }
  mx /= n;
  my /= n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i += 1) {
    cov += (xs[i] - mx) * (ys[i] - my);
    vx += (xs[i] - mx) ** 2;
    vy += (ys[i] - my) ** 2;
  }
  const denom = Math.sqrt(vx * vy);
  if (denom < 1e-12) return null;
  return cov / denom;
}

function canonicalOrNull(formula: string): string | null {
  try {
    return formatAlpha(parseAlpha(formula));
  } catch {
    return null;
  }
}

export function evolveFormula(opts: EvolveOptions): {
  formula: string;
  state: MinerState;
  evaluations: number;
  fitness: number;
} {
  const rng = seededRandom(`miner-${opts.seed}`);
  const cases = buildCases(opts);
  let evaluations = 0;

  const seedPopulation = (): string[] => {
    const pop: string[] = [...MOTIFS];
    while (pop.length < POPULATION) pop.push(randomAlpha(rng, 4));
    return pop.slice(0, POPULATION);
  };

  const state: MinerState = opts.state
    ? {
        population: [...opts.state.population],
        generation: opts.state.generation,
        tried: [...opts.state.tried],
        bestFormula: opts.state.bestFormula,
        bestFitness: opts.state.bestFitness
      }
    : { population: seedPopulation(), generation: 0, tried: [] };
  // Formula formatting is semantic identity in the DSL. Normalizing here makes
  // `mom(120,5)` and `mom(120, 5)` one attempted hypothesis, rather than a
  // loophole around the novelty / trial accounting safeguards.
  state.population = state.population.map(canonicalOrNull).filter((value): value is string => value !== null);
  state.tried = state.tried.map(canonicalOrNull).filter((value): value is string => value !== null);
  if (state.population.length < POPULATION) {
    state.population = [...state.population, ...seedPopulation()].slice(0, POPULATION);
  }

  if (cases.length === 0) {
    // dataset too short to mine: fall back to the strongest motif without search
    const fallback = canonicalOrNull(MOTIFS[0]) ?? MOTIFS[0];
    if (!state.tried.includes(fallback)) state.tried.push(fallback);
    return { formula: fallback, state, evaluations: 0, fitness: 0 };
  }

  // --- evaluate current population
  const scored: Evaluated[] = [];
  for (const formula of state.population) {
    const evaluated = fitnessOf(formula, opts, cases);
    evaluations += 1;
    if (evaluated) scored.push(evaluated);
  }
  scored.sort((a, b) => b.fitness - a.fitness);
  // Fitness is a search trial even when the formula ultimately loses. Retain
  // its canonical identity so a later generation cannot claim it is new.
  for (const evaluated of scored) {
    const canonical = canonicalOrNull(evaluated.formula);
    if (canonical && !state.tried.includes(canonical)) state.tried.push(canonical);
  }

  // Novelty reference set: every pooled formula, every previously tried
  // formula, and every live member of this generation. This intentionally
  // errs on the conservative side: syntactic mutation cannot smuggle a clone
  // back through the miner merely because its best ancestor changed.
  const avoid: Array<Map<string, number>>[] = [];
  const referenceFormulas = new Set<string>();
  for (const item of opts.avoidSignals ?? []) referenceFormulas.add(item.formula);
  for (const formula of state.tried) referenceFormulas.add(formula);
  for (const formula of scored.map((item) => item.formula)) referenceFormulas.add(formula);
  for (const rawFormula of referenceFormulas) {
    const canonical = canonicalOrNull(rawFormula);
    if (!canonical) continue;
    const matrix = signalMatrix(canonical, opts, cases);
    evaluations += 0.25;
    if (matrix) avoid.push(matrix);
  }

  // --- breed next generation
  const nextGen: string[] = scored.slice(0, ELITE_KEEP).map((e) => e.formula);
  const tried = new Set(state.tried);
  const pick = (): Evaluated => {
    let best: Evaluated | null = null;
    for (let i = 0; i < TOURNAMENT; i += 1) {
      const candidate = scored[Math.min(scored.length - 1, Math.floor(rng() * scored.length))];
      if (!best || candidate.fitness > best.fitness) best = candidate;
    }
    return best as Evaluated;
  };
  let guard = 0;
  while (nextGen.length < POPULATION && guard < POPULATION * 6) {
    guard += 1;
    let child: string;
    const roll = rng();
    if (roll < CROSSOVER_RATE && scored.length >= 2) {
      child = crossoverAlpha(pick().formula, pick().formula, rng);
      if (rng() < MUTATION_RATE) child = mutateAlpha(child, rng);
    } else if (roll < CROSSOVER_RATE + MUTATION_RATE && scored.length >= 1) {
      child = mutateAlpha(pick().formula, rng);
    } else {
      child = randomAlpha(rng, 4);
    }
    const canonicalChild = canonicalOrNull(child);
    if (!canonicalChild) continue;
    child = canonicalChild;
    if (nextGen.includes(child) || tried.has(child)) continue;
    // novelty gate: cheap correlation screen before the child may enter the pool
    const childMatrix = signalMatrix(child, opts, cases);
    evaluations += 0.25;
    if (!childMatrix) continue;
    let clone = false;
    for (const ref of avoid) {
      const corr = matrixCorrelation(childMatrix, ref);
      if (corr !== null && Math.abs(corr) > NOVELTY_CORR_CAP) {
        clone = true;
        break;
      }
    }
    if (clone) continue;
    nextGen.push(child);
  }
  while (nextGen.length < POPULATION) nextGen.push(randomAlpha(rng, 4));

  const best = scored[0] ?? null;
  const previousBest = state.bestFitness ?? -Infinity;
  if (best && best.fitness > previousBest) {
    state.bestFormula = best.formula;
    state.bestFitness = best.fitness;
  }
  state.population = nextGen;
  state.generation += 1;

  const proposal = canonicalOrNull(state.bestFormula ?? (best ? best.formula : MOTIFS[0])) ?? MOTIFS[0];
  if (!state.tried.includes(proposal)) state.tried.push(proposal);
  if (state.tried.length > MAX_TRIED) state.tried = state.tried.slice(-MAX_TRIED);

  return {
    formula: proposal,
    state,
    evaluations: Math.round(evaluations),
    fitness: state.bestFitness ?? (best ? best.fitness : 0)
  };
}
