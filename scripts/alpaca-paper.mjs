// Alpaca PAPER trading connector — a real simulated stock market with virtual
// money (free; sign up at https://alpaca.markets and create paper API keys).
//
// SAFETY: this script ONLY ever talks to the paper endpoint
// (https://paper-api.alpaca.markets). It has no live-trading code path. Your keys
// are read from the environment and never written anywhere.
//
//   set APCA_API_KEY_ID / APCA_API_SECRET_KEY in your environment, then:
//   node scripts/alpaca-paper.mjs status        # account equity + open positions
//   node scripts/alpaca-paper.mjs targets       # momentum targets from the bundle (no orders)
//   node scripts/alpaca-paper.mjs rebalance --yes   # submit PAPER orders to the momentum book
//
// The strategy mirrors the lab's cross-sectional momentum (top-N, equal weight).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PAPER_BASE = "https://paper-api.alpaca.markets"; // paper ONLY — never the live endpoint
const DATA_BASE = "https://data.alpaca.markets";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "public", "assets", "data", "market-real.json");

const KEY = process.env.APCA_API_KEY_ID;
const SECRET = process.env.APCA_API_SECRET_KEY;
const TOP = Number(process.env.QRL_PAPER_TOP ?? 6);

const args = new Set(process.argv.slice(3));
const cmd = process.argv[2] ?? "status";

function requireKeys() {
  if (KEY && SECRET) return true;
  console.log(`
Alpaca paper keys not found in the environment.

1. Create a FREE account at https://alpaca.markets (email only) and open the
   "Paper Trading" dashboard.
2. Generate paper API keys there.
3. Export them (do NOT paste them to anyone):
     PowerShell:  $env:APCA_API_KEY_ID="..."; $env:APCA_API_SECRET_KEY="..."
     bash:        export APCA_API_KEY_ID=...   APCA_API_SECRET_KEY=...
4. Re-run:  node scripts/alpaca-paper.mjs status

This connector only ever uses the PAPER endpoint (${PAPER_BASE}); it cannot place
live-money orders.`);
  return false;
}

const headers = { "APCA-API-KEY-ID": KEY ?? "", "APCA-API-SECRET-KEY": SECRET ?? "", "Content-Type": "application/json" };

async function api(base, route, init = {}) {
  const res = await fetch(`${base}${route}`, { ...init, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${route}: HTTP ${res.status} ${body.message ?? text}`);
  return body;
}

// momentum targets from the bundled closes (same signal the lab/sim uses)
function momentumTargets() {
  const bundle = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  const benchmark = bundle.benchmark;
  const symbols = Object.keys(bundle.tickers).filter((s) => s !== benchmark);
  const last = bundle.dates.length - 1;
  const scored = symbols
    .map((sym) => {
      const closes = bundle.tickers[sym].closes;
      const recent = closes[last - 5];
      const past = closes[last - 125];
      return { sym, m: recent && past ? recent / past - 1 : null };
    })
    .filter((x) => x.m !== null)
    .sort((a, b) => b.m - a.m);
  return scored.slice(0, TOP).map((x) => x.sym);
}

async function status() {
  const account = await api(PAPER_BASE, "/v2/account");
  const positions = await api(PAPER_BASE, "/v2/positions");
  console.log(`\nAlpaca PAPER account`);
  console.log(`  status        ${account.status}`);
  console.log(`  equity        $${Number(account.equity).toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
  console.log(`  cash          $${Number(account.cash).toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
  console.log(`  buying power   $${Number(account.buying_power).toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
  console.log(`  positions     ${positions.length}`);
  for (const p of positions) {
    const pl = Number(p.unrealized_pl);
    console.log(`    ${p.symbol.padEnd(6)} ${p.qty.padStart(8)} sh  mkt $${Number(p.market_value).toFixed(0).padStart(9)}  P&L ${pl >= 0 ? "+" : ""}$${pl.toFixed(0)}`);
  }
  console.log("");
}

async function rebalance(dryRun) {
  const targets = momentumTargets();
  console.log(`\nMomentum targets (top-${TOP}): ${targets.join(", ")}`);
  if (dryRun) {
    console.log("(dry run — pass --yes to submit PAPER orders)\n");
    return;
  }
  const clock = await api(PAPER_BASE, "/v2/clock");
  if (!clock.is_open) {
    console.log(`Market is closed (next open ${clock.next_open}). Orders would queue; re-run when open or proceed knowingly.`);
  }
  const account = await api(PAPER_BASE, "/v2/account");
  const positions = await api(PAPER_BASE, "/v2/positions");
  const targetSet = new Set(targets);

  // 1) close positions no longer in the target book
  for (const p of positions) {
    if (!targetSet.has(p.symbol)) {
      console.log(`  close ${p.symbol} (${p.qty} sh)`);
      await api(PAPER_BASE, `/v2/positions/${p.symbol}`, { method: "DELETE" });
    }
  }
  // 2) equal-weight notional into each target name (paper, fractional notional)
  const notional = Math.floor(Number(account.equity) / targets.length);
  for (const sym of targets) {
    console.log(`  buy ${sym} ~ $${notional} (market, day)`);
    await api(PAPER_BASE, "/v2/orders", {
      method: "POST",
      body: JSON.stringify({ symbol: sym, notional, side: "buy", type: "market", time_in_force: "day" })
    });
  }
  console.log("\nPaper orders submitted. Run `status` to see fills + P&L.\n");
}

async function main() {
  if (!requireKeys()) return;
  try {
    if (cmd === "status") await status();
    else if (cmd === "targets") await rebalance(true);
    else if (cmd === "rebalance") await rebalance(args.has("--yes"));
    else console.log(`unknown command "${cmd}" (use: status | targets | rebalance --yes)`);
  } catch (error) {
    console.error(`Alpaca paper error: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
