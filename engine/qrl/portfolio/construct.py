"""Score -> target weights ("the book").

The formula only ranks; this module decides positions, identically for every
candidate so that results are comparable:

1. mask to the names tradable at t;
2. optional EMA smoothing of the score (turnover control);
3. winsorize (median +/- 3 MAD), neutralize (market or sector/asset-class
   demeaning), z-score;
4. size the book:

   * ``long_short`` — dollar-neutral factor book (long leg +1, short leg -1),
     weights proportional to the z-score: the cleanest read of the alpha.
   * ``long_only``  — top-quantile basket, fully invested, capped weights:
     what a cash account can actually hold.
   * ``time_series`` — each asset long/short (or long/flat) by its own signal,
     sized to equal risk, then scaled to a portfolio volatility target
     (Moskowitz-Ooi-Pedersen 2012 style trend books).

5. volatility targeting uses ex-ante vol from the trailing 63-day return
   history of the proposed weights, with a gross-leverage cap.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

import numpy as np
import pandas as pd

from ..data.panel import Panel


@dataclass
class BookSpec:
    mode: str = "long_short"  # long_short | long_only | time_series
    neutralize: str = "group"  # none | market | group
    rebalance: int = 5  # trading days between rebalances
    smooth: int = 0  # EMA half-life applied to the score (0 = off)
    quantile: float = 0.2  # long_only: fraction of names held
    max_weight: float = 0.05  # per-name cap (fraction of NAV / of leg)
    target_vol: float | None = 0.10  # annualized; None = no vol targeting
    max_gross: float = 3.0
    allow_short: bool = False  # time_series: long/short instead of long/flat
    execution: str = "open"  # trade at next open | next close

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def default_for(cls, kind: str, mode: str | None = None) -> "BookSpec":
        if kind == "multi_asset":
            mode = mode or "time_series"
            if mode == "time_series":
                return cls(mode=mode, neutralize="none", rebalance=5, target_vol=0.10,
                           max_gross=1.0, max_weight=0.35)
            return cls(mode=mode, neutralize="none", rebalance=21, quantile=0.3,
                       max_weight=0.35, target_vol=None, max_gross=1.0)
        mode = mode or "long_short"
        if mode == "long_only":
            return cls(mode=mode, neutralize="group", rebalance=21, quantile=0.2,
                       max_weight=0.03, target_vol=None, max_gross=1.0)
        return cls(mode=mode, neutralize="group", rebalance=5, target_vol=0.10, max_gross=3.0)


def prepare_scores(score: pd.DataFrame, panel: Panel, spec: BookSpec) -> pd.DataFrame:
    s = score.where(panel.tradable)
    if spec.smooth and spec.smooth > 0:
        s = s.ewm(halflife=spec.smooth, min_periods=1, ignore_na=True).mean().where(panel.tradable)
    if spec.mode == "time_series":
        # Normalize each asset's score by its own trailing dispersion so that
        # formulas with different units map to comparable conviction in [-1, 1].
        # Scale each asset's score by its own trailing root-mean-square so that
        # formulas in different units map to comparable conviction in [-1, 1].
        # RMS (not std) keeps level signals such as inverse volatility or an
        # always-on "1" meaningful instead of dividing by ~zero dispersion.
        rms = np.sqrt((s ** 2).rolling(252, min_periods=63).mean())
        return (s / rms.where(rms > 1e-12)).clip(-2, 2) / 2.0
    x = s.to_numpy(dtype=float)
    med = np.nanmedian(x, axis=1, keepdims=True)
    mad = np.nanmedian(np.abs(x - med), axis=1, keepdims=True) * 1.4826
    # rows with zero dispersion (e.g. a constant score) are left unclipped
    x = np.where(mad > 0, np.clip(x, med - 3 * mad, med + 3 * mad), x)
    if spec.neutralize == "group":
        codes = panel.group_codes()
        for g in np.unique(codes):
            cols = codes == g
            sub = x[:, cols]
            with np.errstate(all="ignore"):
                cnt = np.sum(np.isfinite(sub), axis=1, keepdims=True)
                mu = np.where(cnt >= 3, np.nanmean(np.where(np.isfinite(sub), sub, np.nan), axis=1, keepdims=True), np.nan)
            # tiny groups cannot be neutralized; fall back to market demeaning later
            x[:, cols] = np.where(np.isfinite(mu), sub - mu, sub)
    with np.errstate(all="ignore"):
        mu = np.nanmean(x, axis=1, keepdims=True)
        sd = np.nanstd(x, axis=1, keepdims=True)
    z = np.where(sd > 0, (x - mu) / np.where(sd > 0, sd, 1.0), np.where(np.isfinite(x), 0.0, np.nan))
    return pd.DataFrame(z, index=score.index, columns=score.columns)


@dataclass
class Book:
    """Target weights on rebalance rows (row index into the panel)."""
    targets: dict[int, np.ndarray]
    spec: BookSpec
    names_held: dict[int, int] = field(default_factory=dict)


def build_book(score: pd.DataFrame, panel: Panel, spec: BookSpec,
               start: int = 0, end: int | None = None) -> Book:
    z = prepare_scores(score, panel, spec).to_numpy(dtype=float)
    R = panel.returns.to_numpy(dtype=float)
    end = panel.T - 1 if end is None else end
    targets: dict[int, np.ndarray] = {}
    held: dict[int, int] = {}
    N = panel.N
    first = max(start, 63)
    for i in range(first, end + 1):
        if (i - first) % spec.rebalance != 0:
            continue
        zi = z[i]
        ok = np.isfinite(zi)
        w = np.zeros(N)
        if spec.mode == "long_short":
            if ok.sum() >= 20:
                zz = np.where(ok, zi, 0.0)
                zz = zz - zz[ok].mean()
                gross = np.abs(zz).sum()
                if gross > 0:
                    w = zz / (gross / 2.0)  # long leg +1, short leg -1
                    cap = spec.max_weight
                    w = np.clip(w, -cap, cap)
        elif spec.mode == "long_only":
            n_ok = int(ok.sum())
            k = max(int(round(n_ok * spec.quantile)), min(n_ok, 5))
            if n_ok >= 5:
                zz = np.where(ok, zi, -np.inf)
                top = np.argpartition(-zz, k - 1)[:k]
                w[top] = 1.0 / k
                w = _cap_and_normalize(w, spec.max_weight)
        else:  # time_series
            pos = np.where(ok, zi, 0.0)
            if not spec.allow_short:
                pos = np.maximum(pos, 0.0)
            hist = R[max(0, i - 62): i + 1]
            vol = np.nanstd(hist, axis=0) * np.sqrt(252)
            vol = np.where(np.isfinite(vol) & (vol > 0.01), vol, np.nan)
            n_act = max(1, int(np.sum(np.abs(pos) > 0)))
            per_asset = (spec.target_vol or 0.10) / np.sqrt(n_act)
            w = np.where(np.isfinite(vol), pos * per_asset / vol, 0.0)
            w = np.clip(w, -spec.max_weight * 3, spec.max_weight * 3)
        if spec.target_vol and np.abs(w).sum() > 0:
            hist = np.nan_to_num(R[max(0, i - 62): i + 1])
            pv = np.std(hist @ w) * np.sqrt(252)
            scale = spec.target_vol / pv if pv > 1e-6 else 1.0
            gross = np.abs(w).sum()
            scale = min(scale, spec.max_gross / gross)
            w = w * scale
        elif np.abs(w).sum() > spec.max_gross:
            w = w * spec.max_gross / np.abs(w).sum()
        targets[i] = w
        held[i] = int(np.sum(np.abs(w) > 1e-6))
    return Book(targets, spec, held)


def _cap_and_normalize(w: np.ndarray, cap: float, iters: int = 20) -> np.ndarray:
    """Water-fill: cap weights at ``cap`` and redistribute the excess pro rata."""
    w = w.copy()
    for _ in range(iters):
        s = w.sum()
        if s <= 0:
            return w
        w = w / s
        over = w > cap + 1e-12
        if not over.any():
            return w
        excess = (w[over] - cap).sum()
        w[over] = cap
        free = (w > 0) & ~over
        if not free.any():
            return w
        w[free] += excess * w[free] / w[free].sum()
    return w
