// Loader for the bundled real-market dataset (20y of daily adjusted closes
// fetched from Yahoo's chart API by scripts/fetch-market-data.mjs).

export interface RealTicker {
  name: string;
  industry: string;
  closes: (number | null)[];
}

export interface RealMarketData {
  source: string;
  fetchedAt: string;
  start: string;
  end: string;
  dates: string[];
  benchmark: string;
  tickers: Record<string, RealTicker>;
  // derived, filled on load
  returns: Record<string, (number | null)[]>;
}

// The on-disk/bundle shape before per-ticker returns are derived.
export type RealMarketBundle = Omit<RealMarketData, "returns"> & { returns?: never };

// Derive daily simple returns for every ticker and return a ready RealMarketData.
// Shared by the bundled JSON loader and the CSV/remote dataset providers.
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
