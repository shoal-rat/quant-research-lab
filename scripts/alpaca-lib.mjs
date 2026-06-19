// Reusable Alpaca PAPER-trading helpers (shared by the CLI connector and the
// dialogue bridge's /paper/* endpoints). PAPER ENDPOINT ONLY — there is no live
// api.alpaca.markets path anywhere. Keys are passed in per call and never stored.
import fs from "node:fs";

export const PAPER_BASE = "https://paper-api.alpaca.markets";

// Parse paper keys from a local file (JSON / KEY=VALUE / unambiguous bare tokens).
export function loadKeysFromFile(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf-8").trim();
  } catch {
    return null;
  }
  try {
    const j = JSON.parse(raw);
    const id = j.APCA_API_KEY_ID || j.key_id || j.keyId || j.apiKey || j.key || j.api_key;
    const secret = j.APCA_API_SECRET_KEY || j.secret_key || j.secretKey || j.apiSecret || j.secret || j.api_secret;
    if (id && secret) return { id, secret };
  } catch {
    /* not json */
  }
  const map = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_ -]+?)\s*[:=]\s*(.+?)\s*$/);
    if (m) map[m[1].trim().toUpperCase().replace(/[ -]/g, "_")] = m[2].trim();
  }
  let id = map.APCA_API_KEY_ID || map.API_KEY_ID || map.KEY_ID || map.API_KEY || map.ALPACA_API_KEY || map.KEY;
  let secret = map.APCA_API_SECRET_KEY || map.API_SECRET_KEY || map.SECRET_KEY || map.API_SECRET || map.ALPACA_SECRET_KEY || map.SECRET;
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

function headers(key, secret) {
  return { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret, "Content-Type": "application/json" };
}

async function api(key, secret, route, init = {}) {
  const res = await fetch(`${PAPER_BASE}${route}`, { ...init, headers: headers(key, secret) });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${route}: HTTP ${res.status} ${body.message ?? text}`);
  return body;
}

export const getAccount = (k, s) => api(k, s, "/v2/account");
export const getPositions = (k, s) => api(k, s, "/v2/positions");
export const getOpenOrders = (k, s) => api(k, s, "/v2/orders?status=open&limit=100");
export const getClock = (k, s) => api(k, s, "/v2/clock");
export const getPortfolioHistory = (k, s, period = "1M", timeframe = "1D") =>
  api(k, s, `/v2/account/portfolio/history?period=${period}&timeframe=${timeframe}&extended_hours=false`);
export const cancelAllOrders = (k, s) => api(k, s, "/v2/orders", { method: "DELETE" });
export const closePosition = (k, s, symbol) => api(k, s, `/v2/positions/${symbol}`, { method: "DELETE" });
export const submitNotional = (k, s, symbol, notional, side = "buy") =>
  api(k, s, "/v2/orders", {
    method: "POST",
    body: JSON.stringify({ symbol, notional, side, type: "market", time_in_force: "day" })
  });

// Trailing-window returns from a portfolio-history equity series (Alpaca daily).
export function windowReturns(history) {
  const eq = (history?.equity ?? []).filter((v) => typeof v === "number" && v > 0);
  const pick = (n) => {
    if (eq.length < 2) return null;
    const a = eq[Math.max(0, eq.length - 1 - n)];
    const b = eq[eq.length - 1];
    return a > 0 ? b / a - 1 : null;
  };
  return {
    d1: pick(1),
    d5: pick(5),
    d10: pick(10),
    all: eq.length >= 2 ? eq[eq.length - 1] / eq[0] - 1 : null,
    points: eq.length,
    last: eq.length ? eq[eq.length - 1] : null
  };
}
