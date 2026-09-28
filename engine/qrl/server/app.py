"""HTTP + WebSocket server for the club.

Binds to 127.0.0.1 only. The research loop runs in a worker thread and its
events fan out to every connected WebSocket. After the US close the scheduler
refreshes market data and advances the paper book once per trading day.
"""
from __future__ import annotations

import asyncio
import json
import threading
from contextlib import asynccontextmanager
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .. import config
from ..cast.characters import CAST, ORDER
from ..data.universe import SPECS, available
from ..live import paper
from ..research import knowledge as K
from ..research.evaluate import Candidate
from ..research.lab import Lab

CLIENTS: set[WebSocket] = set()
QUEUE: asyncio.Queue | None = None
LOOP: asyncio.AbstractEventLoop | None = None


def _emit(ev: dict) -> None:
    if LOOP and QUEUE is not None:
        LOOP.call_soon_threadsafe(QUEUE.put_nowait, ev)


LAB = Lab(emit=_emit)


async def _broadcaster():
    while True:
        ev = await QUEUE.get()
        msg = json.dumps(ev, ensure_ascii=False, default=float)
        dead = []
        for ws in list(CLIENTS):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            CLIENTS.discard(ws)


async def _scheduler():
    """Once per US trading day, after 17:30 ET: refresh data, then run the paper cycle."""
    ny = ZoneInfo("America/New_York")
    while True:
        await asyncio.sleep(600)
        if not LAB.settings.get("auto_refresh"):
            continue
        now = datetime.now(ny)
        if now.weekday() >= 5 or (now.hour, now.minute) < (17, 30):
            continue
        today = now.strftime("%Y-%m-%d")
        if LAB.reg.kv_get("last_refresh_day") == today:
            continue
        LAB.reg.kv_set("last_refresh_day", today)
        await asyncio.to_thread(LAB.refresh_data)
        await asyncio.to_thread(LAB.paper_cycle)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global QUEUE, LOOP
    QUEUE = asyncio.Queue()
    LOOP = asyncio.get_running_loop()
    tasks = [asyncio.create_task(_broadcaster()), asyncio.create_task(_scheduler())]
    if not all(available().values()):
        threading.Thread(target=LAB.bootstrap_data, daemon=True).start()
    yield
    LAB.stop()
    for t in tasks:
        t.cancel()


app = FastAPI(title="Quant Research Lab", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
                   allow_methods=["*"], allow_headers=["*"])


# ------------------------------------------------------------------ models
class Directive(BaseModel):
    text: str


class Interact(BaseModel):
    who: str
    kind: str


class ManualEval(BaseModel):
    expr: str
    universe: str = "us"
    mode: str | None = None
    title: str | None = None


# ------------------------------------------------------------------ routes
@app.get("/api/status")
def status():
    return LAB.status()


@app.get("/api/cast")
def cast():
    return {"order": ORDER, "cast": CAST}


@app.get("/api/theory")
def theory():
    return {
        "doctrine": {"zh": K.doctrine("zh"), "en": K.doctrine("en")},
        "mechanisms": K.MECHANISMS,
        "families": [f.__dict__ for f in K.FAMILIES],
        "universes": {k: {"title": v.title, "title_zh": v.title_zh, "kind": v.kind, "available": available().get(k)}
                      for k, v in SPECS.items()},
    }


SLIM = ("id", "created", "episode", "expr", "canonical", "universe", "mode", "family", "mechanism", "source",
        "title_zh", "title_en", "thesis_zh", "thesis_en", "sr", "se", "sr_train", "sr_valid", "post_mean",
        "post_sd", "dsr", "verdict", "tier", "status", "promoted_at", "parent")


@app.get("/api/trials")
def trials(status: str | None = None, limit: int = 300):
    rows = LAB.reg.list(status=status, limit=limit)
    out = []
    for r in rows:
        d = {k: r.get(k) for k in SLIM}
        rep = r.get("report") or {}
        if isinstance(rep, dict):
            d["equity"] = (rep.get("equity") or [])[::8]
            d["max_dd"] = (rep.get("summary") or {}).get("max_dd")
            d["cagr"] = (rep.get("summary") or {}).get("cagr")
        out.append(d)
    return out


@app.get("/api/trials/{tid}")
def trial(tid: str):
    t = LAB.reg.get(tid)
    if not t:
        raise HTTPException(404)
    return t


@app.get("/api/fund")
def fund():
    return LAB.fund_brief()


@app.get("/api/paper")
def paper_state():
    s = paper.summary(paper.book(LAB.reg))
    s["alpaca"] = paper.alpaca_keys() is not None
    return s


@app.post("/api/paper/cycle")
def paper_cycle():
    return LAB.paper_cycle()


@app.post("/api/paper/reset")
def paper_reset():
    paper.reset(LAB.reg, float(LAB.settings.get("paper_capital", 100_000)))
    return paper.summary(paper.book(LAB.reg))


@app.get("/api/episodes")
def episodes():
    return LAB.reg.episodes()


@app.get("/api/episodes/{eid}")
def episode_events(eid: int):
    ev = LAB.reg.episode_events(eid)
    if ev is None:
        raise HTTPException(404)
    return ev


@app.get("/api/lessons")
def lessons():
    return LAB.reg.lessons()


@app.post("/api/start")
def start():
    LAB.start()
    return LAB.status()


@app.post("/api/stop")
def stop():
    LAB.stop()
    return LAB.status()


@app.post("/api/episode")
def episode_now():
    if LAB.running:
        LAB._wake.set()
        return {"ok": True, "queued": True}
    if LAB.busy:
        return {"ok": False, "busy": True}
    threading.Thread(target=LAB.run_episode, daemon=True).start()
    return {"ok": True}


@app.post("/api/directive")
def directive(d: Directive):
    r = LAB.add_directive(d.text)
    if not LAB.running and not LAB.busy:
        threading.Thread(target=LAB.run_episode, daemon=True).start()
    return r


@app.post("/api/interact")
def interact(i: Interact):
    return LAB.interact(i.who, i.kind)


@app.post("/api/settings")
def settings(patch: dict):
    return LAB.update_settings(patch)


@app.post("/api/data/refresh")
def data_refresh():
    threading.Thread(target=LAB.refresh_data, daemon=True).start()
    return {"ok": True}


@app.post("/api/eval")
def manual_eval(m: ManualEval):
    if LAB.busy:
        return {"ok": False, "busy": True}
    from ..research.proposer import infer_family

    fam = infer_family(m.expr, m.universe)
    c = Candidate(expr=m.expr, universe=m.universe, mode=m.mode, source="boss", family=fam,
                  mechanism=K.FAMILY_BY_KEY[fam].mechanism if fam else "statistical",
                  title_zh=m.title or "顾问的公式", title_en=m.title or "Advisor's formula")
    threading.Thread(target=LAB.run_episode, kwargs={"forced": c}, daemon=True).start()
    return {"ok": True}


@app.websocket("/ws")
async def ws(sock: WebSocket):
    await sock.accept()
    CLIENTS.add(sock)
    try:
        await sock.send_text(json.dumps({"type": "hello", "status": LAB.status(), "recent": LAB.log[-30:]},
                                        ensure_ascii=False, default=float))
        while True:
            await sock.receive_text()  # keepalive pings from the client
    except WebSocketDisconnect:
        pass
    finally:
        CLIENTS.discard(sock)


# ------------------------------------------------------------ static app
if config.APP_DIST.exists():
    app.mount("/assets", StaticFiles(directory=config.APP_DIST / "assets"), name="assets")
    if (config.APP_DIST / "art").exists():
        app.mount("/art", StaticFiles(directory=config.APP_DIST / "art"), name="art")

    @app.get("/{path:path}")
    def spa(path: str):
        f = config.APP_DIST / path
        if path and f.is_file():
            return FileResponse(f)
        return FileResponse(config.APP_DIST / "index.html")
else:
    @app.get("/")
    def root():
        return JSONResponse({"ok": True, "hint": "frontend not built: run `npm run build` in app/ or `npm run dev`"})
