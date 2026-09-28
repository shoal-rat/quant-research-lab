"""Signal diagnostics: rank IC, IC decay, quantile spreads, signal turnover.

Forward returns respect the execution lag: a score formed at close(t) is
paired with the return from open(t+1) to close(t+h) — exactly what a book
trading at the next open would earn over h days.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from ..data.panel import Panel
from .inference import hac_tstat


def forward_returns(panel: Panel, h: int) -> pd.DataFrame:
    fwd = panel.close.shift(-h) / panel.open.shift(-1) - 1.0
    return fwd.replace([np.inf, -np.inf], np.nan)


def _row_rank(a: np.ndarray) -> np.ndarray:
    df = pd.DataFrame(a)
    return df.rank(axis=1, pct=True).to_numpy()


def rank_ic_series(z: pd.DataFrame, fwd: pd.DataFrame, min_names: int = 10) -> pd.Series:
    zz = z.to_numpy(dtype=float)
    ff = fwd.reindex_like(z).to_numpy(dtype=float)
    both = np.isfinite(zz) & np.isfinite(ff)
    zr = _row_rank(np.where(both, zz, np.nan))
    fr = _row_rank(np.where(both, ff, np.nan))
    zr = zr - np.nanmean(zr, axis=1, keepdims=True)
    fr = fr - np.nanmean(fr, axis=1, keepdims=True)
    num = np.nansum(zr * fr, axis=1)
    den = np.sqrt(np.nansum(zr ** 2, axis=1) * np.nansum(fr ** 2, axis=1))
    with np.errstate(all="ignore"):
        ic = num / den
    ic[both.sum(axis=1) < min_names] = np.nan
    return pd.Series(ic, index=z.index)


def ic_report(z: pd.DataFrame, panel: Panel, rows: slice, horizons=(1, 5, 21, 63)) -> dict:
    out = {}
    for h in horizons:
        ic = rank_ic_series(z, forward_returns(panel, h)).iloc[rows].dropna()
        if len(ic) < 30:
            out[h] = {"mean": 0.0, "t": 0.0, "icir": 0.0, "n": int(len(ic))}
            continue
        t, mu = hac_tstat(ic.to_numpy(), lags=max(h, 5))
        out[h] = {
            "mean": mu,
            "t": t,
            "icir": float(mu / ic.std() * np.sqrt(252 / h)) if ic.std() > 0 else 0.0,
            "hit": float((ic > 0).mean()),
            "n": int(len(ic)),
        }
    return out


def quantile_returns(z: pd.DataFrame, panel: Panel, rows: slice, h: int = 21, q: int = 5) -> list[float]:
    """Annualized mean forward return by score quintile (sampled every h days)."""
    fwd = forward_returns(panel, h)
    zz = z.iloc[rows].iloc[::h]
    ff = fwd.reindex_like(z).iloc[rows].iloc[::h]
    buckets = [[] for _ in range(q)]
    for (_, zrow), (_, frow) in zip(zz.iterrows(), ff.iterrows()):
        ok = zrow.notna() & frow.notna()
        if ok.sum() < q * 3:
            continue
        r = zrow[ok].rank(pct=True)
        b = np.minimum((r * q).astype(int), q - 1)
        f = frow[ok] - frow[ok].mean()  # cross-sectionally demeaned
        for k in range(q):
            sel = f[b == k]
            if len(sel):
                buckets[k].append(float(sel.mean()))
    return [float(np.mean(b) * 252 / h) if b else 0.0 for b in buckets]


def signal_autocorr(z: pd.DataFrame, lag: int = 21) -> float:
    """Cross-sectional rank autocorrelation: high = slow signal = cheap to trade."""
    zr = z.rank(axis=1, pct=True)
    a = zr.to_numpy()
    b = zr.shift(lag).to_numpy()
    both = np.isfinite(a) & np.isfinite(b)
    vals = []
    for i in range(lag, len(a), max(1, lag // 2)):
        m = both[i]
        if m.sum() > 10:
            vals.append(np.corrcoef(a[i, m], b[i, m])[0, 1])
    return float(np.nanmean(vals)) if vals else 0.0
