// STRATEGY HORSE RACE — a continuous multi-strategy paper-trading tournament.
//
//   * Researches strategies IN PARALLEL (Claude Code, opus->sonnet fallback) and
//     validates each through the REAL engine gate before it can race.
//   * Splits the account into N virtual sleeves (default 10 x $10k). Each sleeve
//     holds a different strategy's book and is marked to market from LIVE Alpaca
//     prices — a real horse race you can watch in data/horse-race-state.json.
//   * On a schedule it RANKS the field, EVICTS the worst horse, researches +
//     validates a fresh challenger, and replaces it (capital conserved). Survivors
//     refresh their books.
//   * Deploys the current LEADER's book to your real Alpaca PAPER account, so the
//     live account rides the winning horse.
//
// Single Alpaca paper account can't be physically split, so the 10 sleeves are a
// faithful virtual ledger (real prices, real costs); the real account mirrors the
// leader. Paper/simulated only — no live-money path.
//
//   set QRL_ALPACA_KEY_FILE=C:\path\to\keys.txt
//   node scripts/horse-race-loop.mjs --until=2026-06-20T22:00:00Z --sleeves=10 --interval=30 --evictHours=6 --universe=large
//   --force is a loudly logged, paper-only deployment override for a leader whose
//   candidate validation did not pass. The default is fail-closed.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadValidator } from "./_engine-bridge.mjs";
import { researchJson } from "./claude-cli.mjs";
import { planEqualWeightRebalance } from "./paper-rebalance.mjs";
import {
  annualizedSharpe,
  canonicalKey,
  dailyReturnsFromMarks,
  markPositions,
  positionPrice,
  reconcileVerdict
} from "./race-lib.mjs";
import {
  cancelAllOrders,
  closePosition,
  getAccount,
  getLatestPrices,
  getOpenOrders,
  getPositions,
  loadKeysFromFile,
  submitNotional,
  toAlpacaSymbol
} from "./alpaca-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=?(.*)$/); return m ? [m[1], m[2] === "" ? true : m[2]] : [a, true]; }));
const SLEEVES = Number(args.sleeves) || 10;
const TOTAL = Number(args.total) || 100_000;
const INTERVAL_MS = (Number(args.interval) || 30) * 60 * 1000;
const EVICT_MS = (Number(args.evictHours) || 6) * 3600 * 1000;
// keep researching + validating NEW ideas into a bench pool on this cadence, even
// when the market is closed (validation is historical, market-independent), so the
// race always has fresh, vetted challengers ready to swap in.
const RESEARCH_MS = (Number(args.researchHours) || 2) * 3600 * 1000;
// refresh the real market context (Alpaca news + Yahoo fundamentals/options IV) the
// research mind reads, so "one click start" keeps it fresh with no extra command.
const CONTEXT_MS = (Number(args.contextHours) || 3) * 3600 * 1000;
const POOL_CAP = Number(args.poolCap) || 30;
const COST_BPS = Number(args.cost) || 5;
const TOP = Number(args.top) || 8;
const UNIVERSE = args.universe === "large" ? "large" : "bundled";
const KEY_FILE = process.env.QRL_ALPACA_KEY_FILE || args.keyFile || null;
// This is deliberately a deployment-only escape hatch. A non-validated sleeve
// can still be observed in the virtual race, but it never reaches Alpaca unless
// an operator explicitly starts the paper-only loop with --force.
const FORCE_DEPLOY = args.force === true || args.force === "true" || args.force === "1";
// keys come from APCA_API_KEY_ID/SECRET (e.g. passed in by the bridge when the web
// page hits Start) OR a key file. Resolved per call, never stored.
function resolveKeys() {
  if (process.env.APCA_API_KEY_ID && process.env.APCA_API_SECRET_KEY) {
    return { id: process.env.APCA_API_KEY_ID, secret: process.env.APCA_API_SECRET_KEY };
  }
  return KEY_FILE ? loadKeysFromFile(KEY_FILE) : null;
}
const HAS_KEYS = Boolean((process.env.APCA_API_KEY_ID && process.env.APCA_API_SECRET_KEY) || KEY_FILE);
function defaultDeadline() { const n = new Date(); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1, 22, 0, 0)); }
const DEADLINE = args.until ? new Date(args.until) : defaultDeadline();
const universeFile = UNIVERSE === "large" ? path.join(ROOT, "data", "universe-large.json") : path.join(ROOT, "public", "assets", "data", "market-real.json");
const LOG = path.join(ROOT, "data", "horse-race-log.jsonl");
const STATE = path.join(ROOT, "data", "horse-race-state.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
function log(e) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...e });
  console.log(line);
  try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, line + "\n"); } catch {}
}
function saveState(state) { try { fs.writeFileSync(STATE, JSON.stringify(state, null, 2)); } catch {} }

const priceCache = {};

// Compact, real market context (from scripts/fetch-market-context.mjs) for the
// research mind: recent news + option-implied vol + cheap/expensive valuations.
function marketContextSummary() {
  const file = path.join(ROOT, "data", "market-context.json");
  let c;
  try { if (fs.existsSync(file)) c = JSON.parse(fs.readFileSync(file, "utf-8")); } catch { return ""; }
  if (!c) return "";
  const lines = [];
  const news = (c.news || []).slice(0, 5).map((n) => `- ${n.headline}`);
  if (news.length) lines.push("Recent news:\n" + news.join("\n"));
  const opt = Object.entries(c.options || {}).filter(([, v]) => v.atmIV).sort((a, b) => b[1].atmIV - a[1].atmIV);
  if (opt.length) lines.push(`Highest option-implied vol: ${opt.slice(0, 4).map(([s, v]) => `${s} ${(v.atmIV * 100).toFixed(0)}%`).join(", ")}`);
  const fund = Object.entries(c.fundamentals || {}).filter(([, v]) => v.pe && v.pe > 0).sort((a, b) => a[1].pe - b[1].pe);
  if (fund.length) lines.push(`Cheapest P/E: ${fund.slice(0, 3).map(([s, v]) => `${s} ${v.pe.toFixed(0)}`).join(", ")}; priciest: ${fund.slice(-3).map(([s, v]) => `${s} ${v.pe.toFixed(0)}`).join(", ")}`);
  return lines.length ? `\nREAL MARKET CONTEXT (today — for your judgement; the traded factors stay price/volume):\n${lines.join("\n")}\n` : "";
}

function promptText(value, limit = 180) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function configSummary(config) {
  if (!config) return "unknown";
  const params = promptText(JSON.stringify(config.params || {}), 120);
  return `${config.familyKey || "unknown"} holding=${config.holding || "default"} params=${params}`;
}

// Persisted tournament evidence is fed back into every subsequent research call.
// This prevents the research model from repeatedly proposing an evicted config or
// mistaking a weak live sleeve for unexplored opportunity.
function raceFeedbackSummary(state) {
  if (!state) return "";
  const lines = [];
  const board = standings(state).slice(0, 6);
  if (board.length) {
    lines.push(
      `Current standings: ${board
        .map((s) => `${s.rank}. ${promptText(s.name, 80)} ret=${Number(s.ret || 0).toFixed(2)}% oos=${Number(s.oosSharpe || 0).toFixed(2)} live=${s.liveVerdict || "new"}`)
        .join(" | ")}`
    );
  }
  const evicted = (state.evicted || []).slice(-8);
  if (evicted.length) {
    lines.push(
      `Recent evictions (do not re-propose): ${evicted
        .map((s) => `${promptText(s.name, 70)} [${s.reason || "lowest NAV"}; ${s.liveVerdict || "n/a"}]`)
        .join(" | ")}`
    );
  }
  const racing = (state.sleeves || []).slice(0, 12);
  if (racing.length) lines.push(`Already racing: ${racing.map((s) => configSummary(s)).join(" | ")}`);
  const bench = (state.pool || []).slice(0, 6);
  if (bench.length) lines.push(`Already vetted on bench: ${bench.map((p) => configSummary(p.config)).join(" | ")}`);
  const seedFails = (state.seedFeedback || []).slice(0, 10);
  if (seedFails.length) {
    lines.push(
      `Last round FAILED the admission gate (deflated Sharpe >= 50% of trials, HAC OOS IC t >= 1.5): ${seedFails.join(
        " | "
      )}. Propose stronger, less-crowded signals — different families, horizons and parameters, not small tweaks of the failures.`
    );
  }
  return lines.length
    ? `\nTOURNAMENT FEEDBACK (use it as evidence; seek a distinct, validated configuration):\n${lines.map((line) => `- ${line}`).join("\n")}\n`
    : "";
}

async function researchConfigs(computableKeys, deadlineMs, state) {
  const ctx = marketContextSummary();
  const feedback = raceFeedbackSummary(state);
  const prompt = `You are the research mind for a paper-trading STRATEGY TOURNAMENT on US equities. You may web-search the
current regime. Propose 3 DISTINCT candidate strategies drawn from these computable factor families:
${computableKeys.join(", ")}. Vary the family and the parameters; favour what should work in the current regime.
Notes: price/volume families always work; "fundamental_value" works only if a fundamentals feed (FMP) has been
loaded, otherwise it is skipped automatically — feel free to propose it, it self-filters if data is absent.
Special family "formulaic_alpha": you may COMPOSE a custom alpha formula in the lab's DSL and pass it as
params: {"formula": "<expression>"} — higher per-bar values are ranked long, lower short. DSL reference:
terminals close, high, low, volume, returns, vwapproxy, dollarvol; arithmetic + - * / and ( );
ts_mean/ts_std/ts_rank/ts_min/ts_max/ts_sum/ts_zscore(expr, window), delta/delay(expr, window),
ts_corr(exprA, exprB, window), abs/log/sign/sqrt/pow2/neg(expr), zn(expr) = cross-sectional z-score,
min/max(a, b), clamp(x, lo, hi); factor motifs mom(lookback, skip), rev(w), vol(w), amihud(w), r52wk(w),
range_vol(w), adv_log(w), peer_gap(w), quality_drift(w). Windows are integer literals 2-500 (trailing only —
lookahead is impossible). Example: "zn(mom(120, 5)) + zn(neg(vol(20))) * ts_rank(dollarvol, 60)".${ctx}${feedback}
Return ONLY JSON: {"configs":[{"familyKey":"<one of the list>","params":{"<paramName>":<number>},"holding":<5|10|20>,"why":"one line"}]}`;
  const K = Math.min(4, Math.ceil(SLEEVES / 2));
  const calls = Array.from({ length: K }, (_, i) =>
    researchJson(`${prompt}\n(independent batch ${i + 1} — be different from typical answers)`, {
      cwd: ROOT,
      deadlineMs,
      log: (m) => log({ phase: "research", batch: i + 1, ...m })
    })
  );
  const results = await Promise.all(calls);
  const pool = [];
  for (const r of results) {
    const configs = r?.parsed?.configs;
    if (!Array.isArray(configs)) continue;
    for (const c of configs) {
      if (c && computableKeys.includes(c.familyKey)) {
        pool.push({ familyKey: c.familyKey, params: c.params && typeof c.params === "object" ? c.params : {}, holding: Number(c.holding) || undefined, why: String(c.why || "").slice(0, 120), model: r.model });
      }
    }
  }
  log({ phase: "research", msg: "parallel configs proposed", count: pool.length });
  return pool;
}

function validateAll(validateConfig, configs) {
  const seen = new Set();
  const out = [];
  for (const c of configs) {
    const k = canonicalKey(c);
    if (seen.has(k)) continue;
    seen.add(k);
    try {
      const v = validateConfig(universeFile, { familyKey: c.familyKey, params: c.params, top: TOP, holding: c.holding });
      out.push({ config: c, v });
    } catch (e) {
      log({ phase: "validate", familyKey: c.familyKey, error: String(e).slice(0, 120) });
    }
  }
  // best edge first: passers before non-passers, then by OOS Sharpe
  out.sort((a, b) => Number(b.v.passed) - Number(a.v.passed) || b.v.metrics.oosSharpe - a.v.metrics.oosSharpe);
  return out;
}

function makeSleeve(id, cash, candidate) {
  const { config, v } = candidate;
  const sleeve = {
    id,
    name: `${v.familyKey}${config.params && Object.keys(config.params).length ? " " + JSON.stringify(config.params) : ""}`,
    familyKey: v.familyKey,
    params: config.params || {},
    holding: config.holding,
    why: config.why || "",
    validated: v.passed,
    pedigree: { oosSharpe: v.metrics.oosSharpe, oosICt: v.metrics.oosICt, deflated: v.metrics.deflatedSharpe, wf: v.metrics.walkForwardPassRate },
    cash,
    navStart: cash,
    nav: cash,
    navPeak: cash,
    positions: {},
    targets: v.targets,
    inceptedAt: new Date().toISOString(),
    history: []
  };
  buyBook(sleeve, v.targets);
  return sleeve;
}

// Older state-shaped sleeves stored a bare fractional-share number. Normalize
// them on touch so all newly written ledgers persist a per-position last mark.
function normalizePositionBook(sleeve) {
  const normalized = {};
  const positions = sleeve.positions && typeof sleeve.positions === "object" ? sleeve.positions : {};
  for (const [symbol, raw] of Object.entries(positions)) {
    if (typeof raw === "number") {
      if (!Number.isFinite(raw) || raw === 0) continue;
      const last = priceCache[symbol];
      normalized[symbol] = {
        sh: raw,
        ...(typeof last === "number" && last > 0 ? { lastPrice: last } : {})
      };
      continue;
    }
    if (!raw || typeof raw !== "object") continue;
    const sh = Number(raw.sh);
    if (!Number.isFinite(sh) || sh === 0) continue;
    const lastPrice = Number(raw.lastPrice);
    normalized[symbol] = {
      sh,
      ...(Number.isFinite(lastPrice) && lastPrice > 0 ? { lastPrice } : {})
    };
  }
  sleeve.positions = normalized;
  return normalized;
}

function buyBook(sleeve, targets) {
  const positions = normalizePositionBook(sleeve);
  const desiredTargets = [...new Set((targets || []).filter((symbol) => typeof symbol === "string" && symbol.length > 0))];
  const heldSymbols = Object.keys(positions);
  const unchanged =
    desiredTargets.length === heldSymbols.length &&
    desiredTargets.every((symbol) => Object.prototype.hasOwnProperty.call(positions, symbol));
  // Avoid churning an unchanged virtual book every eviction cycle. It also
  // naturally carries a last-known position through a transient quote outage.
  if (unchanged) {
    sleeve.targets = desiredTargets;
    return { rebalanced: false, unchanged: true };
  }
  // Price the entire old book before changing any holdings. If an old position
  // predates lastPrice persistence and has no quote, retain it intact rather
  // than selectively selling the rest and silently writing it down to zero.
  const liquidation = [];
  for (const [symbol, position] of Object.entries(positions)) {
    const p = positionPrice(position, priceCache[symbol]);
    if (!(p > 0)) {
      return { rebalanced: false, reason: `no current or last-known price for ${symbol}` };
    }
    liquidation.push({ symbol, position, price: p });
  }
  // Existing targets may use their recorded last price when Alpaca omitted a
  // quote this cycle. New symbols still require a real quote before entry.
  const entries = desiredTargets
    .map((symbol) => ({ symbol, price: positionPrice(positions[symbol], priceCache[symbol]) }))
    .filter((entry) => entry.price > 0);
  for (const { position, price } of liquidation) {
    const value = position.sh * price;
    sleeve.cash += value;
    sleeve.cash -= Math.abs(value) * (COST_BPS / 10000);
  }
  sleeve.positions = {};
  sleeve.targets = desiredTargets;
  if (!entries.length) return { rebalanced: true, heldCash: true }; // risk-off or no usable quote: stay in cash
  // Reserve each entry's paper cost up front, rather than allowing the virtual
  // sleeve's cash balance to drift negative merely because it opened a book.
  const per = sleeve.cash / (entries.length * (1 + COST_BPS / 10000));
  for (const { symbol, price } of entries) {
    const sym = symbol;
    const p = price;
    const sh = per / p; // fractional virtual shares
    sleeve.positions[sym] = { sh, lastPrice: p };
    sleeve.cash -= sh * p;
    sleeve.cash -= sh * p * (COST_BPS / 10000);
  }
  return { rebalanced: true, positions: entries.length };
}

function markSleeve(s) {
  const positions = normalizePositionBook(s);
  const unpriced = Object.entries(positions)
    .filter(([symbol, position]) => !(positionPrice(position, priceCache[symbol]) > 0))
    .map(([symbol]) => symbol);
  if (unpriced.length) {
    const warning = `retained prior NAV: no current or last-known mark for ${unpriced.join(", ")}`;
    if (s.ledgerWarning !== warning) log({ phase: "ledger", sleeve: s.id, warning });
    s.ledgerWarning = warning;
    return;
  }
  delete s.ledgerWarning;
  const posVal = markPositions(positions, priceCache);
  s.nav = round(s.cash + posVal);
  s.navPeak = Math.max(Number(s.navPeak) || s.nav, s.nav);
  s.ret = round((s.nav / s.navStart - 1) * 100, 2);
  s.drawdown = round((s.nav / s.navPeak - 1) * 100, 2);
}

const MAX_DAILY_MARKS = 400;

function recordDailyMark(sleeve, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const isWeekday = now.getUTCDay() >= 1 && now.getUTCDay() <= 5;
  const rawHistory = Array.isArray(sleeve.history) ? sleeve.history : [];
  const history = rawHistory
    .map((mark) => {
      const date = typeof mark?.date === "string" ? mark.date.slice(0, 10) : typeof mark?.ts === "string" ? mark.ts.slice(0, 10) : "";
      const nav = Number(mark?.nav);
      return date && Number.isFinite(nav) && nav > 0 ? { date, nav } : null;
    })
    .filter(Boolean)
    .slice(-MAX_DAILY_MARKS);
  const last = history[history.length - 1];
  if (last?.date === today) last.nav = sleeve.nav;
  // Do not manufacture zero-return observations over weekends. This is still a
  // lightweight paper ledger rather than an exchange calendar, but it keeps the
  // live Sharpe from treating Saturday/Sunday marks as trading sessions.
  else if (isWeekday) history.push({ date: today, nav: sleeve.nav });
  sleeve.history = history.slice(-MAX_DAILY_MARKS);

  const returns = dailyReturnsFromMarks(sleeve.history);
  const liveSharpe = annualizedSharpe(returns);
  const cumulativeReturn = sleeve.navStart > 0 ? sleeve.nav / sleeve.navStart - 1 : null;
  const reconciliation = reconcileVerdict({
    liveDays: returns.length,
    liveSharpe,
    cumReturn: cumulativeReturn,
    backtestSharpe: sleeve.pedigree?.oosSharpe
  });
  sleeve.live = {
    marks: sleeve.history.length,
    days: returns.length,
    sharpe: liveSharpe === null ? null : round(liveSharpe, 4),
    cumulativeReturn: cumulativeReturn === null ? null : round(cumulativeReturn, 6),
    verdict: reconciliation.verdict,
    note: reconciliation.note,
    updatedAt: now.toISOString()
  };
}

async function refreshPrices(state) {
  if (!HAS_KEYS) return;
  const keys = resolveKeys();
  if (!keys) return;
  const syms = new Set();
  for (const s of state.sleeves) {
    Object.keys(s.positions).forEach((x) => syms.add(x));
    (s.targets || []).forEach((x) => syms.add(x));
  }
  if (!syms.size) return;
  try {
    const prices = await getLatestPrices(keys.id, keys.secret, [...syms]);
    Object.assign(priceCache, prices);
  } catch (e) {
    log({ phase: "prices", error: String(e).slice(0, 140) });
  }
}

async function deployLeader(leader) {
  if (!HAS_KEYS) return false;
  if (!leader) return false;
  if (!leader.targets?.length) {
    log({ phase: "deploy-leader", skipped: "leader has no current targets", leader: leader.name });
    return false;
  }
  if (!leader.validated && !FORCE_DEPLOY) {
    log({
      phase: "deploy-leader",
      skipped: "FAIL-CLOSED: current candidate validation did not pass (use --force only to bypass for paper testing)",
      leader: leader.name,
      oosSharpe: leader.pedigree?.oosSharpe
    });
    return false;
  }
  if (!leader.validated && FORCE_DEPLOY) {
    log({
      phase: "deploy-leader",
      warning: "FORCED PAPER-ONLY DEPLOYMENT: candidate validation did not pass; --force override active",
      leader: leader.name
    });
  }
  const keys = resolveKeys();
  if (!keys) return false;
  try {
    const account = await getAccount(keys.id, keys.secret);
    const stale = await getOpenOrders(keys.id, keys.secret);
    if (stale.length) await cancelAllOrders(keys.id, keys.secret);
    const positions = await getPositions(keys.id, keys.secret);
    const alpacaTargets = leader.targets.map(toAlpacaSymbol);
    const plan = planEqualWeightRebalance({ equity: account.equity, targets: alpacaTargets, positions });
    for (const symbol of plan.closes) await closePosition(keys.id, keys.secret, symbol).catch(() => {});
    const filled = [];
    for (const order of plan.orders) {
      try {
        await submitNotional(keys.id, keys.secret, order.symbol, order.notional, order.side);
        filled.push(order);
      } catch (e) {
        log({ phase: "deploy-leader", skip: order.symbol, error: String(e).slice(0, 100) });
      }
    }
    log({ phase: "deploy-leader", leader: leader.name, targets: filled, targetNotional: plan.targetNotional, forced: !leader.validated && FORCE_DEPLOY });
    return true;
  } catch (e) {
    log({ phase: "deploy-leader", error: String(e).slice(0, 140) });
    return false;
  }
}

function standings(state) {
  return [...(state.sleeves || [])]
    .sort((a, b) => Number(b.nav || 0) - Number(a.nav || 0))
    .map((s, i) => ({
      rank: i + 1,
      name: s.name,
      ret: s.ret,
      nav: Math.round(s.nav),
      validated: s.validated,
      oosSharpe: s.pedigree?.oosSharpe,
      liveVerdict: s.live?.verdict || "new",
      liveSharpe: s.live?.sharpe ?? null,
      liveDays: s.live?.days || 0
    }));
}

// Research + validate NEW ideas and add the passers to the bench pool. Runs on its
// own cadence regardless of market hours, so a deep bench of vetted challengers is
// always ready. Dedupes against what is racing and what is already pooled.
async function researchRound(state, validateConfig, computableKeys) {
  state.pool = state.pool || [];
  const racing = new Set(state.sleeves.map((s) => canonicalKey({ familyKey: s.familyKey, params: s.params, holding: s.holding })));
  const pooled = new Set(state.pool.map((p) => canonicalKey(p.config)));
  const proposed = await researchConfigs(computableKeys, DEADLINE.getTime(), state);
  const ranked = validateAll(validateConfig, proposed).filter(
    (x) => x.v.passed && !racing.has(canonicalKey(x.config)) && !pooled.has(canonicalKey(x.config))
  );
  for (const cand of ranked) {
    state.pool.push({
      config: cand.config,
      pedigree: { oosSharpe: cand.v.metrics.oosSharpe, oosICt: cand.v.metrics.oosICt, deflated: cand.v.metrics.deflatedSharpe },
      validatedAt: new Date().toISOString()
    });
  }
  // keep the strongest POOL_CAP, drop any that are now racing
  state.pool = state.pool.filter((p) => !racing.has(canonicalKey(p.config)));
  state.pool.sort((a, b) => b.pedigree.oosSharpe - a.pedigree.oosSharpe);
  if (state.pool.length > POOL_CAP) state.pool = state.pool.slice(0, POOL_CAP);
  state.lastResearch = Date.now();
  log({ phase: "research-round", added: ranked.length, poolSize: state.pool.length, bestBench: state.pool[0]?.pedigree.oosSharpe });
}

function evictionPriority(sleeve) {
  if (!sleeve.validated) return { priority: 0, reason: "candidate validation no longer passes" };
  if (sleeve.live?.verdict === "demote") return { priority: 1, reason: sleeve.live.note || "live performance breach" };
  if (sleeve.live?.verdict === "degrading") return { priority: 2, reason: sleeve.live.note || "live performance is degrading" };
  return { priority: 3, reason: "lowest NAV among healthy sleeves" };
}

function evictionTarget(state) {
  return [...(state.sleeves || [])]
    .map((sleeve) => ({ sleeve, ...evictionPriority(sleeve) }))
    .sort((a, b) => a.priority - b.priority || Number(a.sleeve.nav || 0) - Number(b.sleeve.nav || 0))[0] ?? null;
}

async function benchChallenger(state, validateConfig, racing) {
  state.pool = (state.pool || []).filter((p) => !racing.has(canonicalKey(p.config)));
  while (state.pool.length) {
    const best = state.pool.shift(); // strongest first; discard stale/non-passing entries
    try {
      const v = validateConfig(universeFile, {
        familyKey: best.config.familyKey,
        params: best.config.params,
        top: TOP,
        holding: best.config.holding
      });
      if (v.passed) {
        log({ phase: "eviction", msg: "promoting validated challenger from bench", bench: state.pool.length });
        return { config: best.config, v };
      }
      log({ phase: "eviction", msg: "discarded bench candidate whose validation no longer passes", config: configSummary(best.config) });
    } catch (e) {
      log({ phase: "eviction", msg: "discarded bench candidate after validation error", error: String(e).slice(0, 120) });
    }
  }
  return null;
}

async function onDemandChallenger(state, validateConfig, computableKeys, racing) {
  const proposed = await researchConfigs(computableKeys, DEADLINE.getTime(), state);
  const fallback = computableKeys.map((familyKey) => ({ familyKey, params: {} }));
  const pooled = new Set((state.pool || []).map((entry) => canonicalKey(entry.config)));
  const ranked = validateAll(validateConfig, [...proposed, ...fallback]).filter(
    (candidate) => candidate.v.passed && !racing.has(canonicalKey(candidate.config)) && !pooled.has(canonicalKey(candidate.config))
  );
  return ranked[0] || null;
}

async function evictionRound(state, validateConfig, computableKeys) {
  log({ phase: "eviction", msg: "ranking field", standings: standings(state) });
  // Revalidate survivors before their next paper rebalance. A newly failing
  // candidate keeps its existing, last-priced virtual book until it can be
  // safely replaced; it cannot become an Alpaca leader without --force.
  for (const s of state.sleeves) {
    try {
      const v = validateConfig(universeFile, { familyKey: s.familyKey, params: s.params, top: TOP, holding: s.holding });
      s.validated = v.passed;
      s.pedigree = { oosSharpe: v.metrics.oosSharpe, oosICt: v.metrics.oosICt, deflated: v.metrics.deflatedSharpe, wf: v.metrics.walkForwardPassRate };
      if (v.passed) {
        const rebalance = buyBook(s, v.targets);
        if (!rebalance.rebalanced && !rebalance.unchanged) log({ phase: "eviction", sleeve: s.id, msg: "kept prior book", reason: rebalance.reason });
      } else {
        log({ phase: "eviction", sleeve: s.id, msg: "candidate failed revalidation; prioritizing it for replacement" });
      }
    } catch (e) {
      s.validated = false;
      log({ phase: "eviction", sleeve: s.id, error: String(e).slice(0, 120) });
    }
  }
  markAll(state);
  const target = evictionTarget(state);
  if (!target) return;

  // Find a *passing* replacement before evicting. The old loop removed the
  // sleeve first, so a failed research/validation round shrank the tournament.
  const racing = new Set(state.sleeves.map((s) => canonicalKey({ familyKey: s.familyKey, params: s.params, holding: s.holding })));
  let challenger = await benchChallenger(state, validateConfig, racing);
  if (!challenger) challenger = await onDemandChallenger(state, validateConfig, computableKeys, racing);
  if (!challenger) {
    state.lastEviction = Date.now();
    log({ phase: "eviction", skipped: "no distinct candidate passed validation; retained current field", target: target.sleeve.name });
    return;
  }

  const worst = target.sleeve;
  const freed = worst.nav;
  state.evicted = state.evicted || [];
  state.evicted.push({
    id: worst.id,
    name: worst.name,
    config: { familyKey: worst.familyKey, params: worst.params, holding: worst.holding },
    ret: worst.ret,
    finalNav: Math.round(worst.nav),
    reason: target.reason,
    liveVerdict: worst.live?.verdict || "new",
    liveSharpe: worst.live?.sharpe ?? null,
    liveDays: worst.live?.days || 0,
    evictedAt: new Date().toISOString()
  });
  if (state.evicted.length > 200) state.evicted = state.evicted.slice(-200);
  state.sleeves = state.sleeves.filter((s) => s.id !== worst.id);
  state.seq = (state.seq || state.sleeves.length) + 1;
  const sleeve = makeSleeve(`H${state.seq}`, freed, challenger);
  state.sleeves.push(sleeve);
  log({
    phase: "eviction",
    evicted: worst.name,
    reason: target.reason,
    liveVerdict: worst.live?.verdict || "new",
    challenger: sleeve.name,
    oosSharpe: sleeve.pedigree.oosSharpe,
    validated: sleeve.validated,
    why: sleeve.why
  });
  state.lastEviction = Date.now();
}

function markAll(state) {
  for (const s of state.sleeves) {
    markSleeve(s);
    recordDailyMark(s);
  }
}

// Spawn the market-context fetcher (Alpaca news + Yahoo fundamentals/options IV) so
// the research mind always reads fresh real context. Resolves when done (or on a
// timeout) so it never hangs the race; failures are non-fatal (uses the last context).
function refreshContext(timeoutMs = 90_000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (note) => { if (done) return; done = true; log({ phase: "context", ...note }); resolve(); };
    let child;
    try {
      child = spawn(process.execPath, [path.join(ROOT, "scripts", "fetch-market-context.mjs"), `--universe=${UNIVERSE}`, "--max=30"], { cwd: ROOT, env: process.env, stdio: "ignore" });
    } catch (e) { return finish({ error: String(e).slice(0, 120) }); }
    const timer = setTimeout(() => { try { child.kill(); } catch { /* ignore */ } finish({ msg: "refresh timed out (using last context)" }); }, timeoutMs);
    child.on("exit", (code) => { clearTimeout(timer); finish({ msg: "context refreshed", code }); });
    child.on("error", (e) => { clearTimeout(timer); finish({ error: String(e).slice(0, 120) }); });
  });
}

async function main() {
  log({
    phase: "start",
    deadline: DEADLINE.toISOString(),
    sleeves: SLEEVES,
    total: TOTAL,
    intervalMin: INTERVAL_MS / 60000,
    evictHours: EVICT_MS / 3600000,
    universe: UNIVERSE,
    hasKeys: HAS_KEYS,
    forceDeploy: FORCE_DEPLOY,
    paperOnly: true
  });
  if (!fs.existsSync(universeFile)) { log({ phase: "fatal", error: `universe file missing: ${universeFile}` }); return; }
  if (!HAS_KEYS) log({ phase: "warn", msg: "no paper keys (APCA_API_KEY_ID/SECRET or QRL_ALPACA_KEY_FILE) — cannot fetch live prices or mirror the leader" });
  const { validateConfig, computableFamilies } = await loadValidator();
  const computableKeys = (computableFamilies ? computableFamilies() : []).map((f) => f.key);

  const state = { startedAt: new Date().toISOString(), deadline: DEADLINE.toISOString(), universe: UNIVERSE, total: TOTAL, sleeves: [], evicted: [], pool: [], seq: SLEEVES, lastResearch: Date.now() };
  await refreshPrices({ sleeves: computableKeys.map((k) => ({ positions: {}, targets: [] })) }); // warm cache with all-family targets later; first real fill below

  // pull fresh real context (news + fundamentals + options IV) BEFORE seeding so the
  // very first field is already informed by today's market. Best-effort, time-capped.
  log({ phase: "context", msg: "fetching real market context before seeding" });
  state.lastContext = Date.now();
  await refreshContext();

  // ---- seed the field: parallel research + validate, then take the best N.
  // The gate is strict on purpose; when nothing clears it we do NOT exit (the old
  // behavior) and we do NOT seed unvalidated sleeves — we keep researching on a
  // warmup cadence, feeding the gate's failure reasons back into the next prompt.
  log({ phase: "seed", msg: "researching the starting field in parallel" });
  const fallback = computableKeys.map((k) => ({ familyKey: k, params: {} }));
  const SEED_RETRY_MS = Math.min(RESEARCH_MS, 15 * 60 * 1000);
  let seeded = [];
  for (;;) {
    const proposed = await researchConfigs(computableKeys, DEADLINE.getTime(), state);
    const ranked = validateAll(validateConfig, [...proposed, ...fallback]);
    seeded = ranked.filter((candidate) => candidate.v.passed).slice(0, SLEEVES);
    if (seeded.length) break;
    state.seedFeedback = ranked.slice(0, 10).map((candidate) => {
      const params = candidate.config.params && Object.keys(candidate.config.params).length ? JSON.stringify(candidate.config.params) : "defaults";
      return `${candidate.config.familyKey} ${params}: ${(candidate.v.reasons || []).join("; ") || "below gate"}`;
    });
    if (Date.now() + SEED_RETRY_MS >= DEADLINE.getTime()) {
      log({ phase: "seed", skipped: "no candidate passed validation before the deadline; not creating an unvalidated field" });
      saveState(state);
      return;
    }
    log({
      phase: "seed",
      msg: "no candidate passed the gate; retrying with failure feedback",
      retryInMin: Math.round(SEED_RETRY_MS / 60000),
      topFailures: state.seedFeedback.slice(0, 4)
    });
    saveState(state);
    await sleep(SEED_RETRY_MS);
  }
  state.seedFeedback = [];
  // make sure we have prices for the books we are about to buy
  const seedSyms = new Set();
  seeded.forEach((x) => (x.v.targets || []).forEach((t) => seedSyms.add(t)));
  if (HAS_KEYS) {
    const keys = resolveKeys();
    if (keys && seedSyms.size) {
      try { Object.assign(priceCache, await getLatestPrices(keys.id, keys.secret, [...seedSyms])); } catch (e) { log({ phase: "prices", error: String(e).slice(0, 140) }); }
    }
  }
  const per = TOTAL / seeded.length;
  seeded.forEach((cand, i) => state.sleeves.push(makeSleeve(`H${i + 1}`, per, cand)));
  markAll(state);
  log({
    phase: "seed",
    msg: "validated field set",
    requestedSleeves: SLEEVES,
    seededSleeves: state.sleeves.length,
    sleeves: state.sleeves.map((s) => ({ name: s.name, oosSharpe: s.pedigree.oosSharpe, validated: s.validated, targets: s.targets.slice(0, 5) }))
  });
  saveState(state);

  let lastLeader = null;
  state.lastEviction = Date.now(); // first eviction after EVICT_MS
  while (Date.now() < DEADLINE.getTime()) {
    await refreshPrices(state);
    markAll(state);
    const board = standings(state);
    log({ phase: "standings", remainingHours: ((DEADLINE.getTime() - Date.now()) / 3600000).toFixed(1), board });

    const leader = [...state.sleeves].sort((a, b) => b.nav - a.nav)[0];
    if (leader && leader.name !== lastLeader) {
      const deployed = await deployLeader(leader);
      if (deployed || !HAS_KEYS) lastLeader = leader.name;
    }
    // keep the real market context fresh on its own cadence (non-blocking: the next
    // research round reads whatever the refresh has written)
    if (Date.now() - (state.lastContext || 0) >= CONTEXT_MS) {
      state.lastContext = Date.now();
      refreshContext().catch(() => {});
    }
    // keep researching the bench every RESEARCH_MS — works even when the market is
    // closed and the standings aren't moving
    if (Date.now() - (state.lastResearch || 0) >= RESEARCH_MS) {
      try { await researchRound(state, validateConfig, computableKeys); } catch (e) { log({ phase: "research-round", error: String(e).slice(0, 160) }); }
    }
    if (Date.now() - (state.lastEviction || 0) >= EVICT_MS) {
      try { await evictionRound(state, validateConfig, computableKeys); } catch (e) { log({ phase: "eviction", error: String(e).slice(0, 160) }); }
      const newLeader = [...state.sleeves].sort((a, b) => b.nav - a.nav)[0];
      if (newLeader) {
        const deployed = await deployLeader(newLeader);
        if (deployed || !HAS_KEYS) lastLeader = newLeader.name;
      }
    }
    saveState(state);
    const remaining = DEADLINE.getTime() - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(INTERVAL_MS, remaining));
  }
  markAll(state);
  log({ phase: "done", finalStandings: standings(state), evicted: state.evicted });
  saveState(state);
}

main();
