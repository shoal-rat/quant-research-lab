import numpy as np
import pandas as pd
import pytest

from qrl.alpha import ops
from qrl.alpha.dsl import Context, DSLError, evaluate, parse
from qrl.research.knowledge import FAMILIES

EXPRS = [
    "rank(mom(252, 21))", "mom(126, 0)", "resid_mom(126, 21)", "-vol(63)", "beta(126)", "idio_vol(63)",
    "high52(252)", "amihud(21)", "maxret(21)", "seasonal(2)", "trend(50)", "tsmom(126)",
    "overnight_ret(21)", "intraday_ret(21)", "abn_volume(5)", "range_vol(21)", "drawdown(63)",
    "ts_decay(-ts_corr(rank(volume), rank(close), 10), 5)", "ts_argmax(close, 20) - ts_argmin(close, 20)",
    "ts_rank(volume, 20) * sign(delta(close, 5))", "zscore(ts_zscore(returns, 20))",
    "group_rank(ts_ema(returns, 10))", "neutralize(rev(5), vol(21))", "winsorize(pct_change(close, 10))",
    "where(close > ts_mean(close, 50), 1, -1) * ts_skew(returns, 21)", "ts_resid(returns, market, 60)",
    "clip(ts_kurt(returns, 30), -3, 3) + ts_median(vwap, 10) / close", "scale(demean(ts_sum(returns, 5)))",
    "signed_power(ts_cov(returns, market, 40), 0.5) + inv(ts_std(returns, 20))", "log(dollar_volume) ** 2",
]


@pytest.mark.parametrize("bad", [
    "__import__('os').system('ls')", "close.shift(-1)", "open[0]", "lambda: 1", "foo(close)",
    "ts_mean(close, x)", "ts_mean(close, -5)", "ts_mean(close, 2.5)", "ts_mean(close, 5000)",
    "mom(21, 252)", "close if 1 else 0", "[close]", "1 + 2",
])
def test_parser_rejects_unsafe_or_invalid(bad, panel):
    with pytest.raises(DSLError):
        evaluate(parse(bad), Context(panel))


def test_every_library_template_parses():
    for f in FAMILIES:
        for t in f.templates:
            assert parse(t).nodes >= 1


def test_canonical_form_is_stable():
    assert parse("rank( mom(252,21) )").canonical == parse("rank(mom(252, 21))").canonical


@pytest.mark.parametrize("expr", EXPRS)
def test_no_lookahead_any_operator(expr, panel):
    """Truncating history at t must not change any value at or before t."""
    full = evaluate(expr, Context(panel))
    for cut in (700, 1100):
        part = evaluate(expr, Context(panel.slice(end=panel.dates[cut])))
        a = full.iloc[: cut + 1].to_numpy()
        b = part.to_numpy()
        assert a.shape == b.shape
        assert np.array_equal(np.isnan(a), np.isnan(b)), expr
        m = ~np.isnan(a)
        assert np.allclose(a[m], b[m], rtol=1e-9, atol=1e-9), expr


def test_ts_decay_matches_manual_weights():
    x = pd.DataFrame({"a": np.arange(10, dtype=float)})
    out = ops.ts_decay(x, 3).iloc[-1, 0]
    assert out == pytest.approx((3 * 9 + 2 * 8 + 1 * 7) / 6)


def test_ts_argmax_days_ago():
    x = pd.DataFrame({"a": [1, 5, 2, 3, 4.0]})
    assert ops.ts_argmax(x, 5).iloc[-1, 0] == 3  # the 5 was three bars ago
    assert ops.ts_argmin(x, 5).iloc[-1, 0] == 4


def test_ts_beta_matches_polyfit():
    rng = np.random.default_rng(0)
    xv = rng.normal(size=200)
    yv = 0.7 * xv + rng.normal(scale=0.1, size=200)
    b = ops.ts_beta(pd.DataFrame({"y": yv}), pd.DataFrame({"y": xv}), 60).iloc[-1, 0]
    assert b == pytest.approx(np.polyfit(xv[-60:], yv[-60:], 1)[0], rel=1e-6)


def test_cross_sectional_rank_bounds(panel):
    r = evaluate("rank(returns)", Context(panel)).to_numpy()
    r = r[~np.isnan(r)]
    assert r.min() > 0 and r.max() <= 1
