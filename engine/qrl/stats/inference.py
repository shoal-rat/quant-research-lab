"""Statistical inference for back-tests: how much of this Sharpe is real?

* ``sharpe_se``      — standard error of an estimated Sharpe ratio under
                       non-normal returns (Mertens 2002; Opdyke 2007).
* ``psr``            — Probabilistic Sharpe Ratio (Bailey & Lopez de Prado 2012).
* ``expected_max_sr``— the Sharpe the best of N *useless* strategies would show.
* ``dsr``            — Deflated Sharpe Ratio: PSR against that selection bar
                       (Bailey & Lopez de Prado 2014).
* ``posterior_sr``   — empirical-Bayes shrinkage of a strategy's Sharpe toward
                       the population of *every* strategy the lab has tried.
                       This is the lab's headline number, "expected live Sharpe":
                       if most attempts are noise, the population variance of
                       true Sharpes is small and every result is shrunk hard.
* ``hac_tstat``      — Newey-West t-statistic of a mean (overlapping horizons).
"""
from __future__ import annotations

import numpy as np
from scipy import stats

EULER = 0.5772156649015329
ANN = np.sqrt(252.0)


def _moments(x: np.ndarray):
    x = np.asarray(x, dtype=float)
    x = x[np.isfinite(x)]
    n = len(x)
    if n < 20 or x.std(ddof=1) == 0:
        return n, 0.0, 0.0, 3.0
    sr = x.mean() / x.std(ddof=1)
    return n, float(sr), float(stats.skew(x)), float(stats.kurtosis(x, fisher=False))


def sharpe_se(x) -> float:
    """Annualized standard error of the annualized Sharpe estimate."""
    n, sr, g3, g4 = _moments(x)
    if n < 20:
        return float("inf")
    var = (1 - g3 * sr + (g4 - 1) / 4 * sr ** 2) / (n - 1)
    return float(np.sqrt(max(var, 1e-12)) * ANN)


def psr(x, sr_star_ann: float = 0.0) -> float:
    """P(true Sharpe > sr_star) given the sample (annualized sr_star)."""
    n, sr, g3, g4 = _moments(x)
    if n < 20:
        return 0.0
    star = sr_star_ann / ANN
    denom = np.sqrt(max(1 - g3 * sr + (g4 - 1) / 4 * sr ** 2, 1e-12))
    return float(stats.norm.cdf((sr - star) * np.sqrt(n - 1) / denom))


def expected_max_sr(n_trials: int, sr_var_ann: float) -> float:
    """E[max annualized Sharpe] across n_trials independent zero-skill strategies."""
    if n_trials <= 1:
        return 0.0
    z = (1 - EULER) * stats.norm.ppf(1 - 1 / n_trials) + EULER * stats.norm.ppf(1 - 1 / (n_trials * np.e))
    return float(np.sqrt(max(sr_var_ann, 0.0)) * z)


def dsr(x, n_trials: int, trial_sr_var_ann: float | None = None) -> tuple[float, float]:
    """(Deflated Sharpe probability, the selection bar used)."""
    se = sharpe_se(x)
    var = max(trial_sr_var_ann or 0.0, se ** 2)  # never below the sampling variance
    bar = expected_max_sr(max(1, n_trials), var)
    return psr(x, bar), bar


def effective_trials(n_raw: int, avg_corr: float) -> float:
    """Correlated trials are fewer independent tests (Lopez de Prado's heuristic)."""
    rho = min(max(avg_corr, 0.0), 0.99)
    return max(1.0, rho + (1 - rho) * n_raw)


def posterior_sr(sr_obs: float, se_obs: float, pop_srs: np.ndarray, pop_ses: np.ndarray,
                 prior_mean: float, prior_sd: float, prior_weight: float = 20.0,
                 tau_floor: float = 0.08) -> dict:
    """Normal-normal empirical Bayes posterior of the true annualized Sharpe.

    Population prior N(m, tau^2) estimated by method of moments from every trial
    the lab has run on comparable books, blended with the mechanism prior
    (``prior_mean``, ``prior_sd``) with ``prior_weight`` pseudo-observations.
    """
    pop_srs = np.asarray(pop_srs, dtype=float)
    pop_ses = np.asarray(pop_ses, dtype=float)
    ok = np.isfinite(pop_srs) & np.isfinite(pop_ses)
    pop_srs, pop_ses = pop_srs[ok], pop_ses[ok]
    n = len(pop_srs)
    if n >= 5:
        m_pop = float(np.mean(pop_srs))
        tau2_pop = max(float(np.var(pop_srs, ddof=1) - np.mean(pop_ses ** 2)), 0.0)
    else:
        m_pop, tau2_pop = prior_mean, prior_sd ** 2
    w = n / (n + prior_weight)
    m = w * m_pop + (1 - w) * prior_mean
    tau2 = max(w * tau2_pop + (1 - w) * prior_sd ** 2, tau_floor ** 2)
    k = tau2 / (tau2 + se_obs ** 2)
    mean = m + k * (sr_obs - m)
    sd = float(np.sqrt(tau2 * se_obs ** 2 / (tau2 + se_obs ** 2)))
    return {
        "mean": float(mean),
        "sd": sd,
        "shrink": float(1 - k),  # fraction of the observed edge attributed to luck/selection
        "prior_mean": float(m),
        "prior_sd": float(np.sqrt(tau2)),
        "p_positive": float(stats.norm.sf(0, loc=mean, scale=max(sd, 1e-9))),
        "population": int(n),
    }


def hac_tstat(x, lags: int | None = None) -> tuple[float, float]:
    """Newey-West (Bartlett) t-stat and mean of a series."""
    x = np.asarray(x, dtype=float)
    x = x[np.isfinite(x)]
    n = len(x)
    if n < 10:
        return 0.0, float(np.mean(x)) if n else 0.0
    if lags is None:
        lags = int(np.floor(4 * (n / 100) ** (2 / 9)))
    mu = x.mean()
    e = x - mu
    var = e @ e / n
    for k in range(1, min(lags, n - 1) + 1):
        w = 1 - k / (lags + 1)
        var += 2 * w * (e[k:] @ e[:-k]) / n
    se = np.sqrt(max(var, 1e-18) / n)
    return float(mu / se), float(mu)


def min_track_record(sr_ann: float, x, target_ann: float = 0.0, conf: float = 0.95) -> float:
    """Years of live data needed to confirm sr > target at ``conf`` (MinTRL)."""
    n, sr, g3, g4 = _moments(x)
    s, t = sr_ann / ANN, target_ann / ANN
    if s <= t:
        return float("inf")
    z = stats.norm.ppf(conf)
    obs = 1 + (1 - g3 * s + (g4 - 1) / 4 * s ** 2) * (z / (s - t)) ** 2
    return float(obs / 252)
