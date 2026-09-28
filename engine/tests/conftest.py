"""Synthetic market fixtures — tests never touch the network."""
import numpy as np
import pandas as pd
import pytest

from qrl.data.panel import Panel


def make_panel(T=1400, N=60, seed=7, planted=0.0, lag=2, kind="cross_section", name="synthetic"):
    """GBM-ish prices. If ``planted`` > 0, a characteristic known at close t predicts the
    close-to-close return ``lag`` days later (lag=1 lands in the overnight gap before any
    next-open order can fill; lag=2 is capturable)."""
    rng = np.random.default_rng(seed)
    dates = pd.bdate_range("2010-01-04", periods=T)
    tickers = [f"S{i:03d}" for i in range(N)]
    mkt = rng.normal(0.0003, 0.01, T)
    beta = rng.uniform(0.6, 1.4, N)
    char = rng.normal(0, 1, (T, N))  # observable characteristic ("volume" encodes it)
    eps = rng.normal(0, 0.015, (T, N))
    r = mkt[:, None] * beta[None, :] + eps
    if planted:
        r[lag:] += planted * char[:-lag]
    close = 50 * np.exp(np.cumsum(np.log1p(r), axis=0))
    intraday = rng.normal(0, 0.004, (T, N))
    openp = close / (1 + intraday)
    high = np.maximum(openp, close) * (1 + np.abs(rng.normal(0, 0.004, (T, N))))
    low = np.minimum(openp, close) * (1 - np.abs(rng.normal(0, 0.004, (T, N))))
    volume = np.exp(14 + 0.3 * char + rng.normal(0, 0.1, (T, N)))
    df = lambda a: pd.DataFrame(a, index=dates, columns=tickers)  # noqa: E731
    bench = pd.Series(100 * np.exp(np.cumsum(np.log1p(mkt))), index=dates)
    return Panel(name=name, kind=kind, open=df(openp), high=df(high), low=df(low), close=df(close),
                 volume=df(volume), raw_close=df(close), member=df(np.ones((T, N), bool)),
                 groups=pd.Series([f"G{i % 6}" for i in range(N)], index=tickers),
                 bench_close=bench, rf_daily=pd.Series(0.02 / 252, index=dates), meta={})


@pytest.fixture(scope="session")
def panel():
    return make_panel()


@pytest.fixture(scope="session")
def planted_panel():
    return make_panel(planted=0.004, seed=11, name="planted")


@pytest.fixture(scope="session")
def overnight_panel():
    return make_panel(planted=0.004, lag=1, seed=12, name="overnight")
