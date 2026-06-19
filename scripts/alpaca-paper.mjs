// Alpaca PAPER trading connector — a real simulated stock market with virtual
// money (free; sign up at https://alpaca.markets and create paper API keys).
//
// SAFETY: this script ONLY ever talks to the paper endpoint
// (https://paper-api.alpaca.markets). It has no live-trading code path. Your keys
// are read from the environment and never written anywhere.
//
//   set APCA_API_KEY_ID / APCA_API_SECRET_KEY in your environment, then:
//   node scripts/alpaca-paper.mjs status              # account equity + positions + open orders
//   node scripts/alpaca-paper.mjs validate            # backtest the strategy on history (the gate)
//   node scripts/alpaca-paper.mjs targets             # validate + show targets (no orders)
//   node scripts/alpaca-paper.mjs rebalance --yes     # validate, then if it PASSES submit PAPER orders
//
// IMPORTANT: rebalance refuses to trade unless the strategy PASSES a real
// historical backtest through the lab engine (no-lookahead, walk-forward,
// deflated Sharpe, out-of-sample IC). Use --force to override the gate, and
// --universe=large (or QRL_UNIVERSE_FILE) for the S&P500+NASDAQ-100 universe.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadValidator } from "./_engine-bridge.mjs";

const PAPER_BASE = "https://paper-api.alpaca.markets"; // paper ONLY — never the live endpoint
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = path.join(root, "public", "assets", "data", "market-real.json");
const largePath = path.join(root, "data", "universe-large.json");
// universe selection: QRL_UNIVERSE_FILE > --universe=large > bundled 60-name set
const universeFile =
  process.env.QRL_UNIVERSE_FILE ||
  (process.argv.includes("--universe=large") ? largePath : bundlePath);

// Resolve paper keys from env, else from a local key file (QRL_ALPACA_KEY_FILE).
// The file is read by THIS script only; keys are never printed or written anywhere.
function loadKeysFromFile(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf-8").trim();
  } catch {
    return null;
  }
  // 1) JSON
  try {
    const j = JSON.parse(raw);
    const id = j.APCA_API_KEY_ID || j.key_id || j.keyId || j.apiKey || j.key || j.api_key;
    const secret = j.APCA_API_SECRET_KEY || j.secret_key || j.secretKey || j.apiSecret || j.secret || j.api_secret;
    if (id && secret) return { id, secret };
  } catch {
    /* not json */
  }
  // 2) KEY=VALUE / KEY: VALUE lines
  const map = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_ -]+?)\s*[:=]\s*(.+?)\s*$/);
    if (m) map[m[1].trim().toUpperCase().replace(/[ -]/g, "_")] = m[2].trim();
  }
  let id = map.APCA_API_KEY_ID || map.API_KEY_ID || map.KEY_ID || map.API_KEY || map.ALPACA_API_KEY || map.KEY;
  let secret = map.APCA_API_SECRET_KEY || map.API_SECRET_KEY || map.SECRET_KEY || map.API_SECRET || map.ALPACA_SECRET_KEY || map.SECRET;
  // 3) bare tokens — only when UNAMBIGUOUS: exactly one Alpaca-style key id ("PK…")
  // and exactly one plausible secret token. Otherwise refuse, so a malformed file
  // errors loudly instead of silently yielding wrong credentials.
  if (!id || !secret) {
    const tokens = raw.split(/\s+/).filter(Boolean);
    const pks = tokens.filter((t) => /^PK[A-Za-z0-9]{8,}$/.test(t));
    const secs = tokens.filter((t) => !pks.includes(t) && /^[A-Za-z0-9/+]{30,}$/.test(t));
    if (pks.length === 1 && secs.length === 1) {
      id = pks[0];
      secret = secs[0];
    }
  }
  return id && secret ? { id, secret } : null;
}

const fromFile = process.env.QRL_ALPACA_KEY_FILE ? loadKeysFromFile(process.env.QRL_ALPACA_KEY_FILE) : null;
const KEY = process.env.APCA_API_KEY_ID || fromFile?.id;
const SECRET = process.env.APCA_API_SECRET_KEY || fromFile?.secret;
const TOP = Number(process.env.QRL_PAPER_TOP ?? 8);

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

// Validate the strategy on HISTORY through the real lab engine (no-lookahead
// backtest + walk-forward + deflated Sharpe + out-of-sample IC) before any trade.
async function validateOnHistory() {
  if (!fs.existsSync(universeFile)) {
    throw new Error(`universe file not found: ${universeFile} (run scripts/fetch-universe.mjs for --universe=large)`);
  }
  const { validateMomentum } = await loadValidator();
  return validateMomentum(universeFile, { top: TOP });
}

function printValidation(v) {
  const m = v.metrics;
  console.log(`\nHistorical validation via the lab engine — ${v.universeSize} names, ${v.dataRange}`);
  console.log(`  OOS Sharpe         ${m.oosSharpe.toFixed(2)}   (full-sample ${m.fullSharpe.toFixed(2)})`);
  console.log(`  OOS return/costs   ${(m.returnAfterCosts * 100).toFixed(1)}%`);
  console.log(`  deflated Sharpe    ${(m.deflatedSharpe * 100).toFixed(0)}%`);
  console.log(`  OOS IC t-stat      ${m.oosICt === null ? "n/a" : m.oosICt.toFixed(2)}  (${m.oosICobs ?? 0} rebalances)`);
  console.log(`  walk-forward pass  ${m.walkForwardPassRate === null ? "n/a" : (m.walkForwardPassRate * 100).toFixed(0) + "%"}`);
  console.log(`  vs random baseline ${m.randomBaselineSharpe.toFixed(2)}   max drawdown ${(m.maxDrawdown * 100).toFixed(1)}%`);
  console.log(`  lab pool gate      ${v.labStatus} (strictest tier; deploy uses the robust-edge bar + trend overlay)`);
  console.log(`  VERDICT            ${v.passed ? "PASSED the historical gate ✅ — cleared to paper-trade" : "FAILED ❌ — " + v.reasons.join("; ")}`);
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
  const openOrders = await api(PAPER_BASE, "/v2/orders?status=open&limit=100");
  if (openOrders.length > 0) {
    console.log(`  open orders   ${openOrders.length} (queued/working)`);
    for (const o of openOrders) {
      console.log(`    ${o.side.toUpperCase().padEnd(4)} ${o.symbol.padEnd(6)} ${o.notional ? `$${o.notional}` : `${o.qty} sh`}  ${o.status}`);
    }
  }
  console.log("");
}

async function rebalance(dryRun) {
  // GATE: backtest on history first; only trade if it passes (unless --force)
  const v = await validateOnHistory();
  printValidation(v);
  const force = args.has("--force");
  if (!v.passed && !force) {
    console.log(`\nNOT TRADING — the strategy did not pass the historical backtest. (override with --force)\n`);
    return;
  }
  if (!v.passed && force) console.log(`\n--force: overriding the failed historical gate.`);

  const { targets, regime } = v;
  console.log(`\nRegime (as of ${regime.asOf}): ${regime.riskOn ? "RISK-ON — SPY above 200d MA" : "RISK-OFF — SPY below 200d MA → hold cash"}`);
  console.log(`Targets (top-${TOP}, positive momentum): ${targets.length ? targets.join(", ") : "(cash — no positions)"}`);
  if (dryRun) {
    console.log("(dry run — pass --yes to submit PAPER orders)\n");
    return;
  }
  const clock = await api(PAPER_BASE, "/v2/clock");
  if (!clock.is_open) {
    console.log(`Market is closed (next open ${clock.next_open}). Day orders will queue for the next open.`);
  }
  const account = await api(PAPER_BASE, "/v2/account");
  // 0) cancel any stale queued orders so re-running rebalance is idempotent
  const stale = await api(PAPER_BASE, "/v2/orders?status=open&limit=100");
  if (stale.length > 0) {
    console.log(`  cancel ${stale.length} stale open order(s)`);
    await api(PAPER_BASE, "/v2/orders", { method: "DELETE" });
  }
  const positions = await api(PAPER_BASE, "/v2/positions");
  const targetSet = new Set(targets);

  // 1) close positions no longer in the target book (and everything when risk-off)
  for (const p of positions) {
    if (!targetSet.has(p.symbol)) {
      console.log(`  close ${p.symbol} (${p.qty} sh)`);
      await api(PAPER_BASE, `/v2/positions/${p.symbol}`, { method: "DELETE" });
    }
  }
  // 2) equal-weight notional into each target name (paper, fractional notional)
  if (targets.length > 0) {
    const notional = Math.floor(Number(account.equity) / targets.length);
    for (const sym of targets) {
      console.log(`  buy ${sym} ~ $${notional} (market, day)`);
      await api(PAPER_BASE, "/v2/orders", {
        method: "POST",
        body: JSON.stringify({ symbol: sym, notional, side: "buy", type: "market", time_in_force: "day" })
      });
    }
  }
  console.log("\nPaper orders submitted. Run `status` to see fills + P&L.\n");
}

async function main() {
  try {
    // validate + targets are pure backtests (no account) — no keys needed
    if (cmd === "validate") {
      printValidation(await validateOnHistory());
      console.log("");
      return;
    }
    if (cmd === "targets") {
      await rebalance(true);
      return;
    }
    if (!requireKeys()) return;
    if (cmd === "status") await status();
    else if (cmd === "rebalance") await rebalance(!args.has("--yes"));
    else console.log(`unknown command "${cmd}" (use: status | validate | targets | rebalance --yes [--force] [--universe=large])`);
  } catch (error) {
    console.error(`Alpaca paper error: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
