"""The alpha expression language.

An alpha is a plain expression such as::

    rank(resid_mom(252, 21)) - 0.5 * rank(vol(63))
    ts_decay(-ts_corr(rank(volume), rank(close), 10), 5)
    where(close > ts_mean(close, 200), tsmom(252), 0)

It is parsed with Python's ``ast`` into a whitelisted tree (no attribute access,
no names other than the terminals below, integer window literals only), so an
LLM or the genetic miner can author formulas without being able to run code.

The expression produces a raw T x N score. The *portfolio constructor* (not the
formula) decides how scores become positions: masking to the tradable universe,
winsorizing, neutralizing, and sizing all happen there, so every formula is
judged through the same pipeline.
"""
from __future__ import annotations

import ast
from dataclasses import dataclass, field
from functools import cached_property

import numpy as np
import pandas as pd

from ..data.panel import Panel
from . import ops

MAX_WINDOW = 1260
MAX_NODES = 48
MAX_DEPTH = 9

# name -> (callable, arg kinds). Kinds: x = sub-expression, w = window literal,
# n = numeric literal. Group ops receive the panel's sector/asset-class codes.
FUNCS: dict[str, tuple] = {
    # elementwise
    "abs": (ops.op_abs, "x"), "log": (ops.op_log, "x"), "sign": (ops.op_sign, "x"),
    "sqrt": (ops.op_sqrt, "x"), "inv": (ops.op_inv, "x"),
    "signed_power": (ops.op_signed_power, "xn"), "max": (ops.op_max, "xx"),
    "min": (ops.op_min, "xx"), "clip": (ops.op_clip, "xnn"), "where": (ops.op_where, "xxx"),
    # time series (trailing)
    "delay": (ops.ts_delay, "xw"), "delta": (ops.ts_delta, "xw"), "pct_change": (ops.ts_pct, "xw"),
    "ts_mean": (ops.ts_mean, "xw"), "ts_sum": (ops.ts_sum, "xw"), "ts_std": (ops.ts_std, "xw"),
    "ts_min": (ops.ts_min, "xw"), "ts_max": (ops.ts_max, "xw"), "ts_median": (ops.ts_median, "xw"),
    "ts_skew": (ops.ts_skew, "xw"), "ts_kurt": (ops.ts_kurt, "xw"), "ts_rank": (ops.ts_rank, "xw"),
    "ts_zscore": (ops.ts_zscore, "xw"), "ts_ema": (ops.ts_ema, "xw"), "ts_decay": (ops.ts_decay, "xw"),
    "ts_argmax": (ops.ts_argmax, "xw"), "ts_argmin": (ops.ts_argmin, "xw"),
    "ts_corr": (ops.ts_corr, "xxw"), "ts_cov": (ops.ts_cov, "xxw"), "ts_beta": (ops.ts_beta, "xxw"),
    "ts_resid": (ops.ts_resid, "xxw"),
    # cross section (within the tradable universe of each day)
    "rank": (ops.cs_rank, "x"), "zscore": (ops.cs_zscore, "x"), "demean": (ops.cs_demean, "x"),
    "winsorize": (ops.cs_winsorize, "x"), "scale": (ops.cs_scale, "x"),
    "neutralize": (ops.cs_neutralize, "xx"),
    "group_demean": (ops.group_demean, "xG"), "group_rank": (ops.group_rank, "xG"),
    "group_zscore": (ops.group_zscore, "xG"),
}
CS_FUNCS = {"rank", "zscore", "demean", "winsorize", "scale", "neutralize",
            "group_demean", "group_rank", "group_zscore"}

TERMINALS = {
    "open", "high", "low", "close", "volume", "vwap", "returns", "dollar_volume",
    "overnight", "intraday", "market",
}

# Economically-named building blocks. Each is defined only from trailing data.
MACROS: dict[str, str] = {
    "mom": "ws",        # mom(lookback, skip): price momentum skipping the last `skip` days
    "rev": "w",         # rev(d): short-term reversal = -return over d days
    "vol": "w",         # vol(d): annualized realized volatility
    "beta": "w",        # beta(d): market beta
    "idio_vol": "w",    # idio_vol(d): residual volatility vs the market
    "resid_mom": "ws",  # resid_mom(lb, skip): market-residual momentum / residual vol
    "high52": "w",      # high52(d): close / trailing max close (George-Hwang)
    "amihud": "w",      # amihud(d): mean |r| per $ traded (x1e9)
    "maxret": "w",      # maxret(d): largest daily return (lottery demand)
    "seasonal": "w",    # seasonal(years): same-calendar-month return in prior years
    "trend": "w",       # trend(d): close / MA(d) - 1
    "tsmom": "w",       # tsmom(d): d-day return scaled by 63d vol
    "overnight_ret": "w",  # overnight_ret(d): cumulative close->open return
    "intraday_ret": "w",   # intraday_ret(d): cumulative open->close return
    "abn_volume": "w",  # abn_volume(d): d-day avg volume / 252-day avg volume
    "range_vol": "w",   # range_vol(d): Parkinson high-low volatility
    "drawdown": "w",    # drawdown(d): distance below trailing max
}


class DSLError(ValueError):
    pass


# ------------------------------------------------------------------- parsing
@dataclass
class Alpha:
    source: str
    tree: ast.Expression

    @cached_property
    def canonical(self) -> str:
        return ast.unparse(self.tree.body)

    @cached_property
    def nodes(self) -> int:
        return sum(1 for n in ast.walk(self.tree.body) if isinstance(n, (ast.Call, ast.Name, ast.BinOp, ast.UnaryOp, ast.Compare)))

    @cached_property
    def depth(self) -> int:
        def d(n):
            kids = [c for c in ast.iter_child_nodes(n) if not isinstance(c, (ast.operator, ast.unaryop, ast.cmpop, ast.expr_context))]
            return 1 + max((d(c) for c in kids), default=0)
        return d(self.tree.body)

    @cached_property
    def max_window(self) -> int:
        return max(walk_windows(self.tree.body), default=1)

    @property
    def complexity(self) -> float:
        """Parsimony score: node count plus a mild penalty for long look-backs."""
        return self.nodes + np.log1p(self.max_window) / 2

    def uses(self) -> set[str]:
        out = set()
        for n in ast.walk(self.tree.body):
            if isinstance(n, ast.Call) and isinstance(n.func, ast.Name):
                out.add(n.func.id)
            elif isinstance(n, ast.Name):
                out.add(n.id)
        return out


def walk_windows(node) -> list[int]:
    ws = []
    for n in ast.walk(node):
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name):
            kinds = FUNCS.get(n.func.id, (None, MACROS.get(n.func.id, "")))[1]
            for a, k in zip(n.args, kinds):
                if k == "w" and isinstance(a, ast.Constant):
                    ws.append(int(a.value))
    # macros with implicit long look-backs
    return ws


def parse(src: str) -> Alpha:
    src = (src or "").strip()
    if not src or len(src) > 600:
        raise DSLError("expression empty or too long")
    try:
        tree = ast.parse(src, mode="eval")
    except SyntaxError as e:
        raise DSLError(f"syntax error: {e.msg}") from None
    _validate(tree.body)
    a = Alpha(src, tree)
    if a.nodes > MAX_NODES:
        raise DSLError(f"too complex: {a.nodes} nodes (max {MAX_NODES})")
    if a.depth > MAX_DEPTH:
        raise DSLError(f"too deep: depth {a.depth} (max {MAX_DEPTH})")
    return a


def _num(node) -> float | None:
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
        return float(node.value)
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        v = _num(node.operand)
        return None if v is None else -v
    return None


def _validate(node) -> None:
    if isinstance(node, ast.Constant):
        if _num(node) is None:
            raise DSLError("only numeric constants are allowed")
        return
    if isinstance(node, ast.Name):
        if node.id not in TERMINALS:
            raise DSLError(f"unknown name '{node.id}' (terminals: {', '.join(sorted(TERMINALS))})")
        return
    if isinstance(node, ast.UnaryOp):
        if not isinstance(node.op, (ast.USub, ast.UAdd)):
            raise DSLError("only unary +/- allowed")
        return _validate(node.operand)
    if isinstance(node, ast.BinOp):
        if not isinstance(node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow)):
            raise DSLError("only + - * / ** allowed")
        if isinstance(node.op, ast.Pow) and _num(node.right) is None:
            raise DSLError("exponent must be a number")
        _validate(node.left)
        return _validate(node.right)
    if isinstance(node, ast.Compare):
        if len(node.ops) != 1 or not isinstance(node.ops[0], (ast.Gt, ast.Lt, ast.GtE, ast.LtE)):
            raise DSLError("comparisons must be a single > < >= <=")
        _validate(node.left)
        return _validate(node.comparators[0])
    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name) or node.keywords:
            raise DSLError("calls must be plain function(args)")
        name = node.func.id
        if name in FUNCS:
            kinds = FUNCS[name][1].replace("G", "")
        elif name in MACROS:
            kinds = MACROS[name]
        else:
            raise DSLError(f"unknown function '{name}'")
        if len(node.args) != len(kinds):
            raise DSLError(f"{name}() takes {len(kinds)} argument(s)")
        for a, k in zip(node.args, kinds):
            if k == "x":
                _validate(a)
            elif k in ("w", "s"):
                v = _num(a)
                lo = 1 if k == "w" else 0  # "s" = a skip/lag that may be zero
                if v is None or v != int(v) or not (lo <= v <= MAX_WINDOW):
                    raise DSLError(f"{name}(): window must be an integer literal in {lo}..{MAX_WINDOW}")
            elif k == "n":
                if _num(a) is None:
                    raise DSLError(f"{name}(): expected a numeric literal")
        return
    raise DSLError(f"unsupported syntax: {type(node).__name__}")


# ---------------------------------------------------------------- evaluation
@dataclass
class Context:
    panel: Panel
    memo: dict = field(default_factory=dict)

    @cached_property
    def codes(self) -> np.ndarray:
        return self.panel.group_codes()

    @cached_property
    def mask(self) -> pd.DataFrame:
        return self.panel.tradable

    @cached_property
    def market(self) -> pd.DataFrame:
        p = self.panel
        return pd.DataFrame(np.repeat(p.bench_returns.to_numpy()[:, None], p.N, axis=1),
                            index=p.dates, columns=p.tickers)

    def terminal(self, name: str) -> pd.DataFrame:
        p = self.panel
        if name == "returns":
            return p.returns
        if name == "vwap":
            return (p.high + p.low + p.close) / 3.0
        if name == "dollar_volume":
            return p.dollar_volume
        if name == "market":
            return self.market
        if name in ("overnight", "intraday"):
            return getattr(p, name)
        return getattr(p, name)


def evaluate(alpha: Alpha | str, ctx: Context) -> pd.DataFrame:
    if isinstance(alpha, str):
        alpha = parse(alpha)
    out = _ev(alpha.tree.body, ctx)
    if not isinstance(out, pd.DataFrame):
        raise DSLError("expression is constant — it must reference market data")
    return ops._clean(out).astype(float)


def _ev(node, ctx: Context):
    key = ast.dump(node)
    if key in ctx.memo:
        return ctx.memo[key]
    v = _ev_raw(node, ctx)
    if isinstance(v, pd.DataFrame):
        ctx.memo[key] = v
    return v


def _ev_raw(node, ctx: Context):
    num = _num(node)
    if num is not None:
        return num
    if isinstance(node, ast.Name):
        return ctx.terminal(node.id)
    if isinstance(node, ast.UnaryOp):
        v = _ev(node.operand, ctx)
        return -v if isinstance(node.op, ast.USub) else v
    if isinstance(node, ast.BinOp):
        a, b = _ev(node.left, ctx), _ev(node.right, ctx)
        if isinstance(node.op, ast.Add):
            r = a + b
        elif isinstance(node.op, ast.Sub):
            r = a - b
        elif isinstance(node.op, ast.Mult):
            r = a * b
        elif isinstance(node.op, ast.Div):
            r = a / b if isinstance(b, pd.DataFrame) else a / (b if b != 0 else np.nan)
        else:
            r = ops.op_signed_power(a, b) if isinstance(a, pd.DataFrame) else a ** b
        return ops._clean(r) if isinstance(r, pd.DataFrame) else r
    if isinstance(node, ast.Compare):
        a, b = _ev(node.left, ctx), _ev(node.comparators[0], ctx)
        op = node.ops[0]
        r = (a > b) if isinstance(op, ast.Gt) else (a < b) if isinstance(op, ast.Lt) else (a >= b) if isinstance(op, ast.GtE) else (a <= b)
        r = r.astype(float)
        nan = (a.isna() if isinstance(a, pd.DataFrame) else False)
        if isinstance(b, pd.DataFrame):
            nan = nan | b.isna()
        return r.where(~nan) if isinstance(nan, pd.DataFrame) else r
    name = node.func.id
    if name in MACROS:
        return _macro(name, [int(_num(a)) for a in node.args], ctx)
    fn, kinds = FUNCS[name]
    args = []
    for a, k in zip(node.args, kinds.replace("G", "")):
        if k == "x":
            v = _ev(a, ctx)
            if name in CS_FUNCS and isinstance(v, pd.DataFrame):
                v = v.where(ctx.mask)  # rank/zscore only among names tradable that day
            args.append(v)
        elif k == "w":
            args.append(int(_num(a)))
        else:
            args.append(float(_num(a)))
    if "G" in kinds:
        args.append(ctx.codes)
    return fn(*args)


def _macro(name: str, a: list[int], ctx: Context) -> pd.DataFrame:
    p = ctx.panel
    r = p.returns
    c = p.close
    if name == "mom":
        lb, skip = a
        if skip >= lb:
            raise DSLError("mom(lookback, skip) needs skip < lookback")
        return ops._clean(c.shift(skip) / c.shift(lb) - 1.0)
    if name == "rev":
        return -ops.ts_pct(c, a[0])
    if name == "vol":
        return ops.ts_std(r, a[0]) * ops.ANN
    if name == "beta":
        return ops.ts_beta(r, ctx.market, a[0])
    if name == "idio_vol":
        e = _resid_returns(ctx, max(63, a[0]))
        return ops.ts_std(e, a[0]) * ops.ANN
    if name == "resid_mom":
        lb, skip = a
        if skip >= lb:
            raise DSLError("resid_mom(lookback, skip) needs skip < lookback")
        e = _resid_returns(ctx, 252)
        s = ops.ts_sum(e, lb - skip).shift(skip)
        sd = ops.ts_std(e, lb).shift(skip)
        return ops._clean(s / (sd * np.sqrt(lb - skip)))
    if name == "high52":
        return c / ops.ts_max(c, a[0])
    if name == "amihud":
        return ops.ts_mean(ops._clean(r.abs() / p.dollar_volume), a[0]) * 1e9
    if name == "maxret":
        return ops.ts_max(r, a[0])
    if name == "seasonal":
        yrs = a[0]
        if not 1 <= yrs <= 20:
            raise DSLError("seasonal(years) needs 1..20")
        lr = np.log1p(r)
        m21 = lr.rolling(21, min_periods=15).sum()
        # the 21-day window that starts where the NEXT 21 days started k years ago
        parts = [m21.shift(252 * k - 21) for k in range(1, yrs + 1)]
        return sum(parts) / yrs
    if name == "trend":
        return c / ops.ts_mean(c, a[0]) - 1.0
    if name == "tsmom":
        return ops._clean(ops.ts_pct(c, a[0]) / (ops.ts_std(r, 63) * np.sqrt(a[0])))
    if name == "overnight_ret":
        return ops.ts_sum(np.log1p(p.overnight), a[0])
    if name == "intraday_ret":
        return ops.ts_sum(np.log1p(p.intraday), a[0])
    if name == "abn_volume":
        return ops._clean(ops.ts_mean(p.volume, a[0]) / ops.ts_mean(p.volume, 252))
    if name == "range_vol":
        hl = np.log(p.high / p.low) ** 2
        return np.sqrt(ops.ts_mean(hl, a[0]) / (4 * np.log(2))) * ops.ANN
    if name == "drawdown":
        return c / ops.ts_max(c, a[0]) - 1.0
    raise DSLError(f"macro {name} not implemented")


def _resid_returns(ctx: Context, d: int) -> pd.DataFrame:
    """Market-residual returns using yesterday's trailing beta (no look-ahead)."""
    key = f"__resid_{d}"
    if key not in ctx.memo:
        r = ctx.panel.returns
        b = ops.ts_beta(r, ctx.market, d).shift(1)
        ctx.memo[key] = r - b * ctx.market
    return ctx.memo[key]


def describe_language() -> str:
    """Compact reference handed to the LLM researcher."""
    return (
        "Terminals: " + ", ".join(sorted(TERMINALS)) + ".\n"
        "Time-series (trailing window w, integer literal): delay delta pct_change ts_mean ts_sum ts_std "
        "ts_min ts_max ts_median ts_skew ts_kurt ts_rank ts_zscore ts_ema ts_decay ts_argmax ts_argmin (x, w); "
        "ts_corr ts_cov ts_beta ts_resid (x, y, w).\n"
        "Cross-sectional (within the day's tradable universe): rank zscore demean winsorize scale (x); "
        "neutralize(y, x); group_demean group_rank group_zscore (x) [groups = sector / asset class].\n"
        "Elementwise: abs log sign sqrt inv (x); signed_power(x, p); max min (x, y); clip(x, lo, hi); "
        "where(cond, a, b); comparisons > < >= <= give 1/0; + - * / **.\n"
        "Macros (skip may be 0): mom(lookback, skip) rev(d) vol(d) beta(d) idio_vol(d) resid_mom(lookback, skip) high52(d) "
        "amihud(d) maxret(d) seasonal(years) trend(d) tsmom(d) overnight_ret(d) intraday_ret(d) "
        "abn_volume(d) range_vol(d) drawdown(d).\n"
        "Higher score = more bullish. The engine masks to tradable names, winsorizes, neutralizes and "
        "sizes positions, and trades one bar after the signal (no same-bar fills)."
    )
