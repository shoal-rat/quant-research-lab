import numpy as np
import pandas as pd
import pytest

from qrl.alpha.dsl import Context, evaluate
from qrl.backtest.costs import CostModel, CostParams
from qrl.backtest.engine import simulate
from qrl.portfolio.construct import Book, BookSpec, build_book
from qrl.stats.metrics import sharpe


def const_book(panel, w, spec=None, every=5):
    spec = spec or BookSpec(mode="long_only", rebalance=every, target_vol=None)
    return Book({i: w.copy() for i in range(63, panel.T - 1, every)}, spec)


def nocost(panel):
    return CostModel.build(panel, CostParams(enabled=False))


def test_single_asset_book_tracks_the_asset(panel):
    w = np.zeros(panel.N)
    w[3] = 1.0
    res = simulate(panel, const_book(panel, w, every=1), nocost(panel))
    asset = panel.returns.iloc[:, 3].reindex(res.returns.index)
    # after the first fill the book is exactly the asset (open fills, no cash)
    assert np.allclose(res.returns.iloc[2:], asset.iloc[2:], atol=1e-10)


def test_cash_book_earns_the_bill_rate(panel):
    res = simulate(panel, const_book(panel, np.zeros(panel.N)), nocost(panel))
    assert np.allclose(res.returns, panel.rf_daily.reindex(res.returns.index))


def test_costs_rise_with_capital(panel):
    z = evaluate("rev(5)", Context(panel))
    book = build_book(z, panel, BookSpec(mode="long_short", rebalance=5, target_vol=None, max_gross=2))
    small = simulate(panel, book, CostModel.build(panel, CostParams(capital=1e5)))
    big = simulate(panel, book, CostModel.build(panel, CostParams(capital=1e10)))
    assert big.costs.sum() > small.costs.sum() > 0
    assert (small.gross == big.gross).all()


def test_same_day_alpha_is_not_capturable(overnight_panel):
    """A characteristic that pays in the overnight gap right after the signal must NOT
    show up as profit: orders only fill at the next open."""
    p = overnight_panel
    z = evaluate("log(volume)", Context(p))
    res = simulate(p, build_book(z, p, BookSpec(mode="long_short", rebalance=1, target_vol=None, max_gross=2)), nocost(p))
    assert abs(sharpe(res.excess)) < 1.0


def test_next_day_alpha_is_captured(planted_panel):
    p = planted_panel
    z = evaluate("log(volume)", Context(p))
    res = simulate(p, build_book(z, p, BookSpec(mode="long_short", rebalance=1, target_vol=None, max_gross=2)), nocost(p))
    assert sharpe(res.excess) > 3.0


def test_long_only_weights(panel):
    z = evaluate("mom(126, 21)", Context(panel))
    book = build_book(z, panel, BookSpec(mode="long_only", quantile=0.2, max_weight=0.1, target_vol=None, max_gross=1))
    held = [w for w in book.targets.values() if w.sum() > 0]  # before the signal exists: cash
    assert len(held) > len(book.targets) * 0.8
    for w in held:
        assert w.min() >= 0
        assert w.sum() == pytest.approx(1.0)
        assert w.max() <= 0.1 + 1e-9


def test_long_short_is_dollar_neutral(panel):
    z = evaluate("mom(126, 21)", Context(panel))
    book = build_book(z, panel, BookSpec(mode="long_short", target_vol=None, max_gross=2, max_weight=1))
    for w in [w for w in book.targets.values() if np.abs(w).sum() > 0][:20]:
        assert w.sum() == pytest.approx(0.0, abs=1e-9)
        assert w[w > 0].sum() == pytest.approx(1.0)


def test_vol_target_respects_gross_cap(panel):
    z = evaluate("rev(5)", Context(panel))
    book = build_book(z, panel, BookSpec(mode="long_short", target_vol=0.5, max_gross=1.5))
    assert max(np.abs(w).sum() for w in book.targets.values()) <= 1.5 + 1e-9


def test_delisted_position_is_closed_with_haircut(panel):
    p = panel.slice()
    close = p.close.copy()
    close.iloc[900:, 5] = np.nan  # the name stops trading
    p2 = type(p)(**{**p.__dict__, "close": close})
    for k in ("returns", "overnight", "intraday"):
        p2.__dict__.pop(k, None)
    w = np.zeros(p.N)
    w[5] = 0.5
    res = simulate(p2, const_book(p2, w), nocost(p2), delist_haircut=0.10)
    d = res.returns.index.get_loc(p.dates[900])
    # ~half the book (drifted since the last rebalance) is written down 10%
    assert -0.055 < res.returns.iloc[d] < -0.045
    assert res.long_exp.iloc[d + 3] == pytest.approx(0.0)
