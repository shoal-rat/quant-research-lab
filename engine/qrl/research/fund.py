"""The club fund: promoted strategies combined into one portfolio.

Allocation is Bayesian mean-variance on the strategies' return streams:

    mu_i    = expected live Sharpe_i (posterior mean) * vol_i
    C       = sample correlation shrunk 50% toward its average off-diagonal value
    w      ∝ Sigma^-1 mu, clipped at 0, capped at 40% per strategy (water-filled)

then scaled to a 10% volatility target with leverage capped by the account type
(cash account: 1.0 and only long-only / long-flat books; margin: 1.5). Positions
from all members are *netted* at the ticker level before trading, so opposing
trades cancel instead of paying costs twice.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from ..alpha.dsl import Context, evaluate
from ..backtest.costs import CostModel
from ..backtest.engine import simulate
from ..data.panel import load_panel
from ..portfolio.construct import BookSpec, build_book, _cap_and_normalize
from ..stats import metrics as M
from .registry import Registry

_STREAMS: dict[str, dict] = {}


@dataclass
class FundConfig:
    target_vol: float = 0.10
    account: str = "margin"  # margin | cash
    max_weight: float = 0.40


def member_stream(t: dict) -> dict:
    """Full-history simulation of a promoted strategy (cached per trial)."""
    key = t["id"]
    if key in _STREAMS:
        return _STREAMS[key]
    panel = load_panel(t["universe"])
    spec = BookSpec(**{k: v for k, v in (t.get("book") or {}).items() if k in BookSpec.__dataclass_fields__})
    score = evaluate(t["expr"], Context(panel))
    book = build_book(score, panel, spec)
    res = simulate(panel, book, CostModel.build(panel))
    last = max(book.targets) if book.targets else None
    out = {
        "returns": res.returns,
        "excess": res.excess,
        "target": pd.Series(book.targets[last], index=panel.tickers) if last is not None else pd.Series(dtype=float),
        "target_date": panel.dates[last].strftime("%Y-%m-%d") if last is not None else None,
        "mode": spec.mode,
    }
    _STREAMS[key] = out
    return out


def invalidate(tid: str | None = None) -> None:
    if tid:
        _STREAMS.pop(tid, None)
    else:
        _STREAMS.clear()


def allocate(members: list[dict], cfg: FundConfig) -> dict:
    if not members:
        return {"weights": {}, "leverage": 0.0}
    streams = {m["id"]: member_stream(m)["excess"] for m in members}
    df = pd.DataFrame(streams).dropna(how="all").fillna(0.0)
    df = df.iloc[-252 * 10:]  # last 10 years
    vol = df.std() * np.sqrt(252)
    vol = vol.where(vol > 1e-4, 0.1)
    post = pd.Series({m["id"]: max(m.get("post_mean") or 0.0, 0.0) for m in members})
    mu = post * vol
    C = df.corr().fillna(0.0).to_numpy()
    n = len(members)
    if n > 1:
        off = C[~np.eye(n, dtype=bool)].mean()
        C = 0.5 * C + 0.5 * (np.full((n, n), off) + np.eye(n) * (1 - off))
    S = np.outer(vol, vol) * C
    try:
        w = np.linalg.solve(S + np.eye(n) * 1e-6, mu.to_numpy())
    except np.linalg.LinAlgError:
        w = mu.to_numpy() / vol.to_numpy() ** 2
    w = np.maximum(w, 0.0)
    if w.sum() <= 0:
        w = np.ones(n)
    w = _cap_and_normalize(w / w.sum(), cfg.max_weight if n * cfg.max_weight >= 1 else 1.0)
    pv = float(np.sqrt(w @ S @ w))
    max_lev = 1.0 if cfg.account == "cash" else 1.5
    lev = min(cfg.target_vol / pv, max_lev) if pv > 0 else 1.0
    return {"weights": {mid: float(x) for mid, x in zip(df.columns, w)}, "leverage": float(lev),
            "ex_ante_vol": pv * lev}


def fund_state(reg: Registry, cfg: FundConfig | None = None) -> dict:
    cfg = cfg or FundConfig()
    members = [t for t in reg.list(status="promoted") if cfg.account == "margin" or t["mode"] != "long_short"]
    if not members:
        return {"members": [], "nav": [], "targets": {}, "stats": None, "allocation": {"weights": {}}}
    alloc = allocate(members, cfg)
    lev = alloc["leverage"]
    rets = {}
    targets: dict[str, float] = {}
    for m in members:
        st = member_stream(m)
        w = alloc["weights"].get(m["id"], 0.0) * lev
        rets[m["id"]] = st["excess"] * w
        for tk, x in st["target"].items():
            if abs(x) > 1e-6:
                targets[tk] = targets.get(tk, 0.0) + float(x) * w
    df = pd.DataFrame(rets).fillna(0.0)
    panel_rf = load_panel(members[0]["universe"]).rf_daily
    fund = df.sum(axis=1) + panel_rf.reindex(df.index).fillna(0.0)
    first_promo = min(m.get("promoted_at") or 0 for m in members)
    stats = M.summarize(fund.iloc[-252 * 10:], panel_rf, load_panel(members[0]["universe"]).bench_returns)
    return {
        "members": [{"id": m["id"], "title_zh": m.get("title_zh"), "title_en": m.get("title_en"),
                     "expr": m["expr"], "universe": m["universe"], "mode": m["mode"], "tier": m.get("tier"),
                     "post_mean": m.get("post_mean"), "weight": alloc["weights"].get(m["id"], 0.0) * lev,
                     "promoted_at": m.get("promoted_at")} for m in members],
        "allocation": alloc,
        "nav": M.downsample((1 + fund.iloc[-252 * 10:]).cumprod(), 300),
        "stats": stats,
        "targets": dict(sorted(targets.items(), key=lambda kv: -abs(kv[1]))),
        "gross": float(sum(abs(v) for v in targets.values())),
        "first_promoted_at": first_promo,
    }
