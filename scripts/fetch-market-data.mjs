// Downloads ~20 years of real daily adjusted closes for a cross-section of
// long-history US large caps (keyless Yahoo chart API) and bundles them as a
// compact JSON the in-browser research engine can backtest against.
//
//   node scripts/fetch-market-data.mjs            # refresh public/assets/data/market-real.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(root, "public", "assets", "data", "market-real.json");

const UNIVERSE = [
  ["SPY", "S&P 500 ETF", "Benchmark"],
  ["AAPL", "Apple", "Technology"],
  ["MSFT", "Microsoft", "Technology"],
  ["NVDA", "NVIDIA", "Semiconductors"],
  ["AMD", "Advanced Micro Devices", "Semiconductors"],
  ["INTC", "Intel", "Semiconductors"],
  ["QCOM", "Qualcomm", "Semiconductors"],
  ["CSCO", "Cisco", "Technology"],
  ["ORCL", "Oracle", "Technology"],
  ["IBM", "IBM", "Technology"],
  ["AMZN", "Amazon", "Consumer Discretionary"],
  ["NFLX", "Netflix", "Communication Services"],
  ["EBAY", "eBay", "Consumer Discretionary"],
  ["JPM", "JPMorgan Chase", "Financials"],
  ["BAC", "Bank of America", "Financials"],
  ["GS", "Goldman Sachs", "Financials"],
  ["WFC", "Wells Fargo", "Financials"],
  ["XOM", "Exxon Mobil", "Energy"],
  ["CVX", "Chevron", "Energy"],
  ["COP", "ConocoPhillips", "Energy"],
  ["JNJ", "Johnson & Johnson", "Healthcare"],
  ["PFE", "Pfizer", "Healthcare"],
  ["UNH", "UnitedHealth", "Healthcare"],
  ["MRK", "Merck", "Healthcare"],
  ["PG", "Procter & Gamble", "Consumer Staples"],
  ["KO", "Coca-Cola", "Consumer Staples"],
  ["WMT", "Walmart", "Consumer Staples"],
  ["COST", "Costco", "Consumer Staples"],
  ["MCD", "McDonald's", "Consumer Discretionary"],
  ["HD", "Home Depot", "Consumer Discretionary"],
  ["CAT", "Caterpillar", "Industrials"],
  ["BA", "Boeing", "Industrials"]
];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) quant-research-lab/2.0 (educational demo)";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchTicker(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=20y&interval=1d&events=div%2Csplit`;
  const response = await fetch(url, { headers: { "User-Agent": UA } });
  if (!response.ok) throw new Error(`${symbol}: HTTP ${response.status}`);
  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  if (!result?.timestamp) throw new Error(`${symbol}: empty result`);
  const adj = result.indicators?.adjclose?.[0]?.adjclose ?? result.indicators?.quote?.[0]?.close;
  const map = new Map();
  result.timestamp.forEach((ts, index) => {
    const value = adj[index];
    if (value !== null && value !== undefined && Number.isFinite(value)) {
      const date = new Date(ts * 1000).toISOString().slice(0, 10);
      map.set(date, value);
    }
  });
  return map;
}

const series = new Map();
for (const [symbol] of UNIVERSE) {
  process.stdout.write(`fetching ${symbol}… `);
  try {
    const map = await fetchTicker(symbol);
    series.set(symbol, map);
    console.log(`${map.size} days`);
  } catch (error) {
    console.log(`FAILED (${error.message})`);
  }
  await sleep(450);
}

if (!series.has("SPY")) {
  console.error("benchmark SPY missing; aborting");
  process.exit(1);
}

// master calendar = SPY trading days; forward-fill rare per-name gaps
const dates = [...series.get("SPY").keys()].sort();
const tickers = {};
for (const [symbol, name, industry] of UNIVERSE) {
  const map = series.get(symbol);
  if (!map) continue;
  const closes = [];
  let last = null;
  let missing = 0;
  for (const date of dates) {
    const value = map.get(date);
    if (value !== undefined) last = value;
    else missing += 1;
    closes.push(last === null ? null : Number(last.toFixed(4)));
  }
  // drop names that joined the calendar too late (need >= 15y of history)
  const firstIdx = closes.findIndex((value) => value !== null);
  if (firstIdx > dates.length * 0.25) {
    console.log(`dropping ${symbol}: history starts too late`);
    continue;
  }
  if (missing > 0) console.log(`${symbol}: forward-filled ${missing} gaps`);
  tickers[symbol] = { name, industry, closes };
}

const bundle = {
  source: "Yahoo Finance chart API (adjusted close, splits+dividends)",
  license: "Quotes for personal/educational use; not for redistribution as a market data feed.",
  fetchedAt: new Date().toISOString(),
  start: dates[0],
  end: dates[dates.length - 1],
  dates,
  benchmark: "SPY",
  tickers
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(bundle));
const mb = (fs.statSync(outPath).size / 1e6).toFixed(2);
console.log(`saved ${outPath} (${mb} MB): ${dates.length} days x ${Object.keys(tickers).length} tickers, ${bundle.start} -> ${bundle.end}`);
