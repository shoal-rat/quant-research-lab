"""Event-accurate daily simulator.

Timeline for a rebalance decided on row ``i`` (after the close of day i):

    close(i) ── decide ──> open(i+1): trade to target ──> close(i+1)
      old weights earn the overnight gap; new weights earn the intraday leg.

With ``execution='close'`` the trade happens at close(i+1) instead, so the old
book earns all of day i+1. Either way no position ever earns a return that was
known when the signal was formed.

Accounting is in weights (fraction of NAV): positions drift with prices between
rebalances, cash (1 - sum w) earns the T-bill rate, shorts pay a borrow fee, and
every trade pays spread + fees + square-root impact sized at ``capital``.
A name whose data ends while held is closed at its last price minus a haircut.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from ..data.panel import Panel
from ..portfolio.construct import Book
from .costs import CostModel, CostParams


@dataclass
class BacktestResult:
    returns: pd.Series  # net daily return (incl. cash yield)
    gross: pd.Series  # before trading costs & borrow
    costs: pd.Series  # trading costs, fraction of NAV
    borrow: pd.Series
    rf: pd.Series
    turnover: pd.Series  # one-way turnover per day (sum|trade|/2)
    long_exp: pd.Series
    short_exp: pd.Series
    trades: dict[int, np.ndarray] = field(default_factory=dict)  # row -> trade weights
    names: pd.Series | None = None
    start: int = 0

    @property
    def excess(self) -> pd.Series:
        return self.returns - self.rf

    def window(self, a: int, b: int) -> "BacktestResult":
        sl = slice(a, b)
        return BacktestResult(self.returns.iloc[sl], self.gross.iloc[sl], self.costs.iloc[sl],
                              self.borrow.iloc[sl], self.rf.iloc[sl], self.turnover.iloc[sl],
                              self.long_exp.iloc[sl], self.short_exp.iloc[sl],
                              {k: v for k, v in self.trades.items() if a <= k < b}, None, a)


def simulate(panel: Panel, book: Book, costs: CostModel | None = None,
             delist_haircut: float = 0.05) -> BacktestResult:
    costs = costs or CostModel.build(panel)
    T, N = panel.T, panel.N
    R = np.nan_to_num(panel.returns.to_numpy(dtype=float))
    O = panel.overnight.to_numpy(dtype=float)
    D = panel.intraday.to_numpy(dtype=float)
    rf = panel.rf_daily.to_numpy(dtype=float)
    closes = panel.close.to_numpy(dtype=float)
    last_valid = np.array([
        (np.flatnonzero(np.isfinite(closes[:, k]))[-1] if np.isfinite(closes[:, k]).any() else -1)
        for k in range(N)
    ])
    execute_open = book.spec.execution == "open"
    nav = costs.params.capital

    out_net = np.zeros(T)
    out_gross = np.zeros(T)
    out_cost = np.zeros(T)
    out_borrow = np.zeros(T)
    out_to = np.zeros(T)
    out_long = np.zeros(T)
    out_short = np.zeros(T)
    trades: dict[int, np.ndarray] = {}

    h = np.zeros(N)
    first = min(book.targets) if book.targets else T
    for j in range(first + 1, T):
        target = book.targets.get(j - 1)
        # delisting: position still open the day after the last print
        dead = (last_valid < j) & (h != 0)
        haircut = 0.0
        if dead.any():
            haircut = -float(np.sum(np.abs(h[dead]))) * delist_haircut
            h = np.where(dead, 0.0, h)

        borrow = float(np.sum(np.maximum(-h, 0.0) * costs.borrow_row(j))) / 252.0
        if target is not None:
            target = np.where(last_valid >= j, target, 0.0)
            if execute_open:
                o = np.nan_to_num(O[j])
                d = np.where(np.isfinite(D[j]), D[j], R[j])
                g_on = float(h @ o)
                h_open = h * (1.0 + o) / (1.0 + g_on) if abs(1.0 + g_on) > 1e-9 else h
                trade = target - h_open
                c, _, _ = costs.trade_cost(j - 1, trade, nav)
                g_id = float(target @ d)
                cash = 1.0 - float(target.sum())
                gross_ret = (1.0 + g_on) * (1.0 + g_id + cash * rf[j]) - 1.0
                net = (1.0 + g_on) * (1.0 - c) * (1.0 + g_id + cash * rf[j]) - 1.0 - borrow + haircut
                h = target * (1.0 + d) / (1.0 + g_id + cash * rf[j])
            else:
                g = float(h @ R[j])
                cash = 1.0 - float(h.sum())
                h_close = h * (1.0 + R[j]) / (1.0 + g + cash * rf[j])
                trade = target - h_close
                c, _, _ = costs.trade_cost(j - 1, trade, nav)
                gross_ret = g + cash * rf[j]
                net = gross_ret - c - borrow + haircut
                h = target.copy()
            trades[j] = trade
            out_cost[j] = c
            out_to[j] = float(np.abs(trade).sum()) / 2.0
        else:
            g = float(h @ R[j])
            cash = 1.0 - float(h.sum())
            gross_ret = g + cash * rf[j]
            net = gross_ret - borrow + haircut
            denom = 1.0 + gross_ret
            h = h * (1.0 + R[j]) / denom if abs(denom) > 1e-9 else h
        out_gross[j] = gross_ret
        out_net[j] = net
        out_borrow[j] = borrow
        out_long[j] = float(np.sum(np.maximum(h, 0)))
        out_short[j] = float(np.sum(np.maximum(-h, 0)))

    idx = panel.dates
    s = lambda a: pd.Series(a, index=idx).iloc[first + 1:]  # noqa: E731
    return BacktestResult(s(out_net), s(out_gross), s(out_cost), s(out_borrow),
                          pd.Series(rf, index=idx).iloc[first + 1:], s(out_to), s(out_long),
                          s(out_short), trades, pd.Series(book.names_held), first + 1)


def capacity_curve(panel: Panel, res: BacktestResult, costs: CostModel,
                   levels=(1e5, 1e6, 1e7, 1e8, 1e9), mask=None) -> list[dict]:
    """Net Sharpe as capital grows (holdings path held fixed; impact re-sized).

    ``mask`` restricts the Sharpe to a date subset (the research region), so the
    capacity read never peeks into the lockbox.
    """
    out = []
    base_cost = res.costs
    for cap in levels:
        p = CostParams(**{**costs.params.__dict__, "capital": cap})
        cm = CostModel(costs.half_spread, costs.sigma, costs.adv, costs.borrow, p)
        c = pd.Series(0.0, index=res.returns.index)
        for j, tr in res.trades.items():
            c.iloc[j - res.start] = cm.trade_cost(j - 1, tr, cap)[0]
        net = res.returns + base_cost - c
        ex = net - res.rf
        if mask is not None:
            ex, c = ex[mask], c[mask]
        sr = float(ex.mean() / ex.std() * np.sqrt(252)) if ex.std() > 0 else 0.0
        out.append({"capital": cap, "sharpe": sr, "cost_bps_year": float(c.mean() * 252 * 1e4)})
    return out
