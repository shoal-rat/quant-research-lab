"""Genetic-programming alpha miner (fitness on the TRAIN region only).

Trees are nested lists rendered to the DSL, so every mined formula is a normal,
readable expression that faces exactly the same gate as a human idea. Each
fitness evaluation is counted as a "shadow pull" and feeds the Deflated-Sharpe
denominator — mining is not free.
"""
from __future__ import annotations

import random

import numpy as np

from ..alpha.dsl import Context, DSLError, evaluate, parse
from ..backtest.costs import CostModel
from ..backtest.engine import simulate
from ..data.panel import load_panel
from ..portfolio.construct import BookSpec, build_book, prepare_scores
from ..stats.ic import forward_returns, rank_ic_series, signal_autocorr
from ..stats.inference import hac_tstat
from ..stats.metrics import sharpe

LEAVES_CS = [
    lambda r: f"mom({r.choice([63, 126, 252])}, {r.choice([5, 21])})",
    lambda r: f"resid_mom({r.choice([126, 252])}, 21)",
    lambda r: f"rev({r.choice([5, 10, 21])})",
    lambda r: f"vol({r.choice([21, 63, 252])})",
    lambda r: f"idio_vol({r.choice([63, 126])})",
    lambda r: f"beta({r.choice([126, 252])})",
    lambda r: f"high52({r.choice([126, 252])})",
    lambda r: f"maxret({r.choice([21, 63])})",
    lambda r: f"amihud({r.choice([21, 63])})",
    lambda r: f"abn_volume({r.choice([5, 21])})",
    lambda r: f"range_vol({r.choice([21, 63])})",
    lambda r: f"drawdown({r.choice([63, 252])})",
    lambda r: f"overnight_ret({r.choice([63, 252])})",
    lambda r: f"intraday_ret({r.choice([63, 252])})",
    lambda r: f"seasonal({r.choice([5, 10])})",
    lambda r: f"trend({r.choice([50, 100, 200])})",
    lambda r: f"ts_skew(returns, {r.choice([21, 63])})",
    lambda r: f"ts_corr(returns, market, {r.choice([63, 126])})",
]
LEAVES_TS = [
    lambda r: f"tsmom({r.choice([21, 63, 126, 252])})",
    lambda r: f"trend({r.choice([50, 100, 200])})",
    lambda r: f"mom({r.choice([63, 126, 252])}, {r.choice([0, 5, 21])})",
    lambda r: f"inv(vol({r.choice([21, 63])}))",
    lambda r: f"drawdown({r.choice([63, 252])})",
    lambda r: f"-vol({r.choice([21, 63])})",
    lambda r: f"ts_zscore(close, {r.choice([63, 126, 252])})",
]
UNARY = [("rank", None), ("zscore", None), ("neg", None), ("ts_decay", [3, 5, 10]),
         ("ts_mean", [5, 10, 21]), ("ts_zscore", [63, 126]), ("sign", None)]
BINARY = ["+", "-", "*", "max", "min"]


def render(t) -> str:
    if isinstance(t, str):
        return t
    op = t[0]
    if op in ("+", "-", "*"):
        return f"({render(t[1])} {op} {render(t[2])})"
    if op in ("max", "min"):
        return f"{op}({render(t[1])}, {render(t[2])})"
    if op == "neg":
        return f"-{render(t[1])}"
    if op in ("rank", "zscore", "sign"):
        return f"{op}({render(t[1])})"
    return f"{op}({render(t[2])}, {t[1]})"  # windowed unary: [op, w, child]


def random_tree(r: random.Random, depth: int, ts: bool):
    leaves = LEAVES_TS if ts else LEAVES_CS
    if depth <= 0 or r.random() < 0.35:
        return r.choice(leaves)(r)
    if r.random() < 0.55:
        op, ws = r.choice([u for u in UNARY if not (ts and u[0] in ("rank", "zscore"))])
        child = random_tree(r, depth - 1, ts)
        return [op, r.choice(ws), child] if ws else [op, child]
    op = r.choice(BINARY)
    a, c = random_tree(r, depth - 1, ts), random_tree(r, depth - 1, ts)
    if not ts and op in ("+", "-"):
        a, c = ["rank", a], ["rank", c]  # add ranks, not raw units
    return [op, a, c]


def _paths(t, path=()):
    yield path
    if isinstance(t, list):
        start = 2 if (len(t) == 3 and isinstance(t[1], int)) else 1
        for i in range(start, len(t)):
            yield from _paths(t[i], path + (i,))


def _get(t, path):
    for i in path:
        t = t[i]
    return t


def _set(t, path, v):
    if not path:
        return v
    t = _copy(t)
    node = t
    for i in path[:-1]:
        node = node[i]
    node[path[-1]] = v
    return t


def _copy(t):
    return [_copy(x) if isinstance(x, list) else x for x in t] if isinstance(t, list) else t


def crossover(r, a, b):
    pa = r.choice(list(_paths(a)))
    pb = r.choice(list(_paths(b)))
    return _set(a, pa, _copy(_get(b, pb)))


def mutate(r, t, ts):
    p = r.choice(list(_paths(t)))
    return _set(t, p, random_tree(r, 2, ts))


class Miner:
    def __init__(self, universe: str, mode: str, seed: int | None = None):
        self.panel = load_panel(universe)
        self.universe = universe
        self.ts = mode == "time_series"
        self.mode = mode
        self.spec = BookSpec.default_for(self.panel.kind, mode)
        self.r = random.Random(seed)
        T = self.panel.T
        self.train_end = int((T - 504) * 0.7)
        self.ctx = Context(self.panel)
        self.evals = 0
        if not self.ts:
            self.fwd = forward_returns(self.panel, 5)
        self.costs = CostModel.build(self.panel) if self.panel.kind == "multi_asset" else None

    def fitness(self, tree) -> float:
        expr = render(tree)
        try:
            a = parse(expr)
            s = evaluate(a, self.ctx)
        except (DSLError, ValueError, ZeroDivisionError, TypeError):
            return -9.0
        self.evals += 1
        rows = slice(260, self.train_end)
        if self.ts or self.panel.kind == "multi_asset":
            book = build_book(s, self.panel, self.spec, end=self.train_end)
            if not book.targets:
                return -9.0
            res = simulate(self.panel, book, self.costs)
            f = sharpe(res.excess.iloc[: self.train_end - min(book.targets)])
        else:
            z = prepare_scores(s, self.panel, self.spec)
            ic = rank_ic_series(z, self.fwd).iloc[rows].dropna()
            if len(ic) < 200:
                return -9.0
            t, _ = hac_tstat(ic.to_numpy()[::5], lags=4)
            ac = signal_autocorr(z.iloc[rows], lag=5)
            f = t / 4.0 - 0.6 * max(0.0, 0.8 - ac)  # fast signals die on costs
        return float(f - 0.012 * a.nodes)

    def run(self, pop: int = 14, gens: int = 3, seeds: list[str] | None = None, on_progress=None) -> dict:
        r = self.r
        popn = [random_tree(r, 2, self.ts) for _ in range(pop - len(seeds or []))] + list(seeds or [])
        scored = []
        for g in range(gens):
            scored = sorted(((self.fitness(t), t) for t in popn), key=lambda x: -x[0])
            if on_progress:
                on_progress(g, scored[0][0], render(scored[0][1]))
            elite = [t for _, t in scored[: max(2, pop // 4)]]
            nxt = list(elite)
            while len(nxt) < pop:
                a = max(r.sample(scored, 3), key=lambda x: x[0])[1]
                if r.random() < 0.6:
                    b = max(r.sample(scored, 3), key=lambda x: x[0])[1]
                    child = crossover(r, a, b)
                else:
                    child = mutate(r, a, self.ts)
                try:
                    if parse(render(child)).nodes <= 30:
                        nxt.append(child)
                except DSLError:
                    continue
            popn = nxt
        best_f, best = scored[0]
        return {"expr": render(best), "fitness": best_f, "evals": self.evals}
