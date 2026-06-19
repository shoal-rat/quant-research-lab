"""Generate golden reference values for the TypeScript quant engines.

We compute every core statistic with the established Python libraries
(empyrical, scipy, statsmodels, numpy) and emit both the INPUTS and the
reference OUTPUTS to src/engines/__fixtures__/quant_golden.json. The TS golden
test (quantGolden.test.ts) reads the same inputs, runs the TS implementations,
and asserts they match the library outputs within tolerance. This guarantees the
in-browser math matches what a professional's Python stack would produce.

Run:  python scripts/quant_reference/reference.py
Requires: numpy pandas scipy statsmodels empyrical-reloaded
"""

import json
import os

import numpy as np
from scipy import stats
import statsmodels.api as sm
import empyrical

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "src", "engines", "__fixtures__", "quant_golden.json"))
ANN = 252  # periods per year used across the golden set (daily)


def make_returns(n=180):
    """Deterministic, non-normal daily return series (drift + cycle + fat tails)."""
    rng = np.random.default_rng(7)
    base = 0.0006 + 0.011 * np.sin(np.arange(n) / 6.0)
    shocks = rng.standard_t(df=4, size=n) * 0.006  # heavy tails -> non-zero kurtosis
    crashes = np.where(np.arange(n) % 23 == 0, -0.03, 0.0)  # periodic negative skew
    return np.round(base + shocks + crashes, 6)


def winsorize_ref(values, tail):
    lo = np.quantile(values, tail)  # linear interpolation (numpy default)
    hi = np.quantile(values, 1 - tail)
    return np.clip(values, lo, hi)


def zscore_ref(values):
    sd = np.std(values, ddof=1)
    return (values - np.mean(values)) / sd


def rank_normalize_ref(values):
    n = len(values)
    ranks = stats.rankdata(values, method="average")  # 1-based average ranks
    pct = (ranks - 0.5) / n
    return (pct - 0.5) * np.sqrt(12)


def beta_residualize_ref(values, betas):
    X = sm.add_constant(np.asarray(betas, dtype=float))
    model = sm.OLS(np.asarray(values, dtype=float), X).fit()
    return model.resid


def psr_ref(returns, sharpe_annual, ppy):
    """Bailey & Lopez de Prado PSR with scipy sample skew/kurtosis (bias-corrected)."""
    T = len(returns)
    sr = sharpe_annual / np.sqrt(ppy)
    skew = stats.skew(returns, bias=False)
    kurt = stats.kurtosis(returns, fisher=False, bias=False)  # non-excess (Pearson)
    denom = np.sqrt(max(1e-12, 1 - skew * sr + ((kurt - 1) / 4) * sr * sr))
    z = (sr * np.sqrt(T - 1)) / denom
    return float(stats.norm.cdf(z))


def main():
    returns = make_returns()
    cross = np.array([0.12, -0.40, 0.03, 0.55, -0.08, 0.21, 0.02, -0.15, 0.31, 0.07,
                      -0.22, 0.44, 0.01, -0.05, 0.18, 0.09, -0.33, 0.26, 0.04, -0.11], dtype=float)
    groups = ["tech", "tech", "fin", "fin", "tech", "energy", "energy", "fin", "tech", "energy",
              "fin", "tech", "energy", "fin", "tech", "energy", "fin", "tech", "energy", "fin"]
    betas = np.array([1.2, 0.8, 1.5, 0.6, 1.1, 0.9, 1.3, 0.7, 1.4, 1.0,
                      0.5, 1.6, 0.85, 1.05, 0.95, 1.25, 0.75, 1.35, 0.65, 1.15], dtype=float)

    # signal vs forward returns for the IC test (real correlation + noise)
    rng = np.random.default_rng(11)
    signal = rng.normal(size=40)
    forward = 0.6 * signal + rng.normal(size=40) * 0.8

    # sharpe used as the PSR input, computed the empyrical way
    sharpe_annual = float(empyrical.sharpe_ratio(returns, risk_free=0, period="daily"))

    # group demean reference (pandas-style groupby transform)
    g = np.array(groups)
    demeaned = cross.copy()
    for grp in set(groups):
        mask = g == grp
        demeaned[mask] = cross[mask] - cross[mask].mean()

    golden = {
        "annualization": ANN,
        "returns": returns.tolist(),
        "crossSection": cross.tolist(),
        "groups": groups,
        "betas": betas.tolist(),
        "signal": signal.tolist(),
        "forward": forward.tolist(),
        "expected": {
            # empyrical / scipy reference metrics
            "sharpe": sharpe_annual,
            "sortino": float(empyrical.sortino_ratio(returns, required_return=0, period="daily")),
            "calmar": float(empyrical.calmar_ratio(returns, period="daily")),
            "annualReturn": float(empyrical.annual_return(returns, period="daily")),
            "maxDrawdown": float(empyrical.max_drawdown(returns)),
            "spearmanIC": float(stats.spearmanr(signal, forward).correlation),
            "psr": psr_ref(returns, sharpe_annual, ANN),
            "normCdf": {str(z): float(stats.norm.cdf(z)) for z in [-2.5, -1.0, 0.0, 0.5, 1.96, 3.0]},
            # preprocessing reference vectors
            "winsorize05": winsorize_ref(cross, 0.05).tolist(),
            "zscore": zscore_ref(cross).tolist(),
            "rankNormalize": rank_normalize_ref(cross).tolist(),
            "demeanByGroup": demeaned.tolist(),
            "betaResidualize": beta_residualize_ref(cross, betas).tolist(),
        },
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(golden, fh, indent=2)
    print(f"wrote {OUT}")
    print(f"  sharpe={golden['expected']['sharpe']:.4f} sortino={golden['expected']['sortino']:.4f} "
          f"calmar={golden['expected']['calmar']:.4f} IC={golden['expected']['spearmanIC']:.4f} "
          f"psr={golden['expected']['psr']:.4f}")


if __name__ == "__main__":
    main()
