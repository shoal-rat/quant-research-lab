"""Transaction-cost model (all estimates point-in-time: row t uses data <= t).

cost of trading notional Q in name i on day t, as a fraction of Q:

    fees         = fee_bps                                      (Alpaca: $0 commission;
                                                                 SEC/TAF fees ~0.3 bp)
    half-spread  = k * sigma_it / sqrt(ADV_it / $1M), floored at 1 bp (stocks)
                   or 0.5 bp (ETFs). Spreads scale with volatility and inversely
                   with liquidity (the invariance-style relation of Kyle &
                   Obizhaeva 2016); k = 0.15 puts mega-caps at the ~1 bp floor
                   and a $50M-ADV member near 5 bp, widening 2-3x in 2008/2020.
                   (Low-frequency estimators such as Abdi-Ranaldo were tried and
                   rejected: for large caps they swing between 0 and 100 bp.)
    impact       = Y * sigma_it * sqrt(Q / ADV_it)               (square-root law,
                                                                 Toth et al. 2011; Y = 0.7)

Short positions pay a borrow fee (annual): 0.3% general collateral, 3% for
hard-to-borrow proxies (high vol or thin ADV), 0.5% for ETFs.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from ..data.panel import Panel


@dataclass
class CostParams:
    fee_bps: float = 0.3
    spread_k: float = 0.15
    half_spread_floor_bps: float = 1.0  # stocks; ETFs use half of this
    half_spread_cap_bps: float = 75.0
    impact_y: float = 0.7
    borrow_gc: float = 0.003
    borrow_htb: float = 0.03
    borrow_etf: float = 0.005
    capital: float = 1_000_000.0
    enabled: bool = True


@dataclass
class CostModel:
    half_spread: pd.DataFrame  # fraction
    sigma: pd.DataFrame  # daily vol
    adv: pd.DataFrame  # $ ADV
    borrow: pd.DataFrame  # annual fee for shorts
    params: CostParams

    def __post_init__(self):
        self._hs = self.half_spread.to_numpy(dtype=float)
        self._sig = self.sigma.to_numpy(dtype=float)
        self._adv = self.adv.to_numpy(dtype=float)
        self._borrow = self.borrow.to_numpy(dtype=float)

    def borrow_row(self, i: int) -> np.ndarray:
        return self._borrow[i]

    @classmethod
    def build(cls, p: Panel, params: CostParams | None = None) -> "CostModel":
        params = params or CostParams()
        sigma = p.returns.ewm(halflife=21, min_periods=10).std().fillna(0.02)  # no bfill: that would peek ahead
        adv = p.adv.ffill()
        if p.kind == "multi_asset":
            adv = adv.fillna(5e8)
            borrow = pd.DataFrame(params.borrow_etf, index=p.dates, columns=p.tickers)
        else:
            adv = adv.fillna(adv.median(axis=1).median())
            htb = (sigma * np.sqrt(252) > 0.6) | (adv < 2e7)
            borrow = pd.DataFrame(np.where(htb, params.borrow_htb, params.borrow_gc),
                                  index=p.dates, columns=p.tickers)
        floor = params.half_spread_floor_bps / 1e4 * (0.5 if p.kind == "multi_asset" else 1.0)
        half = params.spread_k * sigma / np.sqrt(adv / 1e6)
        half = half.clip(lower=floor, upper=params.half_spread_cap_bps / 1e4).fillna(5 * floor)
        return cls(half, sigma, adv, borrow, params)

    def trade_cost(self, i: int, trade: np.ndarray, nav: float) -> tuple[float, float, float]:
        """Cost (fraction of NAV) of trading weight vector ``trade`` on row ``i``.

        Returns (total, spread+fees part, impact part).
        """
        if not self.params.enabled:
            return 0.0, 0.0, 0.0
        q = np.abs(trade)
        if not q.any():
            return 0.0, 0.0, 0.0
        hs, sig, adv = self._hs[i], self._sig[i], self._adv[i]
        lin = float(np.nansum(q * (hs + self.params.fee_bps / 1e4)))
        part = np.sqrt(np.where(adv > 0, q * nav / adv, 0.0))
        imp = float(np.nansum(q * self.params.impact_y * sig * part))
        return lin + imp, lin, imp
