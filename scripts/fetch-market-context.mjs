// Real, FREE market context for the research mind: Alpaca news (your keys) + Yahoo
// current fundamentals (P/E, P/B, ROE, margin) + Yahoo options ATM implied vol and
// put/call ratio (via Yahoo's crumb flow, keyless). Saves a compact snapshot to
// data/market-context.json (gitignored) which the horse race feeds to Claude so it
// researches with actual news / valuations / option-implied risk.
//
//   QRL_ALPACA_KEY_FILE=...  node scripts/fetch-market-context.mjs [--universe=large] [--max=40]
//
// HONEST: this is a CURRENT snapshot — it informs research, it is NOT a 20-year
// point-in-time history, so it does not by itself make a backtestable factor (that
// needs a paid fundamentals/options history). FMP's free tier paywalls fundamentals.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=?(.*)$/); return m ? [m[1], m[2] === "" ? true : m[2]] : [a, true]; }));
const MAX = Number(args.max) || 40;
const universeFile = args.universe === "large" ? path.join(root, "data", "universe-large.json") : path.join(root, "public", "assets", "data", "market-real.json");
const OUT = path.join(root, "data", "market-context.json");
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? undefined : Number(v));

// Alpaca keys from env (passed in by the bridge/race) or the key file. Never printed.
function alpacaKeys() {
  if (process.env.APCA_API_KEY_ID && process.env.APCA_API_SECRET_KEY) {
    return { id: process.env.APCA_API_KEY_ID, secret: process.env.APCA_API_SECRET_KEY };
  }
  const file = process.env.QRL_ALPACA_KEY_FILE || args.keyFile;
  if (!file) return null;
  let raw;
  try { raw = fs.readFileSync(file, "utf-8"); } catch { return null; }
  const toks = raw.split(/\s+/).filter(Boolean);
  const id = toks.find((t) => /^PK[A-Za-z0-9]{8,}$/.test(t));
  const secret = toks.find((t) => /^[A-Za-z0-9]{40,48}$/.test(t) && t !== id);
  return id && secret ? { id, secret } : null;
}

async function yahooCrumb() {
  const r1 = await fetch("https://fc.yahoo.com", { headers: UA }).catch(() => null);
  const setc = r1 && (r1.headers.getSetCookie ? r1.headers.getSetCookie() : [r1.headers.get("set-cookie")]);
  const cookie = (setc || []).filter(Boolean).map((c) => c.split(";")[0]).join("; ");
  const r2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { ...UA, cookie } });
  const crumb = await r2.text();
  return { crumb, cookie };
}

async function yahooFundamentals(sym, crumb, cookie) {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=defaultKeyStatistics,financialData,price&crumb=${encodeURIComponent(crumb)}`;
  const r = await fetch(url, { headers: { ...UA, cookie } });
  if (!r.ok) return null;
  const res = (await r.json()).quoteSummary?.result?.[0];
  if (!res) return null;
  const ks = res.defaultKeyStatistics ?? {};
  const fd = res.financialData ?? {};
  return {
    pe: num(ks.forwardPE?.raw ?? ks.trailingPE?.raw),
    pb: num(ks.priceToBook?.raw),
    roe: num(fd.returnOnEquity?.raw),
    netMargin: num(fd.profitMargins?.raw),
    revenueGrowth: num(fd.revenueGrowth?.raw),
    marketCap: num(res.price?.marketCap?.raw)
  };
}

async function yahooOptions(sym, crumb, cookie) {
  const r = await fetch(`https://query2.finance.yahoo.com/v7/finance/options/${sym}?crumb=${encodeURIComponent(crumb)}`, { headers: { ...UA, cookie } });
  if (!r.ok) return null;
  const o = (await r.json()).optionChain?.result?.[0];
  if (!o) return null;
  const spot = num(o.quote?.regularMarketPrice);
  const chain = o.options?.[0];
  if (!chain || !spot) return null;
  const atm = (chain.calls ?? []).reduce((best, c) => (Math.abs((c.strike ?? 0) - spot) < Math.abs((best?.strike ?? 1e9) - spot) ? c : best), null);
  const callVol = (chain.calls ?? []).reduce((s, c) => s + (c.volume ?? 0), 0);
  const putVol = (chain.puts ?? []).reduce((s, p) => s + (p.volume ?? 0), 0);
  return { atmIV: num(atm?.impliedVolatility), putCall: callVol > 0 ? round(putVol / callVol, 2) : undefined, expiry: o.expirationDates?.[0] };
}
const round = (x, d = 2) => (x === undefined ? undefined : Math.round(x * 10 ** d) / 10 ** d);

async function alpacaNews(keys, symbols) {
  if (!keys) return [];
  const url = `https://data.alpaca.markets/v1beta1/news?symbols=${symbols.slice(0, 30).join(",")}&limit=20&sort=desc`;
  const r = await fetch(url, { headers: { "APCA-API-KEY-ID": keys.id, "APCA-API-SECRET-KEY": keys.secret } });
  if (!r.ok) return [];
  return ((await r.json()).news ?? []).map((n) => ({ symbols: n.symbols, headline: n.headline, date: (n.created_at || "").slice(0, 10), source: n.source }));
}

async function main() {
  if (!fs.existsSync(universeFile)) { console.log(`universe file not found: ${universeFile}`); return; }
  const bundle = JSON.parse(fs.readFileSync(universeFile, "utf-8"));
  const symbols = Object.keys(bundle.tickers).filter((t) => t !== bundle.benchmark).slice(0, MAX);
  const keys = alpacaKeys();

  console.log("fetching real market context (Alpaca news + Yahoo fundamentals + options IV)…");
  const { crumb, cookie } = await yahooCrumb();
  if (!crumb) { console.log("could not get a Yahoo crumb — fundamentals/options unavailable this run"); }

  const fundamentals = {};
  const options = {};
  let f = 0;
  let o = 0;
  for (const sym of symbols) {
    if (crumb) {
      try { const fund = await yahooFundamentals(sym, crumb, cookie); if (fund) { fundamentals[sym] = fund; f += 1; } } catch { /* skip */ }
      try { const opt = await yahooOptions(sym, crumb, cookie); if (opt) { options[sym] = opt; o += 1; } } catch { /* skip */ }
      await sleep(220);
    }
  }
  const news = await alpacaNews(keys, symbols).catch(() => []);

  const ctx = { fetchedAt: new Date().toISOString(), universe: args.universe === "large" ? "large" : "bundled", fundamentals, options, news };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(ctx, null, 2));
  console.log(`saved ${OUT}: ${f} fundamentals, ${o} option snapshots, ${news.length} news items.`);
  console.log("The horse race will feed a compact summary of this to the research mind.");
}

main();
