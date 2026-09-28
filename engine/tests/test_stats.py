import numpy as np
import pytest

from qrl.stats.inference import dsr, expected_max_sr, hac_tstat, posterior_sr, psr, sharpe_se
from qrl.stats.pbo import pbo

rng = np.random.default_rng(3)


def test_sharpe_se_matches_normal_formula():
    x = rng.normal(0.0004, 0.01, 5000)
    sr_d = x.mean() / x.std(ddof=1)
    approx = np.sqrt((1 + sr_d ** 2 / 2) / (len(x) - 1)) * np.sqrt(252)
    assert sharpe_se(x) == pytest.approx(approx, rel=0.1)


def test_psr_orders_evidence():
    strong = rng.normal(0.001, 0.01, 3000)
    null = rng.normal(0.0, 0.01, 3000)
    assert psr(strong) > 0.99
    assert 0.02 < psr(null) < 0.98


def test_more_trials_raise_the_bar():
    x = rng.normal(0.0005, 0.01, 3000)
    assert expected_max_sr(100, 0.05) > expected_max_sr(10, 0.05) > 0
    assert dsr(x, 1000)[0] < dsr(x, 2)[0]


def test_posterior_shrinks_toward_a_noisy_population():
    pop = rng.normal(0.0, 0.2, 200)  # 200 useless strategies, all noise
    ses = np.full(200, 0.2)
    p = posterior_sr(0.8, 0.2, pop, ses, prior_mean=0.25, prior_sd=0.25)
    assert p["mean"] < 0.4 and p["shrink"] > 0.5
    rich = posterior_sr(0.8, 0.2, rng.normal(0.5, 0.5, 200), ses, prior_mean=0.25, prior_sd=0.25)
    assert rich["mean"] > p["mean"]


def test_hac_is_more_conservative_on_autocorrelated_data():
    e = rng.normal(size=4000)
    x = np.empty_like(e)
    x[0] = e[0]
    for i in range(1, len(e)):
        x[i] = 0.8 * x[i - 1] + e[i]
    x += 0.05
    naive = x.mean() / (x.std(ddof=1) / np.sqrt(len(x)))
    t, _ = hac_tstat(x, lags=20)
    assert abs(t) < abs(naive)


def test_pbo_near_half_for_pure_noise():
    R = rng.normal(0, 0.01, (2400, 20))
    assert 0.25 < pbo(R)["pbo"] < 0.75


def test_pbo_low_when_one_strategy_has_real_skill():
    R = rng.normal(0, 0.01, (2400, 20))
    R[:, 0] += 0.0015
    assert pbo(R)["pbo"] < 0.1
