"""The evaluation pipeline: one candidate in, one audited verdict out.

Stages (each owned by a club member, streamed to the UI as it completes):

    parse      Ren     the formula compiles in the safe DSL
    integrity  Shiori  look-ahead fuzz test + data coverage
    signal     Akari   rank IC / IC decay / quantile spreads (cross-section)
    backtest   Ren     event-accurate simulation, costs, t+1 execution
    risk       Saki    costs vs edge, drawdown, capacity, stability by year
    skeptic    Iori    Sharpe SE, DSR vs every pull, empirical-Bayes posterior,
                       factor attribution, correlation with the fund
    verdict    Mio     gate checklist -> promote / reserve / reject, rarity tier,
                       and (only on promotion) the one-time lockbox opening

History is split into a research region and a final two-year LOCKBOX that no
decision can see until a strategy has already passed every other gate.
"""
from __future__ import annotations

import math
import random
from dataclasses import asdict, dataclass, field

import numpy as np
import pandas as pd

from ..alpha.dsl import Context, DSLError, evaluate as eval_expr, parse
from ..backtest.costs import CostModel
from ..backtest.engine import capacity_curve, simulate
from ..data.panel import Panel, load_panel
from ..portfolio.construct import BookSpec, build_book, prepare_scores
from ..stats import metrics as M
from ..stats.attribution import attribute
from ..stats.ic import ic_report, quantile_returns, signal_autocorr
from ..stats.inference import dsr, effective_trials, hac_tstat, min_track_record, posterior_sr, psr, sharpe_se
from ..stats.pbo import pbo
from .knowledge import FAMILY_BY_KEY, MECHANISMS
from .registry import Registry

LOCKBOX_DAYS = 504
TRAIN_FRAC = 0.7
TIERS = [("SSR", 0.90), ("SR", 0.60), ("R", 0.35), ("N", -99)]


@dataclass
class Candidate:
    expr: str
    universe: str = "us"
    mode: str | None = None
    book: dict | None = None
    family: str | None = None
    mechanism: str = "statistical"
    title_zh: str = ""
    title_en: str = ""
    thesis_zh: str = ""
    thesis_en: str = ""
    source: str = "manual"
    parent: str | None = None

    def spec(self, kind: str) -> BookSpec:
        base = BookSpec.default_for(kind, self.mode)
        fam = FAMILY_BY_KEY.get(self.family or "")
        if fam and fam.neutralize:
            base.neutralize = fam.neutralize
        if fam and fam.rebalance:
            base.rebalance = fam.rebalance
        for k, v in (self.book or {}).items():
            if hasattr(base, k) and v is not None:
                setattr(base, k, type(getattr(base, k))(v) if getattr(base, k) is not None else v)
        return base


@dataclass
class GateConfig:
    strictness: float = 1.0  # Saki's mood scales every threshold
    min_t: float = 2.0
    min_dsr: float = 0.90
    min_post: float = 0.25
    min_p_pos: float = 0.85
    max_pool_corr: float = 0.70
    min_cost_keep: float = 0.5
    min_pos_years: float = 0.55
    min_coverage: float = 0.5


@dataclass
class Evaluation:
    candidate: Candidate
    trial_id: str | None = None
    stages: list[dict] = field(default_factory=list)
    verdict: str = "reject"
    tier: str = "N"
    reasons: list[dict] = field(default_factory=list)
    report: dict = field(default_factory=dict)

    def summary(self) -> dict:
        return {
            "trial": self.trial_id, "verdict": self.verdict, "tier": self.tier,
            "expr": self.candidate.expr, "universe": self.candidate.universe,
            "reasons": self.reasons,
            "stages": [{k: v for k, v in s.items() if k != "chart"} for s in self.stages],
        }


def tier_of(post_mean: float) -> str:
    for name, cut in TIERS:
        if post_mean >= cut:
            return name
    return "N"


def _sr(x: pd.Series) -> float:
    return M.sharpe(x)


def lookahead_fuzz(expr: str, panel: Panel, full: pd.DataFrame, rows: list[int], check: int = 40) -> dict:
    """Re-evaluate on history truncated at each cut row; the past must not change."""
    worst = 0.0
    for cut in rows:
        sub = panel.slice(end=panel.dates[cut])
        part = eval_expr(expr, Context(sub))
        a = full.iloc[cut - check + 1: cut + 1].to_numpy(dtype=float)
        b = part.iloc[-check:].to_numpy(dtype=float)
        both = np.isfinite(a) & np.isfinite(b)
        mismatch_nan = np.isfinite(a) != np.isfinite(b)
        if mismatch_nan.mean() > 0.001:
            return {"ok": False, "cut": panel.dates[cut].strftime("%Y-%m-%d"), "diff": float("inf")}
        if both.any():
            scale = np.nanmax(np.abs(a[both])) or 1.0
            worst = max(worst, float(np.max(np.abs(a[both] - b[both])) / scale))
    return {"ok": worst < 1e-6, "diff": worst}


def evaluate_candidate(c: Candidate, reg: Registry | None = None, gate: GateConfig | None = None,
                       on_stage=None, episode: int | None = None, fuzz: bool = True,
                       panel: Panel | None = None) -> Evaluation:
    reg = reg or Registry()
    gate = gate or GateConfig()
    s = gate.strictness
    ev = Evaluation(c)
    emit = (lambda st: on_stage(st)) if on_stage else (lambda st: None)

    def stage(key, agent, status, **kw):
        st = {"key": key, "agent": agent, "status": status, **kw}
        ev.stages.append(st)
        emit(st)
        return st

    # ---- parse -------------------------------------------------------------
    try:
        alpha = parse(c.expr)
    except DSLError as e:
        stage("parse", "ren", "fail", error=str(e))
        ev.reasons.append({"gate": "parse", "detail": str(e)})
        return ev
    panel = panel or load_panel(c.universe)
    spec = c.spec(panel.kind)
    mech = c.mechanism if c.mechanism in MECHANISMS else "statistical"
    if c.family in FAMILY_BY_KEY:
        mech = FAMILY_BY_KEY[c.family].mechanism
    dup = reg.seen(alpha.canonical, c.universe, spec.mode)
    stage("parse", "ren", "pass", canonical=alpha.canonical, nodes=alpha.nodes, max_window=alpha.max_window,
          book=spec.to_dict(), duplicate_of=dup["id"] if dup else None)

    # ---- integrity ---------------------------------------------------------
    ctx = Context(panel)
    try:
        score = eval_expr(alpha, ctx)
    except (DSLError, ValueError, ZeroDivisionError) as e:
        stage("integrity", "shiori", "fail", error=str(e))
        ev.reasons.append({"gate": "integrity", "detail": str(e)})
        return ev
    T = panel.T
    lock_start = T - LOCKBOX_DAYS
    tradable = panel.tradable
    cov_cells = score.where(tradable).notna().to_numpy()[:lock_start].sum()
    coverage = float(cov_cells / max(1, tradable.to_numpy()[:lock_start].sum()))
    fz = {"ok": True, "diff": 0.0, "skipped": True}
    if fuzz:
        rng = random.Random(hash(alpha.canonical) & 0xFFFF)
        cuts = [int(lock_start * rng.uniform(0.35, 0.6)), int(lock_start * rng.uniform(0.75, 0.95))]
        fz = lookahead_fuzz(c.expr, panel, score, cuts)
    ok_int = fz["ok"] and coverage >= gate.min_coverage
    stage("integrity", "shiori", "pass" if ok_int else "fail", lookahead=fz, coverage=coverage,
          survivorship=panel.meta.get("survivorship_note"))
    if not ok_int:
        ev.reasons.append({"gate": "integrity",
                           "detail": "look-ahead detected" if not fz["ok"] else f"coverage {coverage:.0%}"})
        _record(reg, ev, alpha, spec, mech, None, None, episode)
        return ev

    # ---- signal diagnostics ----------------------------------------------
    book = build_book(score, panel, spec)
    if not book.targets:
        stage("signal", "akari", "fail", error="no tradable positions")
        ev.reasons.append({"gate": "signal", "detail": "empty book"})
        _record(reg, ev, alpha, spec, mech, None, None, episode)
        return ev
    first = min(book.targets) + 1
    split = first + int((lock_start - first) * TRAIN_FRAC)
    research = slice(first, lock_start)
    sig = {}
    if panel.kind == "cross_section" and spec.mode != "time_series":
        z = prepare_scores(score, panel, spec)
        sig["ic"] = ic_report(z, panel, research)
        sig["ic_train"] = ic_report(z, panel, slice(first, split), horizons=(spec.rebalance,))[spec.rebalance]
        sig["ic_valid"] = ic_report(z, panel, slice(split, lock_start), horizons=(spec.rebalance,))[spec.rebalance]
        sig["quantiles"] = quantile_returns(z, panel, research, h=21)
        sig["autocorr"] = signal_autocorr(z.iloc[research])
        ic_h = sig["ic"].get(21) or sig["ic"].get(5)
        q = sig["quantiles"]
        mono = float(pd.Series(q).corr(pd.Series(range(len(q))), method="spearman")) if len(q) > 2 else 0.0
        sig["monotonic"] = mono
        st_status = "pass" if ic_h["t"] >= 2.0 else "warn" if ic_h["t"] > 0 else "fail"
    else:
        st_status = "pass"
    stage("signal", "akari", st_status, **sig)

    # ---- backtest ------------------------------------------------------------
    costs = CostModel.build(panel)
    res = simulate(panel, book, costs)
    rf = res.rf
    # The "alpha stream" every statistic is computed on:
    #   long_short / time_series -> the book's return in excess of T-bills
    #   long_only                -> the book minus an equal-weight basket of the
    #                               same tradable universe (selection skill only,
    #                               market beta stripped out)
    if spec.mode == "long_only":
        ew = equal_weight_benchmark(panel, spec, costs).reindex(res.returns.index).fillna(0.0)
        ex = res.returns - ew
        gross_stream = res.gross - ew
    else:
        ex = res.excess
        gross_stream = res.gross - rf
    idx = res.returns.index
    rr = lambda a, b: (idx >= panel.dates[a]) & (idx < (panel.dates[b] if b < T else idx[-1] + pd.Timedelta(days=1)))  # noqa: E731
    m_research = rr(first, lock_start)
    m_train = rr(first, split)
    m_valid = rr(split, lock_start)
    ex_r, ex_tr, ex_va = ex[m_research], ex[m_train], ex[m_valid]
    gross_ex = gross_stream[m_research]
    summ = M.summarize(res.returns[m_research], rf[m_research], panel.bench_returns,
                       res.turnover[m_research], res.costs[m_research])
    sr, sr_g = _sr(ex_r), _sr(gross_ex)
    summ["stream_sharpe"] = sr
    sr_tr, sr_va = _sr(ex_tr), _sr(ex_va)
    se = sharpe_se(ex_r.to_numpy())
    eq = (1 + res.returns[m_research]).cumprod()
    stage("backtest", "ren", "pass" if sr > 0 else "fail", sharpe=sr, gross_sharpe=sr_g, sharpe_train=sr_tr,
          sharpe_valid=sr_va, cagr=summ["cagr"], vol=summ["vol"], max_dd=summ["max_dd"],
          turnover=summ.get("turnover"), chart=M.downsample(eq, 240),
          period=[panel.dates[first].strftime("%Y-%m-%d"), panel.dates[lock_start - 1].strftime("%Y-%m-%d")])

    # ---- risk -------------------------------------------------------------------
    yearly = M.yearly_returns(ex_r)
    ys = pd.Series(yearly)
    best_year = int(ys.idxmax()) if len(ys) else None
    ex_wo_best = ex_r[ex_r.index.year != best_year] if best_year else ex_r
    cap = capacity_curve(panel, res, costs, mask=m_research)
    cost_keep = sr / sr_g if sr_g > 0 else 0.0
    pos_years = float((ys > 0).mean()) if len(ys) else 0.0
    risk_flags = []
    if cost_keep < gate.min_cost_keep * s:
        risk_flags.append("costs")
    if pos_years < gate.min_pos_years:
        risk_flags.append("stability")
    if _sr(ex_wo_best) <= 0:
        risk_flags.append("one_year_wonder")
    if summ["max_dd"] < -0.35:
        risk_flags.append("drawdown")
    stage("risk", "saki", "fail" if {"costs", "one_year_wonder"} & set(risk_flags) else ("warn" if risk_flags else "pass"),
          cost_bps=summ.get("cost_bps"), cost_keep=cost_keep, turnover=summ.get("turnover"),
          max_dd=summ["max_dd"], max_dd_days=summ["max_dd_days"], beta=summ.get("beta"),
          pos_years=pos_years, yearly=yearly, sharpe_wo_best=_sr(ex_wo_best), capacity=cap,
          names=float(np.mean(list(book.names_held.values()))), flags=risk_flags)

    # ---- skeptic -----------------------------------------------------------------
    n_trials = reg.count(c.universe) + int(reg.kv_get(f"shadow:{c.universe}", 0)) + 1  # miner pulls count too
    pop_sr, pop_se = reg.population(c.universe, spec.mode)
    series = reg.returns_matrix(c.universe, limit=40)
    avg_corr, pool_corr, pool_best = 0.0, 0.0, None
    cur = ex_r
    if series:
        cors = []
        promoted = {t["id"] for t in reg.list(status="promoted")}
        for tid, (arr, start) in series.items():
            s2 = _realign(arr, start, cur.index)  # stored series share the panel calendar
            if s2 is None:
                continue
            cc = float(np.corrcoef(cur.to_numpy(), s2)[0, 1]) if np.std(s2) > 0 and cur.std() > 0 else 0.0
            if np.isfinite(cc):
                cors.append(abs(cc))
                if tid in promoted and abs(cc) > pool_corr:
                    pool_corr, pool_best = abs(cc), tid
        avg_corr = float(np.mean(cors)) if cors else 0.0
    n_eff = effective_trials(n_trials, avg_corr)
    trial_var = float(np.var(pop_sr, ddof=1)) if len(pop_sr) > 5 else None
    d_prob, d_bar = dsr(ex_r.to_numpy(), int(round(n_eff)), trial_var)
    prior = MECHANISMS[mech]
    post = posterior_sr(sr, se, pop_sr, pop_se, prior["prior"], prior["sd"])
    attr = attribute(ex_r, panel)
    lab_pbo = None
    if len(series) >= 8:
        mats = [(_realign(a, st, cur.index)) for a, st in series.values()]
        mats = [m for m in mats if m is not None]
        if len(mats) >= 8:
            lab_pbo = pbo(np.column_stack(mats + [cur.to_numpy()]))
    t_stat = sr / se if se > 0 else 0.0
    # Survivorship: the panel lacks members that were later delisted, and those are
    # disproportionately small and illiquid. A book that earns its keep by leaning
    # into small names is therefore flattered by the data itself.
    size = ((attr or {}).get("loadings") or {}).get("SIZE") or {}
    size_tilt = panel.kind == "cross_section" and size.get("t", 0) > 3 and size.get("beta", 0) > 0.25
    sk_fail = d_prob < gate.min_dsr * min(s, 1.05) or post["mean"] < gate.min_post * s
    stage("skeptic", "iori", "fail" if sk_fail else "pass", se=se, t=t_stat, psr=psr(ex_r.to_numpy()),
          dsr=d_prob, dsr_bar=d_bar, trials=n_trials, trials_eff=n_eff, posterior=post, attribution=attr,
          pool_corr=pool_corr, pool_twin=pool_best, lab_pbo=lab_pbo, mintrl_years=min_track_record(sr, ex_r.to_numpy()),
          size_tilt=bool(size_tilt))

    # ---- verdict --------------------------------------------------------------------
    checks = [
        ("evidence", t_stat >= gate.min_t * s, f"t={t_stat:.2f} (need {gate.min_t * s:.2f})", True),
        ("consistency", sr_tr > 0 and sr_va > 0, f"train {sr_tr:.2f} / valid {sr_va:.2f}", True),
        ("costs", cost_keep >= gate.min_cost_keep * s, f"keeps {cost_keep:.0%} of gross Sharpe", True),
        ("stability", pos_years >= gate.min_pos_years and "one_year_wonder" not in risk_flags,
         f"{pos_years:.0%} positive years", True),
        ("deflation", d_prob >= gate.min_dsr * min(s, 1.05), f"DSR {d_prob:.2f} vs bar {d_bar:.2f} over {n_eff:.0f} pulls", True),
        ("posterior", post["mean"] >= gate.min_post * s and post["p_positive"] >= gate.min_p_pos,
         f"E[live SR] {post['mean']:.2f}, P(>0) {post['p_positive']:.0%}", True),
        ("novelty", pool_corr < gate.max_pool_corr, f"max corr with fund {pool_corr:.2f}", False),
        ("survivorship", not size_tilt, f"SIZE loading {size.get('beta', 0):.2f} (t={size.get('t', 0):.1f})", False),
    ]
    hard_fail = [k for k, okk, _, hard in checks if hard and not okk]
    soft_fail = [k for k, okk, _, hard in checks if not hard and not okk]
    ev.tier = tier_of(post["mean"])
    lockbox = None
    if not hard_fail:
        lb = res.returns.index >= panel.dates[lock_start]
        ex_lb = ex[lb]
        sr_lb = _sr(ex_lb)
        se_lb = sharpe_se(ex_lb.to_numpy())
        lb_ok = sr_lb >= post["mean"] - 2 * se_lb
        lockbox = {"sharpe": sr_lb, "se": se_lb, "ok": bool(lb_ok), "return": float((1 + res.returns[lb]).prod() - 1),
                   "period": [panel.dates[lock_start].strftime("%Y-%m-%d"), panel.dates[-1].strftime("%Y-%m-%d")]}
        if not lb_ok:
            hard_fail.append("lockbox")
    if not hard_fail and not soft_fail:
        ev.verdict = "promote"
    elif not hard_fail:
        ev.verdict = "reserve"
    else:
        ev.verdict = "reject"
    ev.reasons = [{"gate": k, "pass": bool(okk), "detail": d, "hard": hard} for k, okk, d, hard in checks]
    if lockbox:
        ev.reasons.append({"gate": "lockbox", "pass": lockbox["ok"], "hard": True,
                           "detail": f"lockbox SR {lockbox['sharpe']:.2f} ± {lockbox['se']:.2f}"})

    # ---- tearsheet payload -------------------------------------------------------------
    full_eq = (1 + res.returns).cumprod()
    bench_eq = (1 + panel.bench_returns.reindex(res.returns.index).fillna(0)).cumprod()
    ev.report = {
        "summary": summ,
        "sharpe": sr, "gross_sharpe": sr_g, "sharpe_train": sr_tr, "sharpe_valid": sr_va, "se": se,
        "posterior": post, "dsr": d_prob, "dsr_bar": d_bar, "trials": n_trials, "tier": ev.tier,
        "equity": M.downsample(full_eq[m_research] / full_eq[m_research].iloc[0]),
        "bench": M.downsample(bench_eq[m_research] / bench_eq[m_research].iloc[0]),
        "drawdown": M.downsample(M.drawdown(res.returns[m_research])),
        "rolling_sharpe": M.downsample(M.rolling_sharpe(ex_r)),
        "yearly": yearly, "monthly": M.monthly_table(res.returns[m_research]),
        "signal": sig, "capacity": cap, "attribution": attr, "lockbox": lockbox,
        "split": {"train_end": panel.dates[split].strftime("%Y-%m-%d"),
                  "lockbox_start": panel.dates[lock_start].strftime("%Y-%m-%d")},
        "book": spec.to_dict(), "mechanism": mech, "family": c.family,
        "names_held": float(np.mean(list(book.names_held.values()))),
        "pool_twin": pool_best, "pool_corr": pool_corr,
    }
    stage("verdict", "mio", ev.verdict, tier=ev.tier, reasons=ev.reasons, lockbox=lockbox,
          hard_fail=hard_fail, soft_fail=soft_fail)
    _record(reg, ev, alpha, spec, mech, ex_r, sr_tr, episode, sr=sr, se=se, sr_va=sr_va, post=post, d=d_prob)
    return ev


_EW_CACHE: dict = {}


def equal_weight_benchmark(panel: Panel, spec: BookSpec, costs: CostModel) -> pd.Series:
    """Hold every tradable name equally, rebalanced on the book's own schedule and
    through the same cost model — "no selection at all", traded the same way."""
    key = (panel.name, spec.rebalance, spec.execution)
    if key not in _EW_CACHE:
        flat = BookSpec(mode="long_only", neutralize="none", rebalance=spec.rebalance, quantile=1.0,
                        max_weight=1.0, target_vol=None, max_gross=1.0, execution=spec.execution)
        one = panel.close * 0 + 1.0
        _EW_CACHE[key] = simulate(panel, build_book(one, panel, flat), costs).returns
    return _EW_CACHE[key]


def _realign(arr: np.ndarray, start: str, index: pd.DatetimeIndex):
    """Stored series begin at ``start`` on the same panel calendar."""
    try:
        pos = index.get_loc(pd.Timestamp(start))
    except KeyError:
        pos = index.searchsorted(pd.Timestamp(start))
    out = np.zeros(len(index))
    n = min(len(arr), len(index) - pos)
    if n < 250:
        return None
    out[pos:pos + n] = arr[:n]
    return out


def _record(reg, ev: Evaluation, alpha, spec, mech, ex_r, sr_tr, episode, sr=None, se=None, sr_va=None,
            post=None, d=None):
    c = ev.candidate
    status = {"promote": "promoted", "reserve": "reserve"}.get(ev.verdict, "rejected")
    row = {
        "episode": episode, "expr": c.expr, "canonical": alpha.canonical, "universe": c.universe,
        "mode": spec.mode, "book": spec.to_dict(), "family": c.family, "mechanism": mech, "source": c.source,
        "parent": c.parent, "title_zh": c.title_zh, "title_en": c.title_en, "thesis_zh": c.thesis_zh,
        "thesis_en": c.thesis_en, "sr": sr, "se": se, "sr_train": sr_tr, "sr_valid": sr_va,
        "post_mean": post["mean"] if post else None, "post_sd": post["sd"] if post else None, "dsr": d,
        "verdict": ev.verdict, "tier": ev.tier, "status": status, "reasons": ev.reasons,
        "report": ev.report, "promoted_at": __import__("time").time() if status == "promoted" else None,
    }
    start = ex_r.index[0].strftime("%Y-%m-%d") if ex_r is not None and len(ex_r) else None
    ev.trial_id = reg.add_trial(row, None if ex_r is None else ex_r.to_numpy(), start)


def evaluate_expression(expr: str, universe: str = "us", mode: str | None = None, **kw) -> Evaluation:
    return evaluate_candidate(Candidate(expr=expr, universe=universe, mode=mode, **kw))
