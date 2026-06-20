// Enrich a price universe with FMP data: survivorship-free S&P 500 membership +
// delisted list, POINT-IN-TIME quarterly fundamentals (so they backtest without
// lookahead), and recent news. Merges fundamentals/news INTO the universe JSON so
// the engine reads them straight through; writes the membership/delisted lists to
// data/ for survivorship-aware universe construction.
//
//   Get a FREE key at https://site.financialmodelingprep.com/developer/docs  then:
//   set FMP_API_KEY=...   (PowerShell: $env:FMP_API_KEY="...")
//   node scripts/fetch-fundamentals.mjs                       # enrich the bundled 60
//   node scripts/fetch-fundamentals.mjs --universe=large      # enrich data/universe-large.json
//
// HONEST LIMITS (free tier): point-in-time PRICE history for DELISTED names and
// historical OPTIONS data are not fully available free — this reduces survivorship
// bias and adds real fundamentals/news, but is not a substitute for a paid
// survivorship-free price database (Sharadar/Norgate). Rate limit ~250 req/day, so
// large universes may need several runs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=?(.*)$/); return m ? [m[1], m[2] === "" ? true : m[2]] : [a, true]; }));
const KEY = process.env.FMP_API_KEY || args.key;
const BASE = "https://financialmodelingprep.com/api";
const universeFile = args.universe === "large" ? path.join(root, "data", "universe-large.json") : path.join(root, "public", "assets", "data", "market-real.json");
const dataDir = path.join(root, "data");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!KEY) {
  console.log(`
FMP_API_KEY not set. Get a FREE key (email only) at
  https://site.financialmodelingprep.com/developer/docs
then:  set FMP_API_KEY=...   and re-run.

This adds survivorship-free S&P 500 membership + delisted list, point-in-time
fundamentals, and news. Paper/simulated research only.`);
  process.exit(0);
}

async function fmp(route) {
  const url = `${BASE}${route}${route.includes("?") ? "&" : "?"}apikey=${KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${route.split("?")[0]}: HTTP ${res.status}`);
  return res.json();
}

async function membership() {
  try {
    const current = await fmp("/v3/sp500_constituent");
    const changes = await fmp("/v3/historical/sp500_constituent");
    const delisted = await fmp("/v3/delisted-companies?page=0");
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, "sp500-membership.json"), JSON.stringify({ fetchedAt: new Date().toISOString(), current, changes, delisted }, null, 2));
    console.log(`survivorship-free lists: ${current.length} current, ${changes.length} historical changes, ${delisted.length} delisted -> data/sp500-membership.json`);
  } catch (e) {
    console.log(`membership/delisted fetch failed (${e.message}) — may need a paid plan for these endpoints`);
  }
}

// quarterly ratios -> point-in-time fundamentals (oldest -> newest)
async function fundamentalsFor(ticker) {
  const ratios = await fmp(`/v3/ratios/${ticker}?period=quarter&limit=80`).catch(() => []);
  const rows = (Array.isArray(ratios) ? ratios : [])
    .filter((r) => r && r.date)
    .map((r) => ({
      date: r.date,
      pe: num(r.priceEarningsRatio),
      pb: num(r.priceToBookRatio),
      roe: num(r.returnOnEquity),
      netMargin: num(r.netProfitMargin),
      debtToEquity: num(r.debtEquityRatio)
    }))
    .filter((r) => r.pe !== undefined || r.pb !== undefined || r.roe !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}
async function newsFor(ticker) {
  const news = await fmp(`/v3/stock_news?tickers=${ticker}&limit=5`).catch(() => []);
  return (Array.isArray(news) ? news : []).map((n) => ({ date: (n.publishedDate || "").slice(0, 10), title: n.title, site: n.site, url: n.url }));
}
const num = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? undefined : Number(v));

async function main() {
  await membership();
  if (!fs.existsSync(universeFile)) {
    console.log(`universe file not found: ${universeFile} (run fetch-market-data.mjs / fetch-universe.mjs first)`);
    return;
  }
  const bundle = JSON.parse(fs.readFileSync(universeFile, "utf-8"));
  const tickers = Object.keys(bundle.tickers).filter((t) => t !== bundle.benchmark);
  console.log(`enriching ${tickers.length} names with point-in-time fundamentals + news (FMP)…`);
  let ok = 0;
  for (const t of tickers) {
    try {
      const [funds, news] = await Promise.all([fundamentalsFor(t), newsFor(t)]);
      if (funds.length) bundle.tickers[t].fundamentals = funds;
      if (news.length) bundle.tickers[t].news = news;
      if (funds.length) ok += 1;
    } catch (e) {
      console.log(`  ${t}: ${String(e.message).slice(0, 60)}`);
    }
    await sleep(280); // stay under the free rate limit
    if ((ok + 1) % 25 === 0) process.stdout.write(`  ${ok}/${tickers.length} enriched\n`);
  }
  bundle.fundamentalsSource = "FMP quarterly ratios (point-in-time) + stock news";
  fs.writeFileSync(universeFile, JSON.stringify(bundle));
  const mb = (fs.statSync(universeFile).size / 1e6).toFixed(2);
  console.log(`\nenriched ${ok}/${tickers.length} names; saved ${universeFile} (${mb} MB). The fundamental_value factor can now backtest.`);
}

main();
