"""Paper trading: the club fund run forward on real prices.

Internal broker (default, no account needed): after each data refresh the fund's
target weights become market-on-open orders that fill at the NEXT session's
open (plus a half-spread), and the book is marked at the latest close. It is the
same timeline the backtester assumes, so live and simulated results are
comparable.

Alpaca (optional): with paper keys in the environment (APCA_API_KEY_ID /
APCA_API_SECRET_KEY) or in the file named by QRL_ALPACA_KEY_FILE, orders go to
Alpaca's *paper* endpoint instead. There is no live-money code path.
"""
from __future__ import annotations

import os
import re
import time
from pathlib import Path

import httpx
import numpy as np
import pandas as pd

from ..data.panel import load_panel
from ..data.universe import available
from ..research.registry import Registry

PAPER_URL = "https://paper-api.alpaca.markets"
KEY = "paper_book"


def _price_frames():
    closes, opens = [], []
    for u, ok in available().items():
        if not ok:
            continue
        p = load_panel(u)
        closes.append(p.raw_close)
        opens.append(p.open * (p.raw_close / p.close))  # back to traded (unadjusted) prices
    close = pd.concat(closes, axis=1)
    opn = pd.concat(opens, axis=1)
    close = close.loc[:, ~close.columns.duplicated()]
    opn = opn.loc[:, ~opn.columns.duplicated()]
    return close.sort_index(), opn.sort_index()


def new_book(capital: float = 100_000.0) -> dict:
    return {"initial": capital, "cash": capital, "positions": {}, "pending": [], "last_date": None,
            "last_rebalance": None, "history": [], "fills": [], "created": time.time()}


def book(reg: Registry) -> dict:
    return reg.kv_get(KEY) or new_book()


def reset(reg: Registry, capital: float = 100_000.0) -> dict:
    b = new_book(capital)
    reg.kv_set(KEY, b)
    return b


def cycle(reg: Registry, targets: dict[str, float], rebalance_every: int = 5, cost_bps: float = 2.0) -> dict:
    """Advance the paper book to the latest data date."""
    b = book(reg)
    close, opn = _price_frames()
    dates = close.index
    last = pd.Timestamp(b["last_date"]) if b["last_date"] else None
    new_dates = dates[dates > last] if last is not None else dates[-1:]
    if len(new_dates) == 0:
        return b
    fill_day = new_dates[0]
    # 1) pending market-on-open orders fill at the first new session's open
    if b["pending"] and last is not None:
        for o in b["pending"]:
            px = opn.at[fill_day, o["ticker"]] if o["ticker"] in opn.columns else np.nan
            if not np.isfinite(px) or px <= 0:
                continue
            sh = float(o["shares"])
            notional = sh * px
            fee = abs(notional) * cost_bps / 1e4
            b["cash"] -= notional + fee
            b["positions"][o["ticker"]] = b["positions"].get(o["ticker"], 0.0) + sh
            b["fills"].append({"date": fill_day.strftime("%Y-%m-%d"), "ticker": o["ticker"], "shares": sh,
                               "price": float(px), "fee": fee})
        b["fills"] = b["fills"][-300:]
        b["pending"] = []
    # 2) mark to the latest close
    today = new_dates[-1]
    px = close.loc[:today].ffill().iloc[-1]
    pos_val = sum(sh * float(px.get(t, np.nan)) for t, sh in b["positions"].items() if np.isfinite(px.get(t, np.nan)))
    nav = b["cash"] + pos_val
    for d in new_dates:
        pxd = close.loc[:d].ffill().iloc[-1]
        v = b["cash"] + sum(sh * float(pxd.get(t, 0.0) or 0.0) for t, sh in b["positions"].items())
        b["history"].append([d.strftime("%Y-%m-%d"), float(v)])
    b["history"] = b["history"][-2000:]
    b["last_date"] = today.strftime("%Y-%m-%d")
    # 3) rebalance: queue orders for the next open
    due = b["last_rebalance"] is None or len(dates[(dates > pd.Timestamp(b["last_rebalance"])) & (dates <= today)]) >= rebalance_every
    if due and targets:
        orders = []
        want = {t: w * nav / float(px[t]) for t, w in targets.items() if t in px.index and np.isfinite(px[t]) and px[t] > 0}
        for t in set(want) | set(b["positions"]):
            d = want.get(t, 0.0) - b["positions"].get(t, 0.0)
            if abs(d * float(px.get(t, 0) or 0)) >= 25:  # skip dust trades
                orders.append({"ticker": t, "shares": round(d, 4)})
        b["pending"] = orders
        b["last_rebalance"] = today.strftime("%Y-%m-%d")
    b["nav"] = float(nav)
    reg.kv_set(KEY, b)
    return b


def summary(b: dict) -> dict:
    h = b.get("history") or []
    nav = b.get("nav", b.get("initial", 0))
    out = {"nav": nav, "initial": b.get("initial"), "cash": b.get("cash"), "positions": len(b.get("positions", {})),
           "pending": len(b.get("pending", [])), "last_date": b.get("last_date"), "history": h[-400:],
           "fills": b.get("fills", [])[-30:], "return": (nav / b["initial"] - 1) if b.get("initial") else 0.0}
    if len(h) > 5:
        s = pd.Series([v for _, v in h]).pct_change().dropna()
        out["sharpe"] = float(s.mean() / s.std() * np.sqrt(252)) if s.std() > 0 else 0.0
    return out


# ------------------------------------------------------------------- Alpaca
def alpaca_keys() -> tuple[str, str] | None:
    k, s = os.environ.get("APCA_API_KEY_ID"), os.environ.get("APCA_API_SECRET_KEY")
    if k and s:
        return k, s
    f = os.environ.get("QRL_ALPACA_KEY_FILE")
    if f and Path(f).exists():
        txt = Path(f).read_text()
        kv = dict(re.findall(r"(\w+)\s*[=:]\s*[\"']?([A-Za-z0-9/+]+)", txt))
        k = kv.get("APCA_API_KEY_ID") or kv.get("key") or kv.get("KEY")
        s = kv.get("APCA_API_SECRET_KEY") or kv.get("secret") or kv.get("SECRET")
        if not (k and s):
            toks = re.findall(r"[A-Za-z0-9/+]{16,}", txt)
            if len(toks) >= 2:
                k, s = toks[0], toks[1]
        if k and s:
            return k, s
    return None


class Alpaca:
    """Minimal client for Alpaca's paper endpoint (never the live one)."""

    def __init__(self, keys: tuple[str, str]):
        self.h = {"APCA-API-KEY-ID": keys[0], "APCA-API-SECRET-KEY": keys[1]}

    def _get(self, path):
        r = httpx.get(PAPER_URL + path, headers=self.h, timeout=20)
        r.raise_for_status()
        return r.json()

    def account(self):
        return self._get("/v2/account")

    def positions(self):
        return self._get("/v2/positions")

    def rebalance(self, targets: dict[str, float]) -> list[dict]:
        acct = self.account()
        equity = float(acct["equity"])
        cur = {p["symbol"].replace(".", "-"): float(p["market_value"]) for p in self.positions()}
        out = []
        for t in set(targets) | set(cur):
            delta = targets.get(t, 0.0) * equity - cur.get(t, 0.0)
            if abs(delta) < 25:
                continue
            body = {"symbol": t.replace("-", "."), "notional": round(abs(delta), 2),
                    "side": "buy" if delta > 0 else "sell", "type": "market", "time_in_force": "day"}
            r = httpx.post(PAPER_URL + "/v2/orders", headers=self.h, json=body, timeout=20)
            out.append({"symbol": t, "delta": delta, "status": r.status_code, "resp": r.json() if r.content else None})
        return out
