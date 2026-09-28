"""Keyless Yahoo Finance chart-API client (daily bars).

Returns total-return-adjusted OHLC: Yahoo's quote OHLC are split-adjusted but not
dividend-adjusted, while ``adjclose`` adjusts for both. We scale open/high/low by
``adjclose / close`` so every price field lives on the same total-return basis, and
keep the raw close separately (price filters such as "no stocks under $5" must use
the price that actually traded, not a dividend-deflated one).
"""
from __future__ import annotations

import time
from datetime import date, datetime, timezone

import httpx
import numpy as np
import pandas as pd

# Yahoo 429s generic library user agents; this one is accepted.
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) quant-research-lab/4.0 (educational research)"
BASE = "https://query1.finance.yahoo.com/v8/finance/chart/"


class YahooError(RuntimeError):
    pass


def _epoch(d: str | date) -> int:
    if isinstance(d, str):
        d = datetime.strptime(d, "%Y-%m-%d").date()
    return int(datetime(d.year, d.month, d.day, tzinfo=timezone.utc).timestamp())


def fetch_daily(symbol: str, start: str = "2005-01-01", end: str | None = None,
                client: httpx.Client | None = None, retries: int = 4) -> pd.DataFrame:
    """Daily bars for one symbol. Columns: open high low close volume raw_close."""
    params = {
        "period1": _epoch(start),
        "period2": _epoch(end) if end else int(time.time()) + 86400,
        "interval": "1d",
        "events": "div,split",
        "includeAdjustedClose": "true",
    }
    own = client is None
    client = client or httpx.Client(headers={"User-Agent": UA}, timeout=30)
    try:
        delay = 2.0
        for attempt in range(retries):
            r = client.get(BASE + symbol, params=params)
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(delay)
                delay *= 2
                continue
            if r.status_code == 404:
                raise YahooError(f"{symbol}: not found")
            r.raise_for_status()
            res = (r.json().get("chart") or {}).get("result")
            if not res:
                raise YahooError(f"{symbol}: empty result")
            return _parse(res[0])
        raise YahooError(f"{symbol}: rate limited after {retries} attempts")
    finally:
        if own:
            client.close()


def _parse(res: dict) -> pd.DataFrame:
    ts = res.get("timestamp")
    if not ts:
        raise YahooError("no timestamps")
    q = (res.get("indicators", {}).get("quote") or [{}])[0]
    adj = ((res.get("indicators", {}).get("adjclose") or [{}])[0]).get("adjclose")
    tz = res.get("meta", {}).get("exchangeTimezoneName") or "America/New_York"
    idx = pd.to_datetime(np.asarray(ts, dtype="int64"), unit="s", utc=True).tz_convert(tz)
    idx = pd.DatetimeIndex(idx.date, name="date")

    def col(name):
        v = q.get(name)
        return np.asarray([np.nan if x is None else x for x in v], dtype=float) if v else np.full(len(ts), np.nan)

    close = col("close")
    adjc = np.asarray([np.nan if x is None else x for x in adj], dtype=float) if adj else close
    factor = np.where((close > 0) & np.isfinite(adjc), adjc / close, np.nan)
    df = pd.DataFrame({
        "open": col("open") * factor,
        "high": col("high") * factor,
        "low": col("low") * factor,
        "close": adjc,
        "volume": col("volume"),
        "raw_close": close,
    }, index=idx)
    df = df[~df.index.duplicated(keep="last")]
    df = df[np.isfinite(df["close"]) & (df["close"] > 0)]
    # Yahoo occasionally ships a zero/NaN open or a high below the close; repair to
    # keep the bar internally consistent instead of discarding the day.
    for c in ("open", "high", "low"):
        bad = ~np.isfinite(df[c]) | (df[c] <= 0)
        df.loc[bad, c] = df.loc[bad, "close"]
    df["high"] = df[["high", "open", "close"]].max(axis=1)
    df["low"] = df[["low", "open", "close"]].min(axis=1)
    return df.sort_index()
