// Persistent trial registry (redesign v3, pillar A5): every backtest ever run —
// lab iterations, miner fitness evaluations, race sleeves — is counted here so
// the deflated-Sharpe multiplicity correction can never undercount because a
// search happened outside the visible experiment list. localStorage-backed in
// the browser, plain module memory under node/vitest.

const STORAGE_KEY = "qrl-trial-registry";

let memoryCounts: Record<string, number> = {};

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch {
    return false;
  }
}

function load(): Record<string, number> {
  if (!hasLocalStorage()) return memoryCounts;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function save(counts: Record<string, number>): void {
  if (!hasLocalStorage()) {
    memoryCounts = counts;
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
  } catch {
    memoryCounts = counts;
  }
}

export function recordTrials(n: number, source: string): void {
  if (!Number.isFinite(n) || n <= 0) return;
  const counts = load();
  counts[source] = (counts[source] ?? 0) + n;
  save(counts);
}

export function totalTrials(): number {
  const counts = load();
  let total = 0;
  for (const value of Object.values(counts)) {
    if (Number.isFinite(value) && value > 0) total += value;
  }
  return Math.round(total);
}

// Older saved desks predate the persistent registry. Before recording a new
// evaluation, lift the total to the number of historical real-data runs so the
// first v3 session cannot pretend that its prior search never happened.
export function ensureTrialFloor(minimum: number, source = "historical_real_runs"): void {
  if (!Number.isFinite(minimum) || minimum <= 0) return;
  const target = Math.floor(minimum);
  const current = totalTrials();
  if (current < target) recordTrials(target - current, source);
}

export function trialBreakdown(): Record<string, number> {
  return { ...load() };
}

// test/reset hook (also lets the app offer a "new lab" reset)
export function resetTrials(): void {
  memoryCounts = {};
  if (hasLocalStorage()) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}
