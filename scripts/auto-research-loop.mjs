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
import {
  cancelAllOrders,
  closePosition,
  getAccount,
  getPositions,
  getOpenOrders,
  getPortfolioHistory,
  loadKeysFromFile,
  submitNotional,
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
const UNIVERSE = args.universe === "bundled" ? "bundled" : "large";
const INTERVAL_MS = (Number(args.interval) || 45) * 60 * 1000;
const MODELS = ["opus", "sonnet"]; // fallback ladder
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

function extractJson(text) {
  const m = text && text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

// parse a rate-limit reset time from Claude's message (unix ts, or "resets at 3pm")
function parseResetTime(s) {
  const u = s.match(/reset[^0-9]{0,14}(\d{10})/i);
  if (u) return new Date(Number(u[1]) * 1000);
  const t = s.match(/reset[s]?\b[^0-9]{0,14}(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (t) {
    let h = Number(t[1]);
    const min = Number(t[2] || 0);
    const ap = (t[3] || "").toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    const d = new Date();
    d.setHours(h, min, 0, 0);
    if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
    return d;
  }
  return null;
}

function runClaude(prompt, model) {
  return new Promise((resolve) => {
    // Pass the prompt on STDIN, not argv: a long multi-line prompt as a shell arg
    // gets split/truncated by the Windows shell (claude then sees only "You ...").
    const cp = spawn(
      "claude",
      ["-p", "--model", model, "--output-format", "json", "--allowedTools", "WebSearch,WebFetch", "--permission-mode", "bypassPermissions"],
      { cwd: ROOT, shell: process.platform === "win32" }
    );
    let out = "";
    let err = "";
    cp.stdout.on("data", (d) => (out += d));
    cp.stderr.on("data", (d) => (err += d));
    cp.on("error", (e) => resolve({ ok: false, error: String(e), rateLimited: false }));
    try {
      cp.stdin.write(prompt);
      cp.stdin.end();
    } catch {
      /* stdin may already be closed on spawn error */
    }
    cp.on("close", () => {
      const blob = `${out}\n${err}`;
      const rateLimited = /usage limit|rate.?limit|too many requests|\b429\b|limit reached|overloaded/i.test(blob);
      const resetAt = parseResetTime(blob);
      let text = "";
      try {
        const j = JSON.parse(out);
        if (j.is_error) {
          resolve({ ok: false, error: String(j.result || "error"), rateLimited, resetAt });
          return;
        }
        text = j.result ?? j.text ?? "";
      } catch {
        text = out;
      }
      if (rateLimited && !extractJson(text)) {
        resolve({ ok: false, rateLimited: true, resetAt, error: "rate limited" });
        return;
      }
      resolve({ ok: true, text, rateLimited, resetAt });
    });
  });
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
  for (let i = 0; i < MODELS.length; i += 1) {
    const model = MODELS[i];
    log({ phase: "research", model, msg: "querying claude" });
    const r = await runClaude(RESEARCH_PROMPT(families), model);
    if (r.ok) {
      const parsed = extractJson(r.text || "");
      if (parsed) {
        log({ phase: "research", model, msg: "decision", regime: parsed.regime, ideas: parsed.newFactorIdeas });
        return { ...parsed, model };
      }
      log({ phase: "research", model, msg: "unparseable output", sample: (r.text || "").slice(0, 160) });
    }
    if (r.rateLimited) {
      if (i < MODELS.length - 1) {
        log({ phase: "research", model, msg: "rate limited -> falling back to next model", resetAt: r.resetAt?.toISOString() });
        continue;
      }
      // last model limited: sleep until reset, then retry the whole ladder
      const waitMs = r.resetAt ? r.resetAt.getTime() - Date.now() : 60 * 60 * 1000;
      log({ phase: "research", model, msg: "all models rate-limited; sleeping until reset", until: r.resetAt?.toISOString(), waitMin: Math.round(waitMs / 60000) });
      await sleep(waitMs + 30_000);
      if (Date.now() < DEADLINE.getTime()) return researchWithFallback(families);
      return null;
    }
    // non-limit failure on this model: try the next one
    log({ phase: "research", model, msg: "failed (non-limit), trying next", error: r.error });
  }
  return null; // research unavailable; caller falls back to defaults
}

async function deploy(keys, targets, equity) {
  const stale = await getOpenOrders(keys.id, keys.secret);
  if (stale.length) await cancelAllOrders(keys.id, keys.secret);
  const positions = await getPositions(keys.id, keys.secret);
  const targetSet = new Set(targets);
  for (const p of positions) if (!targetSet.has(p.symbol)) await closePosition(keys.id, keys.secret, p.symbol).catch(() => {});
  const notional = Math.floor(equity / Math.max(1, targets.length));
  for (const sym of targets) await submitNotional(keys.id, keys.secret, sym, notional, "buy");
  return { count: targets.length, notional };
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
