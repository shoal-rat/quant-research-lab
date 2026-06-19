// Local simulated stock market: replays the bundled real OHLCV data bar-by-bar
// against a virtual cash account and trades the lab's cross-sectional momentum
// strategy with NO lookahead (signal at day i uses data <= i, fills at close[i],
// P&L accrues i -> i+1) and real transaction costs. Reports final equity, return,
// Sharpe, max drawdown, and a buy-and-hold SPY benchmark over the same window.
//
//   node scripts/paper-trade-sim.mjs                       # 2y, long-only top-6 momentum
//   node scripts/paper-trade-sim.mjs --window=504 --top=6 --hold=5 --cost=5 --ls
//
// This is a deterministic offline simulator (no network, no account). For a real
// simulated market with virtual money, see scripts/alpaca-paper.mjs (Alpaca paper).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// universe: QRL_UNIVERSE_FILE > --universe=large (data/universe-large.json) > bundled 60
const dataPath =
  process.env.QRL_UNIVERSE_FILE ||
  (process.argv.includes("--universe=large")
    ? path.join(root, "data", "universe-large.json")
    : path.join(root, "public", "assets", "data", "market-real.json"));

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=?(.*)$/);
    return m ? [m[1], m[2] === "" ? true : m[2]] : [a, true];
  })
);
const WINDOW = Number(args.window ?? 504); // trading days to simulate (~2y)
const TOP = Number(args.top ?? 6); // names per leg
const HOLD = Number(args.hold ?? 5); // rebalance every N days
const COST_BPS = Number(args.cost ?? 5); // per-side bps
const LOOKBACK = Number(args.lookback ?? 120);
const SKIP = Number(args.skip ?? 5);
const LONG_SHORT = Boolean(args.ls ?? false);
const REGIME = args.noregime ? false : true; // SPY-above-200d-MA trend filter (default on)
const MA_WINDOW = Number(args.ma ?? 200);
const START_CASH = 100_000;

const bundle = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
const dates = bundle.dates;
const benchmark = bundle.benchmark;
const symbols = Object.keys(bundle.tickers).filter((s) => s !== benchmark);
const closeOf = (sym, i) => bundle.tickers[sym].closes[i];

const n = dates.length;
const start = Math.max(LOOKBACK + SKIP + 2, n - WINDOW);
const end = n - 1;

function momentum(sym, i) {
  const recent = closeOf(sym, i - SKIP);
  const past = closeOf(sym, i - SKIP - LOOKBACK);
  if (!recent || !past) return null;
  return recent / past - 1;
}

// market regime: is SPY at/above its MA_WINDOW-day moving average at day i?
// (a trend filter — stay invested only in uptrends, go to cash in downtrends)
function marketRiskOn(i) {
  if (!REGIME) return true;
  let sum = 0;
  let count = 0;
  for (let k = Math.max(0, i - MA_WINDOW + 1); k <= i; k += 1) {
    const c = closeOf(benchmark, k);
    if (c) {
      sum += c;
      count += 1;
    }
  }
  const ma = count > 0 ? sum / count : 0;
  const px = closeOf(benchmark, i);
  return px && ma ? px >= ma : true;
}

// virtual account
let cash = START_CASH;
const shares = new Map(); // sym -> shares (can be negative for shorts)
const costRate = COST_BPS / 10000;
let totalCost = 0;
let trades = 0;

const equityCurve = [];
const markToMarket = (i) => {
  let positions = 0;
  for (const [sym, sh] of shares) positions += sh * (closeOf(sym, i) ?? 0);
  return cash + positions;
};

for (let i = start; i <= end; i += 1) {
  // rebalance on schedule using data through day i, filling at close[i]
  if ((i - start) % HOLD === 0 && i < end) {
    const riskOn = marketRiskOn(i);
    const scored = symbols
      .map((sym) => ({ sym, m: momentum(sym, i), px: closeOf(sym, i) }))
      .filter((x) => x.m !== null && x.px);
    scored.sort((a, b) => b.m - a.m);
    // only hold POSITIVE-momentum names, and only when the market trend is up;
    // otherwise step aside to cash (the trend filter that cuts bear drawdowns)
    const longs = riskOn ? scored.slice(0, TOP).filter((x) => x.m > 0) : [];
    const shorts = LONG_SHORT && riskOn ? scored.slice(-TOP).filter((x) => x.m < 0) : [];
    const equity = markToMarket(i);
    const target = new Map();
    const legDollar = equity / (longs.length + shorts.length || 1);
    for (const { sym, px } of longs) target.set(sym, Math.floor(legDollar / px));
    for (const { sym, px } of shorts) target.set(sym, -Math.floor(legDollar / px));

    // trade every held or targeted name to its target share count
    const names = new Set([...shares.keys(), ...target.keys()]);
    for (const sym of names) {
      const px = closeOf(sym, i);
      if (!px) continue;
      const want = target.get(sym) ?? 0;
      const have = shares.get(sym) ?? 0;
      const delta = want - have;
      if (delta === 0) continue;
      const tradeValue = Math.abs(delta) * px;
      const cost = tradeValue * costRate;
      cash -= delta * px; // buy reduces cash, sell adds
      cash -= cost;
      totalCost += cost;
      trades += 1;
      if (want === 0) shares.delete(sym);
      else shares.set(sym, want);
    }
  }
  equityCurve.push({ date: dates[i], equity: markToMarket(i) });
}

// liquidate at the end to realize P&L
const finalEquity = equityCurve[equityCurve.length - 1].equity;

// metrics
const rets = [];
for (let k = 1; k < equityCurve.length; k += 1) {
  rets.push(equityCurve[k].equity / equityCurve[k - 1].equity - 1);
}
const mean = rets.reduce((s, v) => s + v, 0) / rets.length;
const sd = Math.sqrt(rets.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, rets.length - 1));
const sharpe = (mean / (sd || 1e-9)) * Math.sqrt(252);
let peak = -Infinity;
let maxDD = 0;
for (const p of equityCurve) {
  peak = Math.max(peak, p.equity);
  maxDD = Math.min(maxDD, p.equity / peak - 1);
}

// SPY buy-and-hold over the same window
const spyStart = closeOf(benchmark, start);
const spyEnd = closeOf(benchmark, end);
const spyReturn = spyStart && spyEnd ? spyEnd / spyStart - 1 : 0;
const stratReturn = finalEquity / START_CASH - 1;

const fmt = (x) => `$${x.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const pct = (x) => `${(x * 100).toFixed(1)}%`;

console.log("\n=== Local simulated market: cross-sectional momentum ===");
console.log(`window         ${dates[start]} -> ${dates[end]} (${equityCurve.length} bars)`);
console.log(`strategy       ${LONG_SHORT ? "long/short" : "long-only"} top-${TOP} positive-momentum (${LOOKBACK}d, skip ${SKIP}), rebalance ${HOLD}d, ${COST_BPS}bps/side`);
console.log(`trend filter   ${REGIME ? `ON — only invest when SPY >= ${MA_WINDOW}d MA, else cash` : "OFF"}`);
console.log(`universe       ${symbols.length} names`);
console.log("---------------------------------------------------------");
console.log(`start cash     ${fmt(START_CASH)}`);
console.log(`final equity   ${fmt(finalEquity)}`);
console.log(`P&L            ${fmt(finalEquity - START_CASH)}  (${pct(stratReturn)})`);
console.log(`SPY buy&hold   ${pct(spyReturn)}   -> strategy ${stratReturn > spyReturn ? "BEAT" : "lagged"} the market by ${pct(stratReturn - spyReturn)}`);
console.log(`annualized Sharpe ${sharpe.toFixed(2)}   max drawdown ${pct(maxDD)}`);
console.log(`trades         ${trades}   total costs ${fmt(totalCost)}`);
console.log(`result         ${finalEquity > START_CASH ? "GAINED MONEY ✅" : "lost money ❌"}\n`);
