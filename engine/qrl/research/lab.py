"""The club: runs research meetings and streams them to the UI.

One *episode* = one research meeting = one pull:

  episode_start -> thinking -> proposal -> stage x7 -> episode_end

Every event carries ``beats`` (lines for the storyboard). The loop runs in a
worker thread; ``emit`` is thread-safe and forwards to WebSocket subscribers.
"""
from __future__ import annotations

import random
import threading
import time
import traceback
from dataclasses import asdict

from ..cast import dialogue as D
from ..cast.characters import CAST, ORDER
from ..data.panel import load_panel
from ..data.universe import SPECS, available, fetch_universe, refresh_universe
from ..live import paper
from ..llm.brain import BRAIN
from . import fund as F
from .evaluate import Candidate, GateConfig, evaluate_candidate
from .miner import Miner
from .proposer import directive_families, library_candidate, llm_candidate, refine_candidate
from .registry import Registry

SOURCES = ["llm", "library", "miner", "refine"]
DEFAULT_SETTINGS = {
    "lang": "zh",
    "pace": 40,  # seconds between meetings (lets the storyboard play)
    "use_llm": True,
    "account": "margin",
    "paper_capital": 100_000,
    "auto_refresh": True,
}


class Lab:
    def __init__(self, emit=None, reg: Registry | None = None):
        self.reg = reg or Registry()
        self.emit_fn = emit or (lambda e: None)
        self.running = False
        self.busy = False
        self._thread: threading.Thread | None = None
        self._wake = threading.Event()
        self.rng = random.Random()
        self.directives: list[str] = []
        self.current: dict | None = None
        self.log: list[dict] = []  # recent events for late joiners
        self.settings = {**DEFAULT_SETTINGS, **(self.reg.kv_get("settings") or {})}
        self.club = self.reg.kv_get("club") or {cid: {"affection": 20, "pats": 0, "bonks": 0} for cid in ORDER}
        self.bandit = self.reg.kv_get("bandit") or {s: [1.0, 1.0] for s in SOURCES}
        self.data_status: dict = {}

    # ---------------------------------------------------------------- events
    def emit(self, ev: dict) -> None:
        ev = {**ev, "t": time.time()}
        self.log.append(ev)
        self.log = self.log[-80:]
        try:
            self.emit_fn(ev)
        except Exception:
            traceback.print_exc()

    # ---------------------------------------------------------------- params
    def gate(self) -> GateConfig:
        s = self.club["saki"]
        strict = 1.0 + 0.04 * s["bonks"] - 0.02 * s["pats"]
        return GateConfig(strictness=max(0.85, min(1.35, strict)))

    def episode_no(self) -> int:
        return int(self.reg.kv_get("episodes", 0))

    # ------------------------------------------------------------------ loop
    def start(self) -> None:
        if self.running:
            return
        self.running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        self.emit({"type": "status", **self.status()})

    def stop(self) -> None:
        self.running = False
        self._wake.set()
        self.emit({"type": "status", **self.status()})

    def _loop(self) -> None:
        while self.running:
            if not any(available().values()):  # first run: wait for the data download
                self._wake.wait(timeout=3.0)
                continue
            try:
                self.run_episode()
            except Exception as e:  # never let one bad idea kill the club
                traceback.print_exc()
                self.emit({"type": "error", "message": str(e)[:300]})
            self._wake.clear()
            deadline = time.time() + float(self.settings.get("pace", 40))
            chatted = False
            while self.running and time.time() < deadline and not self.directives:
                if not chatted and deadline - time.time() > 15:
                    self.emit({"type": "chatter", "beats": D.idle_chatter(self.rng)})
                    chatted = True
                self._wake.wait(timeout=1.0)

    def choose_source(self) -> str:
        if self.directives:
            return "boss"
        options = ["library", "miner", "refine"]
        if self.settings.get("use_llm") and BRAIN.backends() and not all(
                BRAIN.bench.get(b, 0) > time.time() for b in BRAIN.backends()):
            options.append("llm")
        draws = {s: self.rng.betavariate(*self.bandit.get(s, [1, 1])) for s in options}
        if "llm" in draws:
            draws["llm"] += 0.15  # the club's reason to exist: new ideas first
        return max(draws, key=draws.get)

    def run_episode(self, forced: Candidate | None = None) -> dict:
        self.busy = True
        n = self.episode_no() + 1
        self.reg.kv_set("episodes", n)
        source = "boss" if forced else self.choose_source()
        directive = self.directives.pop(0) if source == "boss" and self.directives else None
        events: list[dict] = []

        def send(ev):
            ev = {**ev, "episode": n}
            events.append(ev)
            self.emit(ev)

        send({"type": "episode_start", "source": source, "pulls": self.reg.count() + 1,
              "beats": D.episode_start(n, source, self.rng)})
        send({"type": "thinking", "source": source, "beats": D.thinking(source, self.rng, directive)})
        cand = forced or self._propose(source, directive, send)
        if cand is None:
            source = "library"
            cand = library_candidate(self.reg, self.rng)
        cand_d = asdict(cand)
        self.current = {"episode": n, "candidate": cand_d, "stages": []}
        send({"type": "proposal", "candidate": cand_d, "beats": D.proposal(cand_d, self.rng)})

        def on_stage(st):
            self.current["stages"].append(st)
            send({"type": "stage", "stage": _slim(st), "beats": D.stage(st, self.rng)})

        ev = evaluate_candidate(cand, self.reg, self.gate(), on_stage=on_stage, episode=n)
        lockbox_fail = any(r.get("gate") == "lockbox" and not r.get("pass") for r in ev.reasons)
        # bandit + memory
        reward = {"promote": 1.0, "reserve": 0.5}.get(ev.verdict, 0.0)
        a, b = self.bandit.get(source, [1.0, 1.0])
        self.bandit[source] = [a + reward, b + (1 - reward)]
        self.reg.kv_set("bandit", self.bandit)
        zh, en = D.lesson_text(cand.family, ev.verdict, ev.reasons)
        self.reg.add_lesson(cand.family or "", cand.universe, zh, en, ev.verdict)
        if ev.verdict == "promote":
            F.invalidate()
        send({"type": "episode_end", "trial": ev.trial_id, "verdict": ev.verdict, "tier": ev.tier,
              "title_zh": cand.title_zh, "title_en": cand.title_en, "expr": cand.expr,
              "posterior": (ev.report or {}).get("posterior"), "sharpe": (ev.report or {}).get("sharpe"),
              "beats": D.reaction(ev.verdict, ev.tier, self.rng, lockbox_fail)})
        self.reg.add_episode(ev.trial_id, source, ev.verdict, events)
        self.current = None
        self.busy = False
        if ev.verdict == "promote":
            self.emit({"type": "fund"})
        self.emit({"type": "status", **self.status()})
        return ev.summary()

    def _propose(self, source: str, directive: str | None, send) -> Candidate | None:
        if source == "llm":
            return llm_candidate(self.reg)
        if source == "boss":
            c = llm_candidate(self.reg, directive=directive, source="boss") if self.settings.get("use_llm") else None
            return c or library_candidate(self.reg, self.rng, directive_families(directive or ""))
        if source == "refine":
            c = refine_candidate(self.reg, self.rng)
            if c is None and self.settings.get("use_llm"):
                near = [t for t in self.reg.list(limit=60) if t["status"] == "reserve"]
                if near:
                    c = llm_candidate(self.reg, refine_of=near[0], source="refine")
            return c
        if source == "miner":
            opts = [("us", "long_short"), ("macro", "time_series")]
            opts = [o for o in opts if available().get(o[0])]
            u, m = self.rng.choice(opts)
            miner = Miner(u, m, seed=self.rng.randrange(1 << 30))

            def prog(g, f, e):
                send({"type": "mining", "generation": g, "fitness": f, "expr": e, "beats": [
                    D.b("ren", f"第 {g + 1} 代……最优适应度 {f:.2f}", f"Generation {g + 1}... best fitness {f:.2f}", "special", "type", "zzz")]})

            out = miner.run(on_progress=prog)
            key = f"shadow:{u}"
            self.reg.kv_set(key, int(self.reg.kv_get(key, 0)) + max(0, out["evals"] - 1))
            return Candidate(expr=out["expr"], universe=u, mode=m, mechanism="statistical", source="miner",
                             title_zh="遗传挖掘信号", title_en="Mined signal",
                             thesis_zh=f"遗传算法在训练段挖出的公式（{out['evals']} 次评估，全部计入抽卡数）。",
                             thesis_en=f"Found by the GP miner on the train region ({out['evals']} evaluations, all counted as pulls).")
        return library_candidate(self.reg, self.rng)

    # ----------------------------------------------------------- the Advisor
    def add_directive(self, text: str) -> dict:
        text = (text or "").strip()[:200]
        if not text:
            return {"ok": False}
        self.directives.append(text)
        self._wake.set()
        beat = D.b("mio", f"收到，顾问。下一轮就按「{text[:30]}」来。", f"Understood, Advisor. Next round follows \"{text[:40]}\".", "joy", "write", "note")
        self.emit({"type": "directive", "text": text, "beats": [beat]})
        return {"ok": True, "queued": len(self.directives)}

    def interact(self, who: str, kind: str) -> dict:
        if who not in CAST or kind not in ("pat", "bonk"):
            return {"ok": False}
        c = self.club.setdefault(who, {"affection": 20, "pats": 0, "bonks": 0})
        if kind == "pat":
            c["pats"] += 1
            c["affection"] = min(100, c["affection"] + 3)
        else:
            c["bonks"] += 1
            c["affection"] = max(0, c["affection"] - 2)
        self.reg.kv_set("club", self.club)
        beat = D.interaction(who, kind, self.rng)
        effect = None
        if who == "saki":
            effect = {"strictness": self.gate().strictness}
        self.emit({"type": "interaction", "who": who, "kind": kind, "beats": [beat], "club": self.club, "effect": effect})
        return {"ok": True, "beat": beat, "club": self.club, "effect": effect}

    def update_settings(self, patch: dict) -> dict:
        for k, v in patch.items():
            if k in DEFAULT_SETTINGS:
                self.settings[k] = v
        self.reg.kv_set("settings", self.settings)
        self.emit({"type": "status", **self.status()})
        return self.settings

    # ----------------------------------------------------------------- views
    def fund_brief(self) -> dict:
        st = F.fund_state(self.reg, F.FundConfig(account=self.settings.get("account", "margin")))
        return st

    def status(self) -> dict:
        return {
            "running": self.running, "busy": self.busy, "episode": self.episode_no(),
            "pulls": self.reg.count(), "promoted": len(self.reg.list(status="promoted")),
            "brain": BRAIN.status(), "settings": self.settings, "club": self.club,
            "strictness": self.gate().strictness, "directives": list(self.directives),
            "data": {u: ok for u, ok in available().items()}, "data_status": self.data_status,
            "bandit": self.bandit,
        }

    def refresh_data(self) -> dict:
        out = {}
        for u, ok in available().items():
            if not ok:
                continue
            self.data_status = {"refreshing": u}
            self.emit({"type": "status", **self.status()})
            try:
                out[u] = refresh_universe(u)
                load_panel(u, reload=True)
            except Exception as e:
                out[u] = {"error": str(e)[:200]}
        F.invalidate()
        self.data_status = {"refreshed": time.time(), "result": out}
        self.emit({"type": "status", **self.status()})
        return out

    def bootstrap_data(self) -> None:
        """First run: download whatever universes are missing (small ones first)."""
        missing = [u for u in ("macro", "sectors", "us") if not available().get(u)]
        for u in missing:
            def prog(done, total, t, u=u):
                if done % 10 == 0 or done == total:
                    self.data_status = {"fetching": u, "done": done, "total": total}
                    self.emit({"type": "status", **self.status()})
            try:
                fetch_universe(u, progress=prog)
            except Exception as e:
                self.data_status = {"error": f"{u}: {str(e)[:160]}"}
                self.emit({"type": "status", **self.status()})
                return
        if missing:
            self.data_status = {"ready": True, "fetched": missing}
            self.emit({"type": "status", **self.status()})

    def paper_cycle(self) -> dict:
        st = self.fund_brief()
        b = paper.cycle(self.reg, st.get("targets") or {})
        s = paper.summary(b)
        self.emit({"type": "paper", "paper": s})
        return s


def _slim(st: dict) -> dict:
    """Stage payload for the wire (tearsheet details are fetched on demand)."""
    keep = dict(st)
    for k in ("yearly", "capacity"):
        if k in keep and isinstance(keep[k], (dict, list)) and len(str(keep[k])) > 4000:
            keep.pop(k)
    return keep
