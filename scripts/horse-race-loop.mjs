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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadValidator } from "./_engine-bridge.mjs";
import { researchJson } from "./claude-cli.mjs";
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
const POOL_CAP = Number(args.poolCap) || 30;
const COST_BPS = Number(args.cost) || 5;
const TOP = Number(args.top) || 8;
const UNIVERSE = args.universe === "bundled" ? "bundled" : "large";
const KEY_FILE = process.env.QRL_ALPACA_KEY_FILE || args.keyFile || null;
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
const cfgKey = (c) => `${c.familyKey}|${JSON.stringify(c.params || {})}|${c.holding || ""}`;

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

async function researchConfigs(computableKeys, deadlineMs) {
  const ctx = marketContextSummary();
  const prompt = `You are the research mind for a paper-trading STRATEGY TOURNAMENT on US equities. You may web-search the
current regime. Propose 3 DISTINCT candidate strategies drawn from these computable factor families:
${computableKeys.join(", ")}. Vary the family and the parameters; favour what should work in the current regime.
Notes: price/volume families always work; "fundamental_value" works only if a fundamentals feed (FMP) has been
loaded, otherwise it is skipped automatically — feel free to propose it, it self-filters if data is absent.${ctx}
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
    const k = cfgKey(c);
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

function buyBook(sleeve, targets) {
  // liquidate to cash
  for (const [sym, sh] of Object.entries(sleeve.positions)) {
    const p = priceCache[sym];
    if (p) {
      sleeve.cash += sh * p;
      sleeve.cash -= Math.abs(sh * p) * (COST_BPS / 10000);
    }
  }
  sleeve.positions = {};
  const valid = (targets || []).filter((t) => priceCache[t] > 0);
  sleeve.targets = targets || [];
  if (!valid.length) return; // stay in cash (risk-off or no prices)
  const per = sleeve.cash / valid.length;
  for (const sym of valid) {
    const p = priceCache[sym];
    const sh = per / p; // fractional virtual shares
    sleeve.positions[sym] = sh;
    sleeve.cash -= sh * p;
    sleeve.cash -= sh * p * (COST_BPS / 10000);
  }
}

function markSleeve(s) {
  let posVal = 0;
  for (const [sym, sh] of Object.entries(s.positions)) {
    const p = priceCache[sym];
    if (p) posVal += sh * p;
  }
  s.nav = round(s.cash + posVal);
  s.navPeak = Math.max(s.navPeak, s.nav);
  s.ret = round((s.nav / s.navStart - 1) * 100, 2);
  s.drawdown = round((s.nav / s.navPeak - 1) * 100, 2);
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
  if (!HAS_KEYS || !leader || !leader.validated || !leader.targets?.length) return;
  const keys = resolveKeys();
  if (!keys) return;
  try {
    const account = await getAccount(keys.id, keys.secret);
    const stale = await getOpenOrders(keys.id, keys.secret);
    if (stale.length) await cancelAllOrders(keys.id, keys.secret);
    const positions = await getPositions(keys.id, keys.secret);
    const alpacaTargets = leader.targets.map(toAlpacaSymbol);
    const set = new Set(alpacaTargets);
    for (const p of positions) if (!set.has(p.symbol)) await closePosition(keys.id, keys.secret, p.symbol).catch(() => {});
    const notional = Math.floor(Number(account.equity) / alpacaTargets.length);
    const filled = [];
    for (const sym of alpacaTargets) {
      try {
        await submitNotional(keys.id, keys.secret, sym, notional, "buy");
        filled.push(sym);
      } catch (e) {
        log({ phase: "deploy-leader", skip: sym, error: String(e).slice(0, 100) });
      }
    }
    log({ phase: "deploy-leader", leader: leader.name, targets: filled, notional });
  } catch (e) {
    log({ phase: "deploy-leader", error: String(e).slice(0, 140) });
  }
}

function standings(state) {
  return [...state.sleeves]
    .sort((a, b) => b.nav - a.nav)
    .map((s, i) => ({ rank: i + 1, name: s.name, ret: s.ret, nav: Math.round(s.nav), validated: s.validated, oosSharpe: s.pedigree.oosSharpe }));
}

// Research + validate NEW ideas and add the passers to the bench pool. Runs on its
// own cadence regardless of market hours, so a deep bench of vetted challengers is
// always ready. Dedupes against what is racing and what is already pooled.
async function researchRound(state, validateConfig, computableKeys) {
  state.pool = state.pool || [];
  const racing = new Set(state.sleeves.map((s) => cfgKey({ familyKey: s.familyKey, params: s.params, holding: s.holding })));
  const pooled = new Set(state.pool.map((p) => cfgKey(p.config)));
  const proposed = await researchConfigs(computableKeys, DEADLINE.getTime());
  const ranked = validateAll(validateConfig, proposed).filter(
    (x) => x.v.passed && !racing.has(cfgKey(x.config)) && !pooled.has(cfgKey(x.config))
  );
  for (const cand of ranked) {
    state.pool.push({
      config: cand.config,
      pedigree: { oosSharpe: cand.v.metrics.oosSharpe, oosICt: cand.v.metrics.oosICt, deflated: cand.v.metrics.deflatedSharpe },
      validatedAt: new Date().toISOString()
    });
  }
  // keep the strongest POOL_CAP, drop any that are now racing
  state.pool = state.pool.filter((p) => !racing.has(cfgKey(p.config)));
  state.pool.sort((a, b) => b.pedigree.oosSharpe - a.pedigree.oosSharpe);
  if (state.pool.length > POOL_CAP) state.pool = state.pool.slice(0, POOL_CAP);
  state.lastResearch = Date.now();
  log({ phase: "research-round", added: ranked.length, poolSize: state.pool.length, bestBench: state.pool[0]?.pedigree.oosSharpe });
}

async function evictionRound(state, validateConfig, computableKeys) {
  log({ phase: "eviction", msg: "ranking field", standings: standings(state) });
  // survivors refresh their books to current targets (re-validate)
  for (const s of state.sleeves) {
    try {
      const v = validateConfig(universeFile, { familyKey: s.familyKey, params: s.params, top: TOP, holding: s.holding });
      s.validated = v.passed;
      s.pedigree = { oosSharpe: v.metrics.oosSharpe, oosICt: v.metrics.oosICt, deflated: v.metrics.deflatedSharpe, wf: v.metrics.walkForwardPassRate };
      buyBook(s, v.targets);
    } catch (e) {
      log({ phase: "eviction", sleeve: s.id, error: String(e).slice(0, 120) });
    }
  }
  markAll(state);
  // evict the worst horse
  const worst = [...state.sleeves].sort((a, b) => a.nav - b.nav)[0];
  if (!worst) return;
  const freed = worst.nav;
  state.evicted = state.evicted || [];
  state.evicted.push({ id: worst.id, name: worst.name, ret: worst.ret, finalNav: Math.round(worst.nav), evictedAt: new Date().toISOString() });
  state.sleeves = state.sleeves.filter((s) => s.id !== worst.id);
  log({ phase: "eviction", evicted: worst.name, ret: worst.ret });

  // Promote the BEST challenger from the bench pool (filled continuously by
  // researchRound, even when the market is closed). Fall back to on-demand research
  // only if the bench is empty.
  const racing = new Set(state.sleeves.map((s) => cfgKey({ familyKey: s.familyKey, params: s.params, holding: s.holding })));
  state.pool = (state.pool || []).filter((p) => !racing.has(cfgKey(p.config)));
  let challenger = null;
  if (state.pool.length) {
    const best = state.pool.shift(); // pool is kept sorted best-first
    try {
      const v = validateConfig(universeFile, { familyKey: best.config.familyKey, params: best.config.params, top: TOP, holding: best.config.holding });
      challenger = { config: best.config, v };
      log({ phase: "eviction", msg: "promoting from bench", bench: state.pool.length });
    } catch (e) {
      log({ phase: "eviction", error: String(e).slice(0, 120) });
    }
  }
  if (!challenger) {
    const proposed = await researchConfigs(computableKeys, DEADLINE.getTime());
    const fallback = computableKeys.map((k) => ({ familyKey: k, params: {} }));
    const ranked = validateAll(validateConfig, [...proposed, ...fallback]).filter((x) => !racing.has(cfgKey(x.config)));
    challenger = ranked[0];
  }
  if (challenger) {
    state.seq = (state.seq || state.sleeves.length) + 1;
    const sleeve = makeSleeve(`H${state.seq}`, freed, challenger);
    state.sleeves.push(sleeve);
    log({ phase: "eviction", challenger: sleeve.name, oosSharpe: sleeve.pedigree.oosSharpe, validated: sleeve.validated, why: sleeve.why });
  }
  state.lastEviction = Date.now();
}

function markAll(state) {
  for (const s of state.sleeves) markSleeve(s);
}

async function main() {
  log({ phase: "start", deadline: DEADLINE.toISOString(), sleeves: SLEEVES, total: TOTAL, intervalMin: INTERVAL_MS / 60000, evictHours: EVICT_MS / 3600000, universe: UNIVERSE, hasKeys: Boolean(KEY_FILE) });
  if (!fs.existsSync(universeFile)) { log({ phase: "fatal", error: `universe file missing: ${universeFile}` }); return; }
  if (!HAS_KEYS) log({ phase: "warn", msg: "no paper keys (APCA_API_KEY_ID/SECRET or QRL_ALPACA_KEY_FILE) — cannot fetch live prices or mirror the leader" });
  const { validateConfig, computableFamilies } = await loadValidator();
  const computableKeys = (computableFamilies ? computableFamilies() : []).map((f) => f.key);

  const state = { startedAt: new Date().toISOString(), deadline: DEADLINE.toISOString(), universe: UNIVERSE, total: TOTAL, sleeves: [], evicted: [], pool: [], seq: SLEEVES, lastResearch: Date.now() };
  await refreshPrices({ sleeves: computableKeys.map((k) => ({ positions: {}, targets: [] })) }); // warm cache with all-family targets later; first real fill below

  // ---- seed the field: parallel research + validate, then take the best N ----
  log({ phase: "seed", msg: "researching the starting field in parallel" });
  const proposed = await researchConfigs(computableKeys, DEADLINE.getTime());
  const fallback = computableKeys.map((k) => ({ familyKey: k, params: {} }));
  const ranked = validateAll(validateConfig, [...proposed, ...fallback]);
  // make sure we have prices for the books we are about to buy
  const seedSyms = new Set();
  ranked.slice(0, SLEEVES * 2).forEach((x) => (x.v.targets || []).forEach((t) => seedSyms.add(t)));
  if (HAS_KEYS) {
    const keys = resolveKeys();
    if (keys && seedSyms.size) {
      try { Object.assign(priceCache, await getLatestPrices(keys.id, keys.secret, [...seedSyms])); } catch (e) { log({ phase: "prices", error: String(e).slice(0, 140) }); }
    }
  }
  const per = TOTAL / SLEEVES;
  ranked.slice(0, SLEEVES).forEach((cand, i) => state.sleeves.push(makeSleeve(`H${i + 1}`, per, cand)));
  markAll(state);
  log({ phase: "seed", msg: "field set", sleeves: state.sleeves.map((s) => ({ name: s.name, oosSharpe: s.pedigree.oosSharpe, validated: s.validated, targets: s.targets.slice(0, 5) })) });
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
      await deployLeader(leader);
      lastLeader = leader.name;
    }
    // keep researching the bench every RESEARCH_MS — works even when the market is
    // closed and the standings aren't moving
    if (Date.now() - (state.lastResearch || 0) >= RESEARCH_MS) {
      try { await researchRound(state, validateConfig, computableKeys); } catch (e) { log({ phase: "research-round", error: String(e).slice(0, 160) }); }
    }
    if (Date.now() - (state.lastEviction || 0) >= EVICT_MS) {
      try { await evictionRound(state, validateConfig, computableKeys); } catch (e) { log({ phase: "eviction", error: String(e).slice(0, 160) }); }
      const newLeader = [...state.sleeves].sort((a, b) => b.nav - a.nav)[0];
      if (newLeader) { await deployLeader(newLeader); lastLeader = newLeader.name; }
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
