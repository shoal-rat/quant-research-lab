"""Vectorized operators for the alpha DSL.

Every operator maps T x N DataFrames to a T x N DataFrame and uses only rows
<= t to produce row t (time-series ops are trailing windows; cross-sectional
ops work within a single row). The look-ahead fuzz test in
``qrl.research.integrity`` re-verifies this property for every expression.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

ANN = np.sqrt(252.0)


def _mp(d: int) -> int:
    """min_periods: tolerate a few missing bars, but never a mostly-empty window."""
    return max(2, int(np.ceil(d * 0.8))) if d > 2 else d


def _clean(x: pd.DataFrame) -> pd.DataFrame:
    return x.replace([np.inf, -np.inf], np.nan)


# ------------------------------------------------------------------ elementwise
def op_abs(x):
    return x.abs()


def op_log(x):
    return _clean(np.log(x.where(x > 0)))


def op_sign(x):
    return np.sign(x)


def op_sqrt(x):
    return np.sign(x) * np.sqrt(x.abs())


def op_signed_power(x, p):
    return np.sign(x) * x.abs() ** p


def op_inv(x):
    return _clean(1.0 / x)


def op_max(x, y):
    return _clean(np.maximum(x, y))


def op_min(x, y):
    return _clean(np.minimum(x, y))


def op_clip(x, lo, hi):
    return x.clip(lower=lo, upper=hi)


def op_where(c, a, b):
    if not isinstance(a, pd.DataFrame):
        a = c * 0 + a
    if not isinstance(b, pd.DataFrame):
        b = c * 0 + b
    out = a.where(c > 0.5, b)
    return out.where(c.notna())


# ---------------------------------------------------------------- time series
def ts_delay(x, d):
    return x.shift(d)


def ts_delta(x, d):
    return x - x.shift(d)


def ts_pct(x, d):
    return _clean(x / x.shift(d) - 1.0)


def ts_mean(x, d):
    return x.rolling(d, min_periods=_mp(d)).mean()


def ts_sum(x, d):
    return x.rolling(d, min_periods=_mp(d)).sum()


def ts_std(x, d):
    return x.rolling(d, min_periods=_mp(d)).std()


def ts_min(x, d):
    return x.rolling(d, min_periods=_mp(d)).min()


def ts_max(x, d):
    return x.rolling(d, min_periods=_mp(d)).max()


def ts_median(x, d):
    return x.rolling(d, min_periods=_mp(d)).median()


def ts_skew(x, d):
    return x.rolling(d, min_periods=_mp(d)).skew()


def ts_kurt(x, d):
    return x.rolling(d, min_periods=_mp(d)).kurt()


def ts_rank(x, d):
    """Percentile of today's value within the trailing window (1 = window high)."""
    return x.rolling(d, min_periods=_mp(d)).rank(pct=True)


def ts_zscore(x, d):
    r = x.rolling(d, min_periods=_mp(d))
    return _clean((x - r.mean()) / r.std())


def ts_ema(x, halflife):
    return x.ewm(halflife=halflife, min_periods=int(halflife), ignore_na=True).mean()


def ts_corr(x, y, d):
    return _clean(x.rolling(d, min_periods=_mp(d)).corr(y))


def ts_cov(x, y, d):
    return x.rolling(d, min_periods=_mp(d)).cov(y)


def ts_beta(y, x, d):
    """Rolling OLS slope of y on x."""
    cov = y.rolling(d, min_periods=_mp(d)).cov(x)
    var = x.rolling(d, min_periods=_mp(d)).var()
    return _clean(cov / var)


def ts_resid(y, x, d):
    """Today's residual of y from its trailing regression on x."""
    b = ts_beta(y, x, d)
    return (y - y.rolling(d, min_periods=_mp(d)).mean()) - b * (x - x.rolling(d, min_periods=_mp(d)).mean())


def ts_decay(x, d):
    """Linearly-decaying weighted mean (weight d on today, 1 on t-d+1)."""
    acc = pd.DataFrame(0.0, index=x.index, columns=x.columns)
    wsum = acc.copy()
    for k in range(d):
        w = float(d - k)
        s = x.shift(k)
        acc += s.fillna(0.0) * w
        wsum += s.notna() * w
    out = acc / wsum.where(wsum > 0)
    return out.where(wsum >= 0.5 * d * (d + 1) / 2)


def _window_arg(x: pd.DataFrame, d: int, fn) -> pd.DataFrame:
    """Apply an argmax/argmin over trailing windows via strided views (chunked)."""
    a = x.to_numpy(dtype=float)
    T, N = a.shape
    out = np.full((T, N), np.nan)
    if T < d:
        return pd.DataFrame(out, index=x.index, columns=x.columns)
    view = np.lib.stride_tricks.sliding_window_view(a, d, axis=0)  # (T-d+1, N, d)
    step = max(1, 2_000_000 // max(1, N * d))
    for s in range(0, view.shape[0], step):
        blk = view[s:s + step]
        valid = np.isfinite(blk).sum(axis=2) >= _mp(d)
        res = fn(blk).astype(float)  # index within window, 0 = oldest
        res = (d - 1) - res  # days ago: 0 = today
        res[~valid] = np.nan
        out[d - 1 + s: d - 1 + s + blk.shape[0]] = res
    return pd.DataFrame(out, index=x.index, columns=x.columns)


def ts_argmax(x, d):
    return _window_arg(x, d, lambda b: np.argmax(np.where(np.isfinite(b), b, -np.inf), axis=2))


def ts_argmin(x, d):
    return _window_arg(x, d, lambda b: np.argmin(np.where(np.isfinite(b), b, np.inf), axis=2))


# -------------------------------------------------------------- cross section
def cs_rank(x):
    return x.rank(axis=1, pct=True)


def cs_zscore(x):
    m = x.mean(axis=1)
    s = x.std(axis=1)
    return _clean(x.sub(m, axis=0).div(s.where(s > 0), axis=0))


def cs_demean(x):
    return x.sub(x.mean(axis=1), axis=0)


def cs_winsorize(x, k=3.0):
    med = x.median(axis=1)
    mad = x.sub(med, axis=0).abs().median(axis=1) * 1.4826
    lo = med - k * mad
    hi = med + k * mad
    return x.clip(lower=lo, upper=hi, axis=0)


def cs_scale(x):
    return x.div(x.abs().sum(axis=1).replace(0, np.nan), axis=0)


def _by_group(x: pd.DataFrame, codes: np.ndarray, fn) -> pd.DataFrame:
    out = pd.DataFrame(np.nan, index=x.index, columns=x.columns)
    for g in np.unique(codes):
        cols = x.columns[codes == g]
        out[cols] = fn(x[cols])
    return out


def group_demean(x, codes):
    return _by_group(x, codes, cs_demean)


def group_rank(x, codes):
    return _by_group(x, codes, cs_rank)


def group_zscore(x, codes):
    return _by_group(x, codes, cs_zscore)


def cs_neutralize(y, x):
    """Row-wise OLS residual of y on x (plus intercept)."""
    ym = y.sub(y.mean(axis=1), axis=0)
    xm = x.sub(x.mean(axis=1), axis=0)
    both = ym.notna() & xm.notna()
    ym, xm = ym.where(both), xm.where(both)
    b = (ym * xm).sum(axis=1) / (xm * xm).sum(axis=1).replace(0, np.nan)
    return ym - xm.mul(b, axis=0)
