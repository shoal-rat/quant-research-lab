// Autonomous research -> validate -> paper-trade loop, run until a deadline.
//
// Each cycle: (1) Claude Code (the research mind) assesses the current market and
// chooses the strategy parameters to trade (and logs new factor ideas), (2) the
// REAL lab engine validates that strategy on history (no-lookahead, walk-forward,
// deflated Sharpe, OOS IC), (3) if it passes, the book is deployed to the Alpaca
// PAPER account, (4) account + trailing 1/5/10-day performance are logged.
//
// MODEL FALLBACK LADDER: Opus -> Sonnet. If the last model is rate-limited, the
// loop parses the reset time from the message and SLEEPS until then, then resumes.
//
//   set QRL_ALPACA_KEY_FILE=C:\path\to\keys.txt
//   node scripts/auto-research-loop.mjs                          # until tomorrow 18:00 ET
//   node scripts/auto-research-loop.mjs --until=2026-06-21T22:00:00Z --interval=45 --universe=large
//
// Paper/simulated only — there is no live-money path anywhere.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadValidator } from "./_engine-bridge.mjs";
import { researchJson } from "./claude-cli.mjs";
import { planEqualWeightRebalance } from "./paper-rebalance.mjs";
import {
  cancelAllOrders,
  closePosition,
  getAccount,
  getPositions,
  getOpenOrders,
  getPortfolioHistory,
  loadKeysFromFile,
  submitNotional,
  toAlpacaSymbol,
  windowReturns
} from "./alpaca-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=?(.*)$/);
    return m ? [m[1], m[2] === "" ? true : m[2]] : [a, true];
  })
);

function defaultDeadline() {
  const now = new Date();
  // tomorrow 18:00 America/New_York ≈ 22:00 UTC during EDT
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 22, 0, 0));
}
const DEADLINE = args.until ? new Date(args.until) : defaultDeadline();
// The tracked bundled panel is the reliable one-click default. Large-universe
// mode is explicit because it requires a locally fetched, gitignored dataset.
const UNIVERSE = args.universe === "large" ? "large" : "bundled";
const INTERVAL_MS = (Number(args.interval) || 45) * 60 * 1000;
const MODELS = ["opus", "sonnet", "codex"]; // fallback ladder (codex = ChatGPT-app CLI)
const KEY_FILE = process.env.QRL_ALPACA_KEY_FILE || args.keyFile || null;
const LOG = path.join(ROOT, "data", "auto-research-log.jsonl");
const universeFile =
  UNIVERSE === "large"
    ? path.join(ROOT, "data", "universe-large.json")
    : path.join(ROOT, "public", "assets", "data", "market-real.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
function log(event) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...event });
  console.log(line);
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(LOG, line + "\n");
  } catch {
    /* logging is best-effort */
  }
}

const RESEARCH_PROMPT = (families) => `You are the research mind for an automated US-equity PAPER-trading loop (simulated money).
You may web-search to gauge the current market regime (trend, volatility, leadership). The loop trades a
cross-sectional momentum book on a ${UNIVERSE === "large" ? "~513-name S&P500+NASDAQ100" : "60-name"} universe; you
choose its parameters and whether to be invested now. Computable factor families available: ${families.join(", ")}.

Return ONLY a JSON object, no prose:
{
  "regime": "one sentence on the current market regime",
  "lookback": <momentum lookback in trading days, 60-250>,
  "top": <names to hold, 5-15>,
  "holding": <rebalance cadence in trading days, 5-20>,
  "deploy": <true to trade now, false to stay in cash if the tape looks hostile>,
  "newFactorIdeas": ["up to 3 NEW tradable factor ideas to research next, each one line"]
}`;

async function researchWithFallback(families) {
  log({ phase: "research", msg: "querying research ladder", models: MODELS });
  const r = await researchJson(RESEARCH_PROMPT(families), {
    cwd: ROOT,
    models: MODELS,
    deadlineMs: DEADLINE.getTime(),
    log: (m) => log({ phase: "research", ...m })
  });
  if (!r) return null; // research unavailable; caller falls back to defaults
  log({ phase: "research", model: r.model, msg: "decision", regime: r.parsed.regime, ideas: r.parsed.newFactorIdeas });
  return { ...r.parsed, model: r.model };
}

async function deploy(keys, targets, equity) {
  const stale = await getOpenOrders(keys.id, keys.secret);
  if (stale.length) await cancelAllOrders(keys.id, keys.secret);
  const positions = await getPositions(keys.id, keys.secret);
  const plan = planEqualWeightRebalance({ equity, targets: targets.map(toAlpacaSymbol), positions });
  for (const symbol of plan.closes) await closePosition(keys.id, keys.secret, symbol).catch(() => {});
  for (const order of plan.orders) await submitNotional(keys.id, keys.secret, order.symbol, order.notional, order.side);
  return { count: plan.orders.length, targetNotional: plan.targetNotional, plan };
}

async function cycle(validateMomentum, computable) {
  const decision = (await researchWithFallback(computable)) || { lookback: 120, top: 8, holding: 5, deploy: true, model: "default" };
  const v = validateMomentum(universeFile, { top: Number(decision.top) || 8, lookback: Number(decision.lookback) || 120, holding: Number(decision.holding) || 5 });
  log({
    phase: "validate",
    model: decision.model,
    passed: v.passed,
    oosSharpe: v.metrics.oosSharpe,
    oosICt: v.metrics.oosICt,
    riskOn: v.regime.riskOn,
    targets: v.targets,
    reasons: v.reasons
  });

  if (!KEY_FILE) {
    log({ phase: "deploy", traded: false, reason: "no QRL_ALPACA_KEY_FILE set" });
    return;
  }
  const keys = loadKeysFromFile(KEY_FILE);
  if (!keys) {
    log({ phase: "deploy", traded: false, reason: "could not parse key file" });
    return;
  }
  const account = await getAccount(keys.id, keys.secret).catch((e) => ({ error: String(e) }));
  if (account.error) {
    log({ phase: "deploy", traded: false, reason: account.error });
    return;
  }
  const shouldTrade = v.passed && decision.deploy !== false && v.targets.length > 0;
  if (shouldTrade) {
    const r = await deploy(keys, v.targets, Number(account.equity));
    log({ phase: "deploy", traded: true, ...r, targets: v.targets });
  } else {
    log({ phase: "deploy", traded: false, reason: !v.passed ? "failed historical gate" : !v.targets.length ? "regime cash" : "research said hold" });
  }
  const hist = await getPortfolioHistory(keys.id, keys.secret).catch(() => null);
  log({ phase: "performance", equity: Number(account.equity), perf: windowReturns(hist) });
}

async function main() {
  log({ phase: "start", deadline: DEADLINE.toISOString(), universe: UNIVERSE, intervalMin: INTERVAL_MS / 60000, models: MODELS, hasKeys: Boolean(KEY_FILE) });
  if (!fs.existsSync(universeFile)) {
    log({ phase: "fatal", error: `universe file missing: ${universeFile} (run scripts/fetch-universe.mjs)` });
    return;
  }
  const { validateMomentum, computableFamilies } = await loadValidator();
  const computable = (computableFamilies ? computableFamilies() : []).map((f) => f.key);

  let n = 0;
  while (Date.now() < DEADLINE.getTime()) {
    n += 1;
    log({ phase: "cycle", n, remainingHours: ((DEADLINE.getTime() - Date.now()) / 3600000).toFixed(1) });
    try {
      await cycle(validateMomentum, computable);
    } catch (e) {
      log({ phase: "error", error: String(e instanceof Error ? e.stack : e) });
    }
    const remaining = DEADLINE.getTime() - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(INTERVAL_MS, remaining));
  }
  log({ phase: "done", deadline: DEADLINE.toISOString(), cycles: n });
}

main();
