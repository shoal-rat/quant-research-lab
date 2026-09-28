"""Probability of Backtest Overfitting via CSCV (Bailey, Borwein, Lopez de Prado, Zhu 2017).

Split the common history into S blocks. For every way of choosing S/2 blocks as
"in-sample", pick the strategy with the best in-sample Sharpe and see where it
ranks on the complementary blocks. PBO is the fraction of splits in which the
in-sample winner lands below the out-of-sample median.
"""
from __future__ import annotations

from itertools import combinations

import numpy as np


def pbo(returns: np.ndarray, blocks: int = 12) -> dict:
    """``returns``: T x K matrix of daily returns for K candidate strategies."""
    R = np.asarray(returns, dtype=float)
    R = R[np.all(np.isfinite(R), axis=1)]
    T, K = R.shape
    if K < 4 or T < blocks * 40:
        return {"pbo": None, "k": K, "splits": 0}
    edges = np.linspace(0, T, blocks + 1).astype(int)
    s1 = np.stack([R[a:b].sum(axis=0) for a, b in zip(edges[:-1], edges[1:])])  # S x K
    s2 = np.stack([(R[a:b] ** 2).sum(axis=0) for a, b in zip(edges[:-1], edges[1:])])
    n = np.diff(edges)
    logits = []
    all_idx = np.arange(blocks)
    for is_idx in combinations(all_idx, blocks // 2):
        is_idx = np.array(is_idx)
        oos_idx = np.setdiff1d(all_idx, is_idx)

        def sr(ix):
            m = s1[ix].sum(0) / n[ix].sum()
            v = s2[ix].sum(0) / n[ix].sum() - m ** 2
            return m / np.sqrt(np.maximum(v, 1e-18))

        best = int(np.argmax(sr(is_idx)))
        oos = sr(oos_idx)
        rank = (oos < oos[best]).sum() + 0.5 * ((oos == oos[best]).sum() - 1) + 1
        w = rank / (K + 1)
        logits.append(np.log(w / (1 - w)))
    logits = np.array(logits)
    return {"pbo": float((logits <= 0).mean()), "k": K, "splits": len(logits),
            "logit_median": float(np.median(logits))}
