"""Universe definitions and the fetch/build pipeline.

Three universes, each chosen for a different, realistic way to earn a premium:

* ``macro`` — 24 liquid multi-asset ETFs (equities, bonds, credit, commodities,
  currencies, real estate). Home of time-series trend, cross-asset momentum and
  risk parity: the most robust systematic premia a retail account can actually
  implement (low turnover, deep liquidity, no shorting required).
* ``sectors`` — the nine original SPDR sector ETFs, for sector rotation.
* ``us`` — the S&P 500 with **point-in-time membership** (a stock is tradable
  only while it was an index member). This removes most of the look-ahead that
  comes from back-testing today's winners, though names that were delisted
  outright (no Yahoo history) are still missing — flagged, not hidden.
"""
from __future__ import annotations

import io
import json
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import httpx
import numpy as np
import pandas as pd

from .. import config
from .yahoo import UA, YahooError, fetch_daily

MACRO = {
    "SPY": "US Equity", "QQQ": "US Equity", "IWM": "US Equity",
    "EFA": "Intl Equity", "EEM": "Intl Equity", "EWJ": "Intl Equity", "VGK": "Intl Equity",
    "TLT": "Treasuries", "IEF": "Treasuries", "SHY": "Treasuries", "TIP": "Treasuries",
    "LQD": "Credit", "HYG": "Credit", "EMB": "Credit",
    "GLD": "Commodities", "SLV": "Commodities", "DBC": "Commodities", "USO": "Commodities",
    "DBA": "Commodities",
    "UUP": "Currencies", "FXE": "Currencies", "FXY": "Currencies",
    "VNQ": "Real Estate", "BIL": "Cash",
}
SECTORS = {
    "XLK": "Technology", "XLF": "Financials", "XLE": "Energy", "XLV": "Health Care",
    "XLI": "Industrials", "XLP": "Staples", "XLY": "Discretionary", "XLU": "Utilities",
    "XLB": "Materials",
}
REFS = ["SPY", "^IRX"]  # benchmark + 13-week T-bill yield (risk-free)

SP500_PIT_URL = "https://raw.githubusercontent.com/fja05680/sp500/master/sp500_ticker_start_end.csv"
SP500_SECTORS_URL = "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv"


@dataclass
class UniverseSpec:
    name: str
    title: str
    title_zh: str
    kind: str  # "cross_section" (stocks) | "multi_asset" (ETFs)
    start: str = "2005-01-01"
    groups: dict[str, str] = field(default_factory=dict)  # ticker -> sector / asset class
    benchmark: str = "SPY"


SPECS = {
    "macro": UniverseSpec("macro", "Multi-asset ETFs", "多资产 ETF", "multi_asset", groups=dict(MACRO)),
    "sectors": UniverseSpec("sectors", "US sector ETFs", "美股行业 ETF", "multi_asset", "2000-01-01",
                            groups=dict(SECTORS)),
    "us": UniverseSpec("us", "S&P 500 (point-in-time)", "标普 500（时点成分）", "cross_section"),
}


def data_path(name: str) -> Path:
    """Local fetch wins over the bundled copy so a refresh supersedes the snapshot."""
    local = config.DATA_DIR / f"{name}.parquet"
    if local.exists():
        return local
    bundled = config.BUNDLED_DATA / f"{name}.parquet"
    return bundled if bundled.exists() else local


def meta_path(name: str) -> Path:
    local = config.DATA_DIR / f"{name}.meta.json"
    if local.exists():
        return local
    bundled = config.BUNDLED_DATA / f"{name}.meta.json"
    return bundled if bundled.exists() else local


def available() -> dict[str, bool]:
    return {n: data_path(n).exists() for n in SPECS}


def sp500_membership(client: httpx.Client, since: str = "2005-01-01") -> pd.DataFrame:
    """Membership intervals (ticker, start, end) that overlap ``since``..today."""
    txt = client.get(SP500_PIT_URL).text
    df = pd.read_csv(io.StringIO(txt), dtype=str)
    df["start_date"] = pd.to_datetime(df["start_date"])
    df["end_date"] = pd.to_datetime(df["end_date"])
    df = df[(df["end_date"].isna()) | (df["end_date"] >= pd.Timestamp(since))]
    df["ticker"] = df["ticker"].str.replace(".", "-", regex=False)
    return df.rename(columns={"start_date": "start", "end_date": "end"})[["ticker", "start", "end"]]


def sp500_sectors(client: httpx.Client) -> dict[str, str]:
    try:
        df = pd.read_csv(io.StringIO(client.get(SP500_SECTORS_URL).text), dtype=str)
        return {s.replace(".", "-"): g for s, g in zip(df["Symbol"], df["GICS Sector"])}
    except Exception:  # sector labels are a nicety; neutralization falls back to "Unknown"
        return {}


def fetch_universe(name: str, progress=None, workers: int = 6) -> dict:
    """Download a universe and write ``<DATA_DIR>/<name>.parquet`` + meta.json."""
    config.ensure_dirs()
    spec = SPECS[name]
    client = httpx.Client(headers={"User-Agent": UA}, timeout=30,
                          limits=httpx.Limits(max_connections=workers * 2))
    membership = None
    groups = dict(spec.groups)
    if name == "us":
        membership = sp500_membership(client, spec.start)
        tickers = sorted(membership["ticker"].unique())
        sectors = sp500_sectors(client)
        groups = {t: sectors.get(t, "Unknown") for t in tickers}
    else:
        tickers = list(spec.groups)

    frames, failed = [], []
    done = 0

    def one(t):
        try:
            df = fetch_daily(t, start=spec.start, client=client)
            df["ticker"] = t
            return t, df, None
        except (YahooError, httpx.HTTPError, ValueError, KeyError) as e:
            return t, None, str(e)

    with ThreadPoolExecutor(workers) as ex:
        for t, df, err in ex.map(one, tickers):
            done += 1
            if df is not None and len(df) > 60:
                frames.append(df.reset_index())
            else:
                failed.append({"ticker": t, "error": err or "too short"})
            if progress:
                progress(done, len(tickers), t)

    long = pd.concat(frames, ignore_index=True)
    long["date"] = pd.to_datetime(long["date"])
    long.to_parquet(config.DATA_DIR / f"{name}.parquet", index=False, compression="zstd")

    meta = {
        "name": name,
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "Yahoo Finance chart API (adjusted OHLCV); personal research use only",
        "groups": {t: groups.get(t, "Unknown") for t in long["ticker"].unique()},
        "failed": failed,
        "benchmark": spec.benchmark,
    }
    if membership is not None:
        have = set(long["ticker"].unique())
        m = membership[membership["ticker"].isin(have)].copy()
        meta["membership"] = [
            [r.ticker, r.start.strftime("%Y-%m-%d"), None if pd.isna(r.end) else r.end.strftime("%Y-%m-%d")]
            for r in m.itertuples()
        ]
        meta["survivorship_note"] = (
            f"{len(failed)} historical members have no Yahoo history (mostly delisted/acquired); "
            "they are absent from the backtest, which biases results slightly upward."
        )
    (config.DATA_DIR / f"{name}.meta.json").write_text(json.dumps(meta))
    fetch_refs(client)
    client.close()
    return {"tickers": int(long["ticker"].nunique()), "rows": len(long), "failed": len(failed)}


def fetch_refs(client: httpx.Client | None = None) -> None:
    """Benchmark (SPY) and risk-free (^IRX) series shared by every universe."""
    config.ensure_dirs()
    own = client is None
    client = client or httpx.Client(headers={"User-Agent": UA}, timeout=30)
    frames = []
    for t in REFS:
        for attempt in range(3):
            try:
                df = fetch_daily(t, start="1999-01-01", client=client)
                break
            except YahooError:
                time.sleep(3)
        else:
            continue
        df["ticker"] = t
        frames.append(df.reset_index())
    if own:
        client.close()
    if frames:
        pd.concat(frames, ignore_index=True).to_parquet(config.DATA_DIR / "refs.parquet", index=False)


def refresh_universe(name: str, progress=None, workers: int = 6, overlap_days: int = 10) -> dict:
    """Append the latest bars to an existing universe (incremental, idempotent)."""
    path = config.DATA_DIR / f"{name}.parquet"
    if not path.exists():
        return fetch_universe(name, progress=progress, workers=workers)
    long = pd.read_parquet(path)
    long["date"] = pd.to_datetime(long["date"])
    last = long["date"].max()
    start = (last - pd.Timedelta(days=overlap_days)).strftime("%Y-%m-%d")
    tickers = sorted(long["ticker"].unique())
    client = httpx.Client(headers={"User-Agent": UA}, timeout=30, limits=httpx.Limits(max_connections=workers * 2))

    def one(t):
        try:
            df = fetch_daily(t, start=start, client=client)
            df["ticker"] = t
            return df.reset_index()
        except (YahooError, httpx.HTTPError, ValueError, KeyError):
            return None

    frames, done = [], 0
    with ThreadPoolExecutor(workers) as ex:
        for df in ex.map(one, tickers):
            done += 1
            if df is not None and len(df):
                frames.append(df)
            if progress:
                progress(done, len(tickers), "")
    if frames:
        new = pd.concat(frames, ignore_index=True)
        new["date"] = pd.to_datetime(new["date"])
        # Adjusted prices are rescaled by Yahoo after every dividend: rescale the
        # stored history of each ticker so it joins the fresh series seamlessly.
        merged = []
        for t, g in long.groupby("ticker"):
            n = new[new.ticker == t]
            if len(n):
                ov = g.merge(n[["date", "close"]], on="date", suffixes=("", "_new"))
                if len(ov):
                    f = float((ov["close_new"] / ov["close"]).median())
                    if np.isfinite(f) and f > 0 and abs(f - 1) > 1e-9:
                        g = g.copy()
                        for c in ("open", "high", "low", "close"):
                            g[c] = g[c] * f
                g = pd.concat([g[g.date < n.date.min()], n], ignore_index=True)
            merged.append(g)
        long = pd.concat(merged, ignore_index=True)
        long.to_parquet(path, index=False, compression="zstd")
    fetch_refs(client)
    client.close()
    return {"rows": len(long), "last": long["date"].max().strftime("%Y-%m-%d")}
