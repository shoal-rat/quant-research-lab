"""Factor attribution: is this alpha new, or a known premium in disguise?

Known-factor returns are built from the same panel with the same machinery
(dollar-neutral books, monthly rebalance, no costs), then the strategy's excess
returns are regressed on them with Newey-West errors. A strategy that is
"just momentum" shows a big momentum loading and an insignificant alpha.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from ..data.panel import Panel

_CACHE: dict[str, pd.DataFrame] = {}

EQUITY_FACTORS = {
    "MOM": "mom(252, 21)",
    "STR": "rev(21)",
    "LOWVOL": "-vol(252)",
    "SIZE": "-log(ts_mean(dollar_volume, 63))",
}


def factor_returns(panel: Panel) -> pd.DataFrame:
    if panel.name in _CACHE:
        return _CACHE[panel.name]
    from ..alpha.dsl import Context, evaluate
    from ..backtest.costs import CostModel, CostParams
    from ..backtest.engine import simulate
    from ..portfolio.construct import BookSpec, build_book

    rf = panel.rf_daily
    cols = {"MKT": panel.bench_returns - rf}
    ctx = Context(panel)
    nocost = CostModel.build(panel, CostParams(enabled=False))
    if panel.kind == "cross_section":
        spec = BookSpec(mode="long_short", neutralize="group", rebalance=21, target_vol=None, max_gross=2.0)
        for name, expr in EQUITY_FACTORS.items():
            res = simulate(panel, build_book(evaluate(expr, ctx), panel, spec), nocost)
            cols[name] = res.returns - res.rf
    else:
        R = panel.returns
        for name, t in (("BOND", "TLT"), ("CMDTY", "DBC"), ("GOLD", "GLD")):
            if t in R.columns:
                cols[name] = R[t].fillna(0.0) - rf
        spec = BookSpec.default_for("multi_asset", "time_series")
        res = simulate(panel, build_book(evaluate("tsmom(252)", ctx), panel, spec), nocost)
        cols["TREND"] = res.returns - res.rf
    df = pd.DataFrame(cols).fillna(0.0)
    _CACHE[panel.name] = df
    return df


def nw_ols(y: np.ndarray, X: np.ndarray, lags: int = 10):
    """OLS with Newey-West covariance. X must include the intercept column."""
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    e = y - X @ beta
    n = len(y)
    xtx_inv = np.linalg.pinv(X.T @ X)
    Xe = X * e[:, None]
    S = Xe.T @ Xe
    for k in range(1, lags + 1):
        w = 1 - k / (lags + 1)
        G = Xe[k:].T @ Xe[:-k]
        S += w * (G + G.T)
    cov = xtx_inv @ S @ xtx_inv
    se = np.sqrt(np.maximum(np.diag(cov), 1e-24))
    r2 = 1 - e.var() / y.var() if y.var() > 0 else 0.0
    return beta, se, r2, e


def attribute(excess: pd.Series, panel: Panel) -> dict:
    F = factor_returns(panel).reindex(excess.index).fillna(0.0)
    y = excess.fillna(0.0).to_numpy()
    X = np.column_stack([np.ones(len(y)), F.to_numpy()])
    if len(y) < 250:
        return {}
    beta, se, r2, e = nw_ols(y, X)
    resid_vol = e.std() * np.sqrt(252)
    return {
        "alpha_ann": float(beta[0] * 252),
        "alpha_t": float(beta[0] / se[0]),
        "r2": float(r2),
        "loadings": {c: {"beta": float(b), "t": float(b / s)} for c, b, s in zip(F.columns, beta[1:], se[1:])},
        "resid_sharpe": float(beta[0] * 252 / resid_vol) if resid_vol > 0 else 0.0,
    }
