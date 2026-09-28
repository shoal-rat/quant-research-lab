"""The Panel: aligned T x N market data the whole engine computes on.

Conventions (every module relies on these):

* rows are trading dates (union calendar of the universe), columns are tickers;
* prices are total-return adjusted; ``raw_close`` is the traded price;
* a value on row ``t`` is known at the close of day ``t`` — never later;
* ``tradable`` marks where a position may be *opened or held* on day ``t``:
  listed, a member of the index at ``t`` (point-in-time), a real trade printed
  that day, raw price >= $5 for single stocks, and enough history for the
  slowest standard feature (63 bars).
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import cached_property

import numpy as np
import pandas as pd

from .. import config
from .universe import SPECS, data_path, meta_path

FIELDS = ("open", "high", "low", "close", "volume", "raw_close")


@dataclass
class Panel:
    name: str
    kind: str
    open: pd.DataFrame
    high: pd.DataFrame
    low: pd.DataFrame
    close: pd.DataFrame
    volume: pd.DataFrame
    raw_close: pd.DataFrame
    member: pd.DataFrame  # bool, point-in-time universe membership
    groups: pd.Series  # ticker -> sector / asset class
    bench_close: pd.Series  # SPY adjusted close on the panel calendar
    rf_daily: pd.Series  # daily risk-free simple return
    meta: dict = field(default_factory=dict)

    # ------------------------------------------------------------------ shape
    @property
    def dates(self) -> pd.DatetimeIndex:
        return self.close.index

    @property
    def tickers(self) -> pd.Index:
        return self.close.columns

    @property
    def T(self) -> int:
        return len(self.dates)

    @property
    def N(self) -> int:
        return len(self.tickers)

    # ------------------------------------------------------------- derived
    @cached_property
    def returns(self) -> pd.DataFrame:
        """Close-to-close total return earned over (t-1, t]."""
        return self.close.pct_change(fill_method=None)

    @cached_property
    def overnight(self) -> pd.DataFrame:
        """Close(t-1) -> open(t) return."""
        return self.open / self.close.shift(1) - 1.0

    @cached_property
    def intraday(self) -> pd.DataFrame:
        """Open(t) -> close(t) return."""
        return self.close / self.open - 1.0

    @cached_property
    def dollar_volume(self) -> pd.DataFrame:
        return (self.raw_close * self.volume).where(self.volume > 0)

    @cached_property
    def adv(self) -> pd.DataFrame:
        """63-day median dollar volume (robust to single spikes)."""
        return self.dollar_volume.rolling(63, min_periods=20).median()

    @cached_property
    def bench_returns(self) -> pd.Series:
        return self.bench_close.pct_change(fill_method=None).fillna(0.0)

    @cached_property
    def traded(self) -> pd.DataFrame:
        """A real print happened on day t (not a forward-filled stale bar)."""
        has = self.close.notna()
        if self.kind == "cross_section":
            has &= self.volume.fillna(0) > 0
        return has

    @cached_property
    def tradable(self) -> pd.DataFrame:
        ok = self.member & self.traded
        age = self.close.notna().cumsum()
        ok &= age >= 63
        if self.kind == "cross_section":
            ok &= self.raw_close >= 5.0
            ok &= self.adv >= 5e6
        return ok

    def group_codes(self) -> np.ndarray:
        cats = pd.Categorical(self.groups.reindex(self.tickers).fillna("Unknown"))
        return np.asarray(cats.codes)

    def slice(self, start=None, end=None) -> "Panel":
        """Rows in [start, end] — used by the look-ahead fuzz test."""
        sl = slice(start, end)
        kw = {f: getattr(self, f).loc[sl] for f in FIELDS}
        return Panel(self.name, self.kind, **kw, member=self.member.loc[sl], groups=self.groups,
                     bench_close=self.bench_close.loc[sl], rf_daily=self.rf_daily.loc[sl], meta=self.meta)

    def describe(self) -> dict:
        tr = self.tradable
        return {
            "name": self.name,
            "kind": self.kind,
            "start": self.dates[0].strftime("%Y-%m-%d"),
            "end": self.dates[-1].strftime("%Y-%m-%d"),
            "days": self.T,
            "tickers": self.N,
            "avg_tradable": float(tr.sum(axis=1).mean()),
            "groups": int(self.groups.nunique()),
            "survivorship_note": self.meta.get("survivorship_note"),
        }


def _refs() -> pd.DataFrame:
    for p in (config.DATA_DIR / "refs.parquet", config.BUNDLED_DATA / "refs.parquet"):
        if p.exists():
            return pd.read_parquet(p)
    raise FileNotFoundError("refs.parquet missing — run `qrl data fetch macro` first")


_CACHE: dict[str, Panel] = {}


def load_panel(name: str, reload: bool = False) -> Panel:
    if name in _CACHE and not reload:
        return _CACHE[name]
    spec = SPECS[name]
    long = pd.read_parquet(data_path(name))
    meta = json.loads(meta_path(name).read_text()) if meta_path(name).exists() else {}
    long["date"] = pd.to_datetime(long["date"])
    both = long.set_index(["date", "ticker"])[list(FIELDS)].unstack("ticker").sort_index()
    wide = {f: both[f] for f in FIELDS}
    dates = wide["close"].index
    tickers = wide["close"].columns

    # Point-in-time membership (stocks) or listing-based availability (ETFs).
    if meta.get("membership"):
        col = {t: j for j, t in enumerate(tickers)}
        M = np.zeros((len(dates), len(tickers)), dtype=bool)
        dv = dates.values
        for t, s, e in meta["membership"]:
            j = col.get(t)
            if j is None:
                continue
            a = dv.searchsorted(np.datetime64(s))
            b = dv.searchsorted(np.datetime64(e), side="right") if e else len(dv)
            M[a:b, j] = True
        member = pd.DataFrame(M, index=dates, columns=tickers)
    else:
        member = wide["close"].notna().cummax()  # listed from its first bar onward

    refs = _refs()
    refs["date"] = pd.to_datetime(refs["date"])
    spy = refs[refs.ticker == "SPY"].set_index("date")["close"].reindex(dates).ffill()
    irx = refs[refs.ticker == "^IRX"].set_index("date")["raw_close"].reindex(dates).ffill().bfill()
    rf = (irx.clip(lower=0) / 100.0) / config.TRADING_DAYS  # T-bill yield -> daily accrual

    groups = pd.Series(meta.get("groups") or spec.groups).reindex(tickers).fillna("Unknown")
    panel = Panel(name, spec.kind, **wide, member=member, groups=groups, bench_close=spy,
                  rf_daily=rf.fillna(0.0), meta=meta)
    _CACHE[name] = panel
    return panel
