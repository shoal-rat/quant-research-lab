"""The research brain: whichever LLM is signed in on this machine.

Ladder (first that answers wins, each call is independent):

  1. Claude Code CLI  (`claude -p`, your subscription — no API key)
  2. Anthropic API    (only if ANTHROPIC_API_KEY is set)
  3. Codex CLI        (`codex exec`, ships inside the ChatGPT desktop app)
  4. offline          (returns None; the lab falls back to the mechanism
                       library and the genetic miner, so research never stalls)

A backend that fails with an auth or rate-limit error is benched for a cool-down
so a logged-out CLI doesn't cost 5 seconds on every call.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
from pathlib import Path

import httpx

CODEX_CANDIDATES = [
    "/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex",
    "/Applications/ChatGPT.app/Contents/Resources/codex",
    "/Applications/Codex.app/Contents/Resources/codex",
]
COOLDOWN = 15 * 60


def extract_json(text: str):
    if not text:
        return None
    fence = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", text)
    cands = [fence.group(1)] if fence else []
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        cands.append(text[start:end + 1])
    for c in cands:
        try:
            return json.loads(c)
        except ValueError:
            continue
    return None


class Brain:
    def __init__(self):
        self.bench: dict[str, float] = {}
        self.last_backend: str | None = None
        self.last_error: str | None = None
        self.calls = 0
        self._lock = threading.Lock()
        self.cwd = Path(tempfile.gettempdir()) / "qrl-brain"
        self.cwd.mkdir(exist_ok=True)

    # ------------------------------------------------------------ discovery
    def codex_bin(self) -> str | None:
        env = os.environ.get("QRL_CODEX_BIN")
        if env and Path(env).exists():
            return env
        for c in CODEX_CANDIDATES:
            if Path(c).exists():
                return c
        return shutil.which("codex")

    def backends(self) -> list[str]:
        out = []
        if shutil.which("claude"):
            out.append("claude")
        if os.environ.get("ANTHROPIC_API_KEY"):
            out.append("api")
        if self.codex_bin():
            out.append("codex")
        return out

    def status(self) -> dict:
        now = time.time()
        return {
            "backends": self.backends(),
            "benched": {k: round(v - now) for k, v in self.bench.items() if v > now},
            "last_backend": self.last_backend,
            "last_error": self.last_error,
            "calls": self.calls,
        }

    # ------------------------------------------------------------------ call
    def ask_json(self, prompt: str, timeout: int = 240, model: str = "sonnet") -> dict | None:
        for b in self.backends():
            if self.bench.get(b, 0) > time.time():
                continue
            try:
                text = {"claude": self._claude, "api": self._api, "codex": self._codex}[b](prompt, timeout, model)
            except Exception as e:  # any backend failure just moves down the ladder
                text, err = None, str(e)
            else:
                err = None
            with self._lock:
                self.calls += 1
            data = extract_json(text or "")
            if data is not None:
                self.last_backend, self.last_error = b, None
                return data
            self.last_error = f"{b}: {err or (text or '')[:160]}"
            if err or _looks_like_auth_or_limit(text or ""):
                self.bench[b] = time.time() + COOLDOWN
        return None

    def _claude(self, prompt, timeout, model):
        cp = subprocess.run(
            ["claude", "-p", "--model", model, "--output-format", "json", "--tools", ""],
            input=prompt, capture_output=True, text=True, timeout=timeout, cwd=self.cwd)
        try:
            j = json.loads(cp.stdout)
        except ValueError:
            raise RuntimeError((cp.stdout + cp.stderr)[:200])
        if j.get("is_error"):
            raise RuntimeError(str(j.get("result"))[:200])
        return j.get("result", "")

    def _api(self, prompt, timeout, model):
        mid = {"sonnet": "claude-sonnet-5", "opus": "claude-opus-5-5", "haiku": "claude-haiku-4-5-20251001"}.get(model, model)
        r = httpx.post("https://api.anthropic.com/v1/messages", timeout=timeout, headers={
            "x-api-key": os.environ["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01",
            "content-type": "application/json"},
            json={"model": mid, "max_tokens": 2000, "messages": [{"role": "user", "content": prompt}]})
        r.raise_for_status()
        return "".join(b.get("text", "") for b in r.json().get("content", []))

    def _codex(self, prompt, timeout, model):
        out = self.cwd / f"codex-{os.getpid()}-{threading.get_ident()}.txt"
        cp = subprocess.run(
            [self.codex_bin(), "exec", "--skip-git-repo-check", "--sandbox", "read-only", "--ephemeral",
             "--output-last-message", str(out), "-"],
            input=prompt, capture_output=True, text=True, timeout=timeout, cwd=self.cwd)
        try:
            text = out.read_text()
        except FileNotFoundError:
            raise RuntimeError(cp.stderr[-200:])
        finally:
            out.unlink(missing_ok=True)
        return text


def _looks_like_auth_or_limit(text: str) -> bool:
    return bool(re.search(r"authenticat|log ?in|expired|usage limit|rate.?limit|429|quota", text, re.I))


BRAIN = Brain()
