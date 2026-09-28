"""Performance metrics on daily return series."""
from __future__ import annotations

import numpy as np
import pandas as pd

ANN = 252


def sharpe(ex: pd.Series | np.ndarray) -> float:
    x = np.asarray(ex, dtype=float)
    x = x[np.isfinite(x)]
    if len(x) < 20 or x.std(ddof=1) == 0:
        return 0.0
    return float(x.mean() / x.std(ddof=1) * np.sqrt(ANN))


def drawdown(ret: pd.Series) -> pd.Series:
    eq = (1 + ret.fillna(0)).cumprod()
    return eq / eq.cummax() - 1.0


def max_dd_duration(dd: pd.Series) -> int:
    """Longest stretch (trading days) spent below a prior high."""
    under = (dd < -1e-9).to_numpy()
    best = cur = 0
    for u in under:
        cur = cur + 1 if u else 0
        best = max(best, cur)
    return best


def summarize(ret: pd.Series, rf: pd.Series, bench: pd.Series | None = None,
              turnover: pd.Series | None = None, costs: pd.Series | None = None) -> dict:
    ret = ret.fillna(0.0)
    ex = ret - rf.reindex(ret.index).fillna(0.0)
    n = len(ret)
    years = n / ANN
    growth = float((1 + ret).prod())
    cagr = growth ** (1 / years) - 1 if years > 0 and growth > 0 else -1.0
    vol = float(ret.std() * np.sqrt(ANN))
    dd = drawdown(ret)
    downside = ex[ex < 0]
    sortino = float(ex.mean() * ANN / (np.sqrt((downside ** 2).sum() / max(1, n)) * np.sqrt(ANN))) if len(downside) else 0.0
    mdd = float(dd.min()) if n else 0.0
    q = np.quantile(ret, 0.05) if n else 0.0
    out = {
        "cagr": cagr,
        "ann_return": float(ret.mean() * ANN),
        "ann_excess": float(ex.mean() * ANN),
        "vol": vol,
        "sharpe": sharpe(ex),
        "sortino": sortino,
        "max_dd": mdd,
        "max_dd_days": max_dd_duration(dd),
        "calmar": float(cagr / abs(mdd)) if mdd < 0 else 0.0,
        "skew": float(ex.skew()) if n > 3 else 0.0,
        "kurt": float(ex.kurt() + 3) if n > 3 else 3.0,
        "hit_rate": float((ret > 0).mean()) if n else 0.0,
        "cvar95": float(ret[ret <= q].mean()) if n else 0.0,
        "days": n,
    }
    yearly = (1 + ret).groupby(ret.index.year).prod() - 1
    out["pct_years_positive"] = float((yearly > 0).mean()) if len(yearly) else 0.0
    if bench is not None:
        b = bench.reindex(ret.index).fillna(0.0)
        bx = b - rf.reindex(ret.index).fillna(0.0)
        cov = np.cov(ex, bx)
        out["beta"] = float(cov[0, 1] / cov[1, 1]) if cov[1, 1] > 0 else 0.0
        out["corr_bench"] = float(np.corrcoef(ex, bx)[0, 1]) if ex.std() > 0 and bx.std() > 0 else 0.0
        active = ret - b
        te = active.std() * np.sqrt(ANN)
        out["info_ratio"] = float(active.mean() * ANN / te) if te > 0 else 0.0
    if turnover is not None:
        out["turnover"] = float(turnover.reindex(ret.index).fillna(0).mean() * ANN)
    if costs is not None:
        out["cost_bps"] = float(costs.reindex(ret.index).fillna(0).mean() * ANN * 1e4)
    return out


def yearly_returns(ret: pd.Series) -> dict[int, float]:
    y = (1 + ret.fillna(0)).groupby(ret.index.year).prod() - 1
    return {int(k): float(v) for k, v in y.items()}


def monthly_table(ret: pd.Series) -> list[dict]:
    m = (1 + ret.fillna(0)).groupby([ret.index.year, ret.index.month]).prod() - 1
    return [{"y": int(y), "m": int(mo), "r": float(v)} for (y, mo), v in m.items()]


def rolling_sharpe(ex: pd.Series, window: int = 252) -> pd.Series:
    m = ex.rolling(window, min_periods=window // 2).mean()
    s = ex.rolling(window, min_periods=window // 2).std()
    return (m / s * np.sqrt(ANN)).replace([np.inf, -np.inf], np.nan)


def downsample(s: pd.Series, points: int = 400) -> list[list]:
    """[[iso_date, value], ...] thinned for charts (keeps the last point)."""
    s = s.dropna()
    if len(s) == 0:
        return []
    step = max(1, len(s) // points)
    t = s.iloc[::step]
    if t.index[-1] != s.index[-1]:
        t = pd.concat([t, s.iloc[-1:]])
    return [[d.strftime("%Y-%m-%d"), round(float(v), 6)] for d, v in t.items()]
