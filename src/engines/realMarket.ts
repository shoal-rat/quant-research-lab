// Loader for the bundled real-market dataset (20y of daily adjusted closes
// fetched from Yahoo's chart API by scripts/fetch-market-data.mjs).

export interface RealTicker {
  name: string;
  industry: string;
  closes: (number | null)[];
}

export type DataFrequency = "minute" | "hourly" | "daily" | "weekly" | "monthly" | "irregular";

export interface RealMarketData {
  source: string;
  fetchedAt: string;
  start: string;
  end: string;
  dates: string[];
  benchmark: string;
  tickers: Record<string, RealTicker>;
  // detected from the timestamp spacing (or supplied by the bundle); drives
  // annualization so Sharpe is correct for hourly / weekly / monthly data
  frequency?: DataFrequency;
  periodsPerYear?: number;
  // derived, filled on load
  returns: Record<string, (number | null)[]>;
}

// Infer the sampling frequency (and the matching annualization factor) from the
// median gap between consecutive timestamps. Works for ISO dates ("2020-01-02")
// and ISO datetimes ("2020-01-02T09:30:00").
export function detectFrequency(dates: string[]): { frequency: DataFrequency; periodsPerYear: number } {
  if (dates.length < 3) return { frequency: "daily", periodsPerYear: 252 };
  const gaps: number[] = [];
  for (let index = 1; index < Math.min(dates.length, 800); index += 1) {
    const a = Date.parse(dates[index - 1]);
    const b = Date.parse(dates[index]);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) gaps.push((b - a) / 86_400_000);
  }
  if (gaps.length === 0) return { frequency: "daily", periodsPerYear: 252 };
  gaps.sort((x, y) => x - y);
  const medianDays = gaps[Math.floor(gaps.length / 2)];
  if (medianDays <= 0.01) return { frequency: "minute", periodsPerYear: 252 * 390 };
  if (medianDays <= 0.2) return { frequency: "hourly", periodsPerYear: 252 * 7 };
  if (medianDays <= 2) return { frequency: "daily", periodsPerYear: 252 };
  if (medianDays <= 10) return { frequency: "weekly", periodsPerYear: 52 };
  if (medianDays <= 45) return { frequency: "monthly", periodsPerYear: 12 };
  return { frequency: "irregular", periodsPerYear: 252 };
}

// Derive simple per-period returns for every ticker and return a ready
// RealMarketData. Shared by the bundled JSON loader and the CSV/remote dataset
// providers. Fills frequency/periodsPerYear if the bundle did not supply them.
export function buildRealMarketData(bundle: Omit<RealMarketData, "returns">): RealMarketData {
  const data = bundle as RealMarketData;
  data.returns = {};
  for (const [symbol, ticker] of Object.entries(data.tickers)) {
    const returns: (number | null)[] = [null];
    for (let index = 1; index < ticker.closes.length; index += 1) {
      const previous = ticker.closes[index - 1];
      const current = ticker.closes[index];
      returns.push(previous && current ? current / previous - 1 : null);
    }
    data.returns[symbol] = returns;
  }
  if (data.periodsPerYear === undefined || data.frequency === undefined) {
    const detected = detectFrequency(data.dates);
    data.frequency = data.frequency ?? detected.frequency;
    data.periodsPerYear = data.periodsPerYear ?? detected.periodsPerYear;
  }
  return data;
}

let cache: Promise<RealMarketData | null> | null = null;

export function loadRealMarket(): Promise<RealMarketData | null> {
  if (!cache) {
    cache = fetch("assets/data/market-real.json")
      .then(async (response) => {
        if (!response.ok) return null;
        const bundle = (await response.json()) as Omit<RealMarketData, "returns">;
        return buildRealMarketData(bundle);
      })
      .catch(() => null);
  }
  return cache;
}

export function realUniverse(data: RealMarketData): string[] {
  return Object.keys(data.tickers).filter((symbol) => symbol !== data.benchmark);
}

export function dateIndex(data: RealMarketData, isoDate: string): number {
  // first trading day >= isoDate
  let low = 0;
  let high = data.dates.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (data.dates[mid] < isoDate) low = mid + 1;
    else high = mid;
  }
  return low;
}
