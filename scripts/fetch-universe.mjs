// Fetches a LARGE trading universe (S&P 500 + NASDAQ-100, ~550 unique names) of
// daily adjusted OHLCV from the keyless Yahoo chart API and saves it to
// data/universe-large.json (gitignored — local only, NOT shipped to the browser
// because it is ~25 MB). The paper-trade simulator and the Alpaca paper connector
// can use it via QRL_UNIVERSE_FILE / --universe=large for a much wider cross-section.
//
//   node scripts/fetch-universe.mjs                 # 5y, S&P 500 + NASDAQ-100
//   node scripts/fetch-universe.mjs --range=3y
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(root, "data", "universe-large.json");
const args = Object.fromEntries(process.argv.slice(2).map((a) => (a.match(/^--([^=]+)=(.*)$/) ? [RegExp.$1, RegExp.$2] : [a.replace(/^--/, ""), true])));
const RANGE = args.range ?? "5y";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) quant-research-lab/3.0 (educational demo)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// NASDAQ-100 supplement (many overlap S&P 500; dedup handles it). Best-effort list.
const NASDAQ100 = [
  "AAPL","MSFT","NVDA","AMZN","AVGO","META","TSLA","GOOGL","GOOG","COST","NFLX","AMD","PEP","ADBE","LIN","CSCO","TMUS","INTU","TXN","QCOM",
  "AMGN","ISRG","CMCSA","HON","BKNG","AMAT","VRTX","ADP","PANW","GILD","ADI","SBUX","MU","INTC","MELI","LRCX","REGN","KLAC","PYPL","SNPS",
  "CDNS","MAR","CRWD","MRVL","ORLY","CSX","ASML","ABNB","FTNT","ADSK","WDAY","CHTR","NXPI","PCAR","ROP","CPRT","MNST","PAYX","AEP","ODP",
  "FAST","KDP","ROST","DDOG","EA","VRSK","CTAS","EXC","XEL","CCEP","KHC","BKR","GEHC","CTSH","DXCM","TTD","IDXX","MCHP","ZS","ANSS",
  "ON","CDW","BIIB","GFS","WBD","ILMN","MDB","DLTR","TEAM","PDD","ARM","LULU","WBA","SIRI","JD","BIDU","NTES","TCOM","SMCI","MRNA"
];

async function constituents() {
  const set = new Set(NASDAQ100);
  try {
    const csv = await fetch("https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv", {
      headers: { "User-Agent": UA }
    }).then((r) => r.text());
    for (const line of csv.split(/\r?\n/).slice(1)) {
      const sym = line.split(",")[0]?.trim();
      if (sym) set.add(sym.replace(".", "-")); // BRK.B -> BRK-B for Yahoo
    }
    console.log(`S&P 500 list: ${set.size - NASDAQ100.length} added from datahub`);
  } catch (e) {
    console.log(`S&P 500 list fetch failed (${e.message}); using NASDAQ-100 only`);
  }
  return [...set];
}

async function fetchTicker(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${RANGE}&interval=1d&events=div%2Csplit`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const result = (await res.json())?.chart?.result?.[0];
  if (!result?.timestamp) throw new Error("empty");
  const quote = result.indicators?.quote?.[0] ?? {};
  const adjArr = result.indicators?.adjclose?.[0]?.adjclose ?? quote.close;
  const map = new Map();
  result.timestamp.forEach((ts, i) => {
    const adj = adjArr?.[i];
    if (adj === null || adj === undefined || !Number.isFinite(adj)) return;
    const rawClose = quote.close?.[i];
    const f = rawClose && Number.isFinite(rawClose) ? adj / rawClose : 1;
    map.set(new Date(ts * 1000).toISOString().slice(0, 10), {
      c: adj,
      v: Number.isFinite(quote.volume?.[i]) ? quote.volume[i] : null,
      h: Number.isFinite(quote.high?.[i]) ? quote.high[i] * f : null,
      l: Number.isFinite(quote.low?.[i]) ? quote.low[i] * f : null
    });
  });
  return map;
}

const symbols = await constituents();
if (!symbols.includes("SPY")) symbols.push("SPY"); // benchmark
console.log(`fetching ${symbols.length} tickers (${RANGE})…`);

const series = new Map();
let ok = 0;
let fail = 0;
for (const sym of symbols) {
  try {
    series.set(sym, await fetchTicker(sym));
    ok += 1;
  } catch {
    fail += 1;
  }
  if ((ok + fail) % 50 === 0) process.stdout.write(`  ${ok + fail}/${symbols.length} (${fail} failed)\n`);
  await sleep(250);
}

if (!series.has("SPY")) {
  console.error("benchmark SPY missing; aborting");
  process.exit(1);
}

// master calendar = SPY days; require >= 60% coverage so momentum has history
const dates = [...series.get("SPY").keys()].sort();
const tickers = {};
let kept = 0;
for (const [sym, map] of series) {
  if (sym === "SPY" && kept > 0) { /* keep benchmark */ }
  const closes = [];
  const volumes = [];
  const highs = [];
  const lows = [];
  let last = null;
  let present = 0;
  for (const d of dates) {
    const bar = map.get(d);
    if (bar !== undefined) { last = bar; present += 1; }
    closes.push(last === null ? null : Number(last.c.toFixed(4)));
    volumes.push(last === null || last.v === null ? null : Math.round(last.v));
    highs.push(last === null || last.h === null ? null : Number(last.h.toFixed(4)));
    lows.push(last === null || last.l === null ? null : Number(last.l.toFixed(4)));
  }
  if (sym !== "SPY" && present < dates.length * 0.6) continue; // too little history
  tickers[sym] = { name: sym, industry: "Unknown", closes, volumes, highs, lows };
  kept += 1;
}

const bundle = {
  source: `Yahoo chart API (adjusted OHLCV) — S&P 500 + NASDAQ-100, ${RANGE}`,
  license: "Quotes for personal/educational use; not for redistribution.",
  fetchedAt: new Date().toISOString(),
  start: dates[0],
  end: dates[dates.length - 1],
  dates,
  benchmark: "SPY",
  tickers
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(bundle));
const mb = (fs.statSync(outPath).size / 1e6).toFixed(1);
console.log(`\nsaved ${outPath} (${mb} MB): ${dates.length} days x ${Object.keys(tickers).length} tickers (${ok} fetched, ${fail} failed), ${bundle.start} -> ${bundle.end}`);
