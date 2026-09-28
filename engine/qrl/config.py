"""Paths and engine-wide defaults.

Everything the lab persists lives under ``QRL_HOME`` (default: ``<repo>/var``):
market data (parquet), the trial registry (SQLite), the paper book, and logs.
"""
from __future__ import annotations

import os
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
HOME = Path(os.environ.get("QRL_HOME", REPO / "var"))
DATA_DIR = HOME / "data"
DB_PATH = HOME / "lab.sqlite"
BUNDLED_DATA = REPO / "engine" / "bundled"
APP_DIST = REPO / "app" / "dist"

TRADING_DAYS = 252


def ensure_dirs() -> None:
    for p in (HOME, DATA_DIR):
        p.mkdir(parents=True, exist_ok=True)
