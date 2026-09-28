"""Where ideas come from: the LLM researcher, the literature, the miner,
refinements of near misses, and the Advisor's orders."""
from __future__ import annotations

import json
import random
import re

from ..alpha.dsl import DSLError, describe_language, parse
from ..data.universe import SPECS, available
from ..llm.brain import BRAIN
from .evaluate import Candidate
from .knowledge import FAMILIES, FAMILY_BY_KEY, MECHANISMS, doctrine, library_brief
from .registry import Registry

VALID_MODES = {"us": {"long_short", "long_only"}, "macro": {"time_series", "long_only"},
               "sectors": {"time_series", "long_only"}}

KEYWORDS = [
    (r"动量|momentum|趋势|trend", ["momentum", "residual_momentum", "tsmom", "trend_filter", "industry_momentum"]),
    (r"低波|波动|vol|beta|防守|defens", ["low_vol", "vol_managed", "risk_parity"]),
    (r"反转|revers", ["reversal"]),
    (r"季节|season|月", ["seasonality"]),
    (r"行业|sector|industry", ["sector_rotation", "industry_momentum"]),
    (r"etf|多资产|macro|大类|资产配置|bond|债|黄金|gold|commod", ["tsmom", "risk_parity", "cross_asset_momentum", "trend_filter"]),
    (r"彩票|lottery|max|skew|偏度", ["lottery"]),
    (r"流动|liquid|amihud", ["illiquidity"]),
    (r"隔夜|overnight|日内|intraday", ["overnight"]),
    (r"52|新高|high", ["high52"]),
]


def _jitter(expr: str, r: random.Random) -> str:
    def f(m):
        w = int(m.group(0))
        if w <= 3 or r.random() < 0.5:
            return str(w)
        return str(max(2, int(round(w * r.choice([0.5, 0.75, 1.25, 1.5])))))
    return re.sub(r"(?<![\w.])\d+(?![\w.])", f, expr)


def _usable(fam) -> bool:
    return available().get(fam.universe, False)


def library_candidate(reg: Registry, r: random.Random, families: list[str] | None = None) -> Candidate:
    stats = reg.family_stats()
    pool = [f for f in FAMILIES if _usable(f) and (not families or f.key in families)] or [f for f in FAMILIES if _usable(f)]
    # Thompson sampling over families: Beta(1 + promoted, 1 + failures)
    def draw(f):
        s = stats.get(f"{f.key}@{f.universe}", {"n": 0, "promoted": 0})
        return r.betavariate(1 + s["promoted"], 1 + s["n"] - s["promoted"])
    fam = max(pool, key=draw)
    expr = r.choice(fam.templates)
    tried = stats.get(f"{fam.key}@{fam.universe}", {"n": 0})["n"]
    if tried > 0:
        expr = _jitter(expr, r)
    if r.random() < 0.3:
        mates = [g for g in FAMILIES if g.universe == fam.universe and g.mode == fam.mode and g.key != fam.key]
        if mates:
            g = r.choice(mates)
            e2 = r.choice(g.templates)
            if fam.mode == "time_series":
                expr = f"(sign({expr}) + sign({e2})) / 2"
            else:
                expr = f"rank({expr}) + rank({e2})"
            return Candidate(expr=expr, universe=fam.universe, mode=fam.mode, family=fam.key,
                             mechanism=fam.mechanism, source="library",
                             title_zh=f"{fam.zh} × {g.zh}", title_en=f"{fam.en} × {g.en}",
                             thesis_zh=f"{fam.story_zh} 再叠加：{g.story_zh}",
                             thesis_en=f"{fam.story_en} Combined with: {g.story_en}")
    return Candidate(expr=expr, universe=fam.universe, mode=fam.mode, family=fam.key, mechanism=fam.mechanism,
                     source="library", title_zh=fam.zh, title_en=fam.en, thesis_zh=fam.story_zh,
                     thesis_en=fam.story_en)


def _memory(reg: Registry, limit: int = 14) -> str:
    rows = reg.list(limit=limit)
    lines = []
    for t in rows:
        failed = [x["gate"] for x in (t.get("reasons") or []) if isinstance(x, dict) and not x.get("pass")]
        sr = t.get("sr")
        lines.append(f"- [{t['universe']}/{t['mode']}] {t['canonical']} -> {t['verdict']}"
                     + (f", net SR {sr:.2f}, E[live SR] {t.get('post_mean') or 0:.2f}" if sr is not None else "")
                     + (f", failed: {','.join(failed[:3])}" if failed else ""))
    fam = reg.family_stats()
    fl = [f"{k}: {v['n']} tried, {v['promoted']} promoted" for k, v in list(fam.items())[:20]]
    return "Recent pulls:\n" + "\n".join(lines or ["(none yet)"]) + "\nFamily record:\n" + "\n".join(fl or ["(none)"])


def llm_prompt(reg: Registry, directive: str | None, refine_of: dict | None = None) -> str:
    unis = [u for u, ok in available().items() if ok]
    uni_txt = {
        "us": "us — S&P 500 point-in-time members (~375 tradable per day), daily OHLCV 2005-today, GICS sectors. "
              "Modes: long_short (dollar-neutral factor book; its excess Sharpe is judged) or long_only "
              "(top-quintile basket judged vs an equal-weight basket traded the same way).",
        "macro": "macro — 24 multi-asset ETFs (US/intl equity, treasuries, credit, commodities, gold, FX, REITs, "
                 "T-bills). Modes: time_series (each asset long/flat by its own signal, risk-sized, 10% vol "
                 "target) or long_only (rotation into the top 30%, judged vs equal weight).",
        "sectors": "sectors — the 9 SPDR sector ETFs. Modes: long_only (rotation) or time_series.",
    }
    rules = "\n".join(f"{i + 1}. {d['k']}: {d['v']}" for i, d in enumerate(doctrine("en")))
    task = ("Refine this near-miss so it passes the gates it failed (keep its mechanism):\n"
            f"{json.dumps({k: refine_of.get(k) for k in ('expr', 'universe', 'mode', 'book', 'title_en', 'reasons')}, default=str)}\n"
            if refine_of else "Propose ONE new signal the club has not tried.\n")
    return f"""You are Hoshino Akari, the hypothesis researcher of a quantitative research club. {task}
LAB DOCTRINE:
{rules}

UNIVERSES (daily data; signals at close t trade at the next open; costs = spread + sqrt impact + borrow):
{chr(10).join('- ' + uni_txt[u] for u in unis)}

ALPHA LANGUAGE:
{describe_language()}

MECHANISM LIBRARY (priors: risk_premium 0.30, behavioral 0.25, structural 0.30, statistical 0.00 Sharpe):
{library_brief()}

CLUB MEMORY:
{_memory(reg)}

ADVISOR DIRECTIVE: {directive or '(none — use your judgement)'}

Good ideas: combine two mechanisms with low correlation (rank(a) + rank(b)); condition on regimes with where();
slow a fast signal down with ts_decay/ts_ema or a longer rebalance to survive costs; orthogonalize against a known
factor with neutralize(x, y). Avoid anything already in club memory.
Return ONLY a JSON object, no prose:
{{"title_zh": "<=12 Chinese chars", "title_en": "<= 6 words", "thesis_zh": "1-2 sentences: why it pays", "thesis_en": "...",
"mechanism": "risk_premium|behavioral|structural|statistical", "family": "<library key or null>",
"universe": "{'|'.join(unis)}", "mode": "long_short|long_only|time_series", "expr": "<alpha expression>",
"book": {{"rebalance": 5, "smooth": 0, "neutralize": "group"}}}}"""


def llm_candidate(reg: Registry, directive: str | None = None, refine_of: dict | None = None,
                  source: str = "llm") -> Candidate | None:
    data = BRAIN.ask_json(llm_prompt(reg, directive, refine_of))
    if not data:
        return None
    return candidate_from_json(data, source, parent=refine_of.get("id") if refine_of else None)


def candidate_from_json(data: dict, source: str, parent: str | None = None) -> Candidate | None:
    u = data.get("universe") if data.get("universe") in SPECS else "us"
    if not available().get(u):
        return None
    mode = data.get("mode") if data.get("mode") in VALID_MODES[u] else sorted(VALID_MODES[u])[0]
    expr = str(data.get("expr") or "").strip()
    try:
        parse(expr)
    except DSLError:
        return None
    book = {}
    for k in ("rebalance", "smooth"):
        v = (data.get("book") or {}).get(k)
        if isinstance(v, (int, float)) and 0 <= v <= 63:
            book[k] = int(v) if k == "smooth" or v >= 1 else None
    nz = (data.get("book") or {}).get("neutralize")
    if nz in ("group", "market", "none"):
        book["neutralize"] = nz
    mech = data.get("mechanism") if data.get("mechanism") in MECHANISMS else "statistical"
    fam = data.get("family") if data.get("family") in FAMILY_BY_KEY else None
    return Candidate(expr=expr, universe=u, mode=mode, book={k: v for k, v in book.items() if v is not None},
                     family=fam, mechanism=mech, source=source, parent=parent,
                     title_zh=str(data.get("title_zh") or "")[:24], title_en=str(data.get("title_en") or "")[:60],
                     thesis_zh=str(data.get("thesis_zh") or "")[:200], thesis_en=str(data.get("thesis_en") or "")[:300])


def refine_candidate(reg: Registry, r: random.Random) -> Candidate | None:
    """Rule-based refinement of the most promising near miss."""
    near = [t for t in reg.list(limit=80) if t["status"] in ("reserve", "rejected") and (t.get("post_mean") or -1) > 0.1]
    if not near:
        return None
    t = max(near, key=lambda x: x.get("post_mean") or 0)
    failed = [x["gate"] for x in (t.get("reasons") or []) if isinstance(x, dict) and not x.get("pass")]
    expr, book = t["expr"], dict(t.get("book") or {})
    note_zh, note_en = "", ""
    if "costs" in failed:
        expr = f"ts_decay({expr}, 5)"
        book["rebalance"] = max(int(book.get("rebalance") or 5) * 2, 10)
        note_zh, note_en = "放慢信号、拉长调仓以降低成本。", "Slowed the signal and the rebalance to cut costs."
    elif "novelty" in failed and t["mode"] != "time_series":
        fam = FAMILY_BY_KEY.get(t.get("family") or "")
        base = fam.templates[0] if fam else "mom(252, 21)"
        expr = f"neutralize({expr}, {base})"
        note_zh, note_en = "对已知因子做正交化，只保留新的部分。", "Orthogonalized against the known factor."
    elif t["mode"] == "time_series":
        expr = f"where(trend(200) > 0, {expr}, 0)"
        note_zh, note_en = "加一个趋势状态过滤。", "Added a trend regime filter."
    else:
        mates = [f for f in FAMILIES if f.universe == t["universe"] and f.mode == t["mode"] and f.key != t.get("family")]
        g = r.choice(mates) if mates else None
        if not g:
            return None
        expr = f"rank({expr}) + rank({g.templates[0]})"
        note_zh, note_en = f"叠加低相关的{g.zh}。", f"Blended with low-correlation {g.en.lower()}."
    try:
        parse(expr)
    except DSLError:
        return None
    return Candidate(expr=expr, universe=t["universe"], mode=t["mode"], book=book, family=t.get("family"),
                     mechanism=t.get("mechanism") or "statistical", source="refine", parent=t["id"],
                     title_zh=f"{t.get('title_zh') or '候补'}·改", title_en=f"{t.get('title_en') or 'Reserve'} (refined)",
                     thesis_zh=note_zh, thesis_en=note_en)


def directive_families(text: str) -> list[str]:
    out = []
    for pat, fams in KEYWORDS:
        if re.search(pat, text or "", re.I):
            out += fams
    return out


def infer_family(expr: str, universe: str) -> str | None:
    """Best library match for a hand-written formula (shared building blocks)."""
    try:
        used = parse(expr).uses()
    except DSLError:
        return None
    best, score = None, 0
    for f in FAMILIES:
        if f.universe != universe:
            continue
        blocks = set()
        for tpl in f.templates:
            blocks |= parse(tpl).uses()
        blocks -= {"rank", "close", "returns", "where", "sign", "ts_mean", "group_demean", "log"}
        s = len(used & blocks)
        if s > score:
            best, score = f.key, s
    return best
