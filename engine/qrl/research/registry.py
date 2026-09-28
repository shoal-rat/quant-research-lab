"""The trial registry — every backtest the lab ever runs is written here.

Multiple-testing corrections are only honest if the denominator is complete, so
nothing is evaluated off the books: LLM ideas, library samples, miner winners
and refinements all land in ``trials``. Each row stores the research-region
excess-return series (float32) so the lab can compute correlations, the
population prior, and CSCV PBO over everything it has tried.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
import uuid
from pathlib import Path

import numpy as np

from .. import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS trials (
    id TEXT PRIMARY KEY,
    created REAL,
    episode INTEGER,
    expr TEXT,
    canonical TEXT,
    universe TEXT,
    mode TEXT,
    book TEXT,
    family TEXT,
    mechanism TEXT,
    source TEXT,
    parent TEXT,
    title_zh TEXT, title_en TEXT, thesis_zh TEXT, thesis_en TEXT,
    sr REAL, se REAL, sr_train REAL, sr_valid REAL,
    post_mean REAL, post_sd REAL, dsr REAL,
    verdict TEXT, tier TEXT, status TEXT,
    reasons TEXT, report TEXT,
    ret_start TEXT, returns BLOB,
    promoted_at REAL, retired_at REAL
);
CREATE INDEX IF NOT EXISTS trials_universe ON trials(universe, mode);
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created REAL, trial TEXT, source TEXT, verdict TEXT, events TEXT
);
CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created REAL, family TEXT, universe TEXT, text_zh TEXT, text_en TEXT, kind TEXT
);
"""

_LOCK = threading.RLock()


class Registry:
    def __init__(self, path: Path | None = None):
        config.ensure_dirs()
        self.path = path or config.DB_PATH
        self.db = sqlite3.connect(self.path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        with _LOCK:
            self.db.executescript(SCHEMA)
            self.db.commit()

    # ---------------------------------------------------------------- trials
    def add_trial(self, row: dict, returns: np.ndarray | None, ret_start: str | None) -> str:
        tid = row.get("id") or uuid.uuid4().hex[:10]
        row = {**row, "id": tid, "created": time.time()}
        for k in ("book", "reasons", "report"):
            if k in row and not isinstance(row[k], str):
                row[k] = json.dumps(row[k], ensure_ascii=False, default=float)
        row["returns"] = None if returns is None else np.asarray(returns, dtype=np.float32).tobytes()
        row["ret_start"] = ret_start
        cols = ",".join(row)
        qs = ",".join("?" for _ in row)
        with _LOCK:
            self.db.execute(f"INSERT OR REPLACE INTO trials ({cols}) VALUES ({qs})", list(row.values()))
            self.db.commit()
        return tid

    def update(self, tid: str, **fields):
        for k in ("reasons", "report"):
            if k in fields and not isinstance(fields[k], str):
                fields[k] = json.dumps(fields[k], ensure_ascii=False, default=float)
        sets = ",".join(f"{k}=?" for k in fields)
        with _LOCK:
            self.db.execute(f"UPDATE trials SET {sets} WHERE id=?", [*fields.values(), tid])
            self.db.commit()

    def count(self, universe: str | None = None) -> int:
        q = "SELECT COUNT(*) FROM trials" + (" WHERE universe=?" if universe else "")
        with _LOCK:
            return self.db.execute(q, (universe,) if universe else ()).fetchone()[0]

    def population(self, universe: str, mode: str, exclude: str | None = None):
        with _LOCK:
            rows = self.db.execute(
                "SELECT sr, se FROM trials WHERE universe=? AND mode=? AND sr IS NOT NULL AND id IS NOT ?",
                (universe, mode, exclude)).fetchall()
        return np.array([r[0] for r in rows], float), np.array([r[1] for r in rows], float)

    def seen(self, canonical: str, universe: str, mode: str) -> dict | None:
        with _LOCK:
            r = self.db.execute("SELECT * FROM trials WHERE canonical=? AND universe=? AND mode=?",
                                (canonical, universe, mode)).fetchone()
        return dict(r) if r else None

    def get(self, tid: str) -> dict | None:
        with _LOCK:
            r = self.db.execute("SELECT * FROM trials WHERE id=?", (tid,)).fetchone()
        return _row(r) if r else None

    def list(self, status: str | None = None, limit: int = 500) -> list[dict]:
        q = "SELECT * FROM trials" + (" WHERE status=?" if status else "") + " ORDER BY created DESC LIMIT ?"
        with _LOCK:
            rows = self.db.execute(q, (status, limit) if status else (limit,)).fetchall()
        return [_row(r, with_returns=False) for r in rows]

    def returns_of(self, tid: str):
        import pandas as pd
        with _LOCK:
            r = self.db.execute("SELECT returns, ret_start FROM trials WHERE id=?", (tid,)).fetchone()
        if not r or r[0] is None:
            return None
        return np.frombuffer(r[0], dtype=np.float32).astype(float), pd.Timestamp(r[1])

    def returns_matrix(self, universe: str, ids: list[str] | None = None, limit: int = 60):
        """Aligned research-region return matrix (T x K) for the universe's trials."""
        with _LOCK:
            if ids:
                q = f"SELECT id, returns, ret_start FROM trials WHERE id IN ({','.join('?' * len(ids))})"
                rows = self.db.execute(q, ids).fetchall()
            else:
                rows = self.db.execute(
                    "SELECT id, returns, ret_start FROM trials WHERE universe=? AND returns IS NOT NULL "
                    "ORDER BY created DESC LIMIT ?", (universe, limit)).fetchall()
        series = {}
        for r in rows:
            if r[1] is None:
                continue
            series[r[0]] = (np.frombuffer(r[1], dtype=np.float32).astype(float), r[2])
        return series

    # ---------------------------------------------------------------- misc
    def kv_get(self, k: str, default=None):
        with _LOCK:
            r = self.db.execute("SELECT v FROM kv WHERE k=?", (k,)).fetchone()
        return json.loads(r[0]) if r else default

    def kv_set(self, k: str, v) -> None:
        with _LOCK:
            self.db.execute("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)", (k, json.dumps(v, default=float)))
            self.db.commit()

    def add_episode(self, trial: str | None, source: str, verdict: str, events: list) -> int:
        with _LOCK:
            cur = self.db.execute("INSERT INTO episodes (created, trial, source, verdict, events) VALUES (?,?,?,?,?)",
                                  (time.time(), trial, source, verdict, json.dumps(events, ensure_ascii=False, default=float)))
            self.db.commit()
            return int(cur.lastrowid)

    def episodes(self, limit: int = 50) -> list[dict]:
        with _LOCK:
            rows = self.db.execute("SELECT id, created, trial, source, verdict FROM episodes ORDER BY id DESC LIMIT ?",
                                   (limit,)).fetchall()
        return [dict(r) for r in rows]

    def episode_events(self, eid: int) -> list | None:
        with _LOCK:
            r = self.db.execute("SELECT events FROM episodes WHERE id=?", (eid,)).fetchone()
        return json.loads(r[0]) if r else None

    def add_lesson(self, family: str, universe: str, zh: str, en: str, kind: str) -> None:
        with _LOCK:
            self.db.execute("INSERT INTO lessons (created, family, universe, text_zh, text_en, kind) VALUES (?,?,?,?,?,?)",
                            (time.time(), family, universe, zh, en, kind))
            self.db.commit()

    def lessons(self, limit: int = 30) -> list[dict]:
        with _LOCK:
            rows = self.db.execute("SELECT * FROM lessons ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        return [dict(r) for r in rows]

    def family_stats(self) -> dict:
        with _LOCK:
            rows = self.db.execute(
                "SELECT family, universe, COUNT(*) n, SUM(status='promoted') p, AVG(post_mean) m "
                "FROM trials GROUP BY family, universe").fetchall()
        return {f"{r[0]}@{r[1]}": {"n": r[2], "promoted": r[3] or 0, "post_mean": r[4]} for r in rows}


def _row(r, with_returns: bool = False) -> dict:
    d = dict(r)
    d.pop("returns", None)
    for k in ("book", "reasons", "report"):
        if d.get(k):
            try:
                d[k] = json.loads(d[k])
            except (TypeError, ValueError):
                pass
    return d
