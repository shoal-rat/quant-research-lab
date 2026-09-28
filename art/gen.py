#!/usr/bin/env python3
"""Headless art generation runner for the Quant Research Lab v4 art set.

Drives the Codex CLI image tool (prompt on stdin, refs via -i), one job per
output file, N jobs in parallel. Jobs whose output already exists are skipped,
so the script is safely re-runnable.

usage: QRL_ART_WORK=/path/to/workdir python3 art/gen.py <job-id-glob> [--par 4] [--force]
       (references for later stages are cropped from raw/lineup.png into refs/)
"""
import concurrent.futures as cf
import fnmatch
import json
import os
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
# Raw generations are large and stay out of git: they live in QRL_ART_WORK.
ROOT = Path(os.environ.get("QRL_ART_WORK", HERE / "work"))
RAW = ROOT / "raw"
LOGS = ROOT / "logs"
CODEX = os.environ.get("QRL_CODEX_BIN", "/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex")

sys.path.insert(0, str(HERE))
from jobs import JOBS  # noqa: E402

SAVE_RULES = """
Use your image generation tool to create exactly ONE image, then save it into the current
working directory as `{name}`. Do NOT post-process, recolor, crop, resize, or "clean up" the
pixels afterwards; save the generated image exactly as produced. Do not create any other files.
Reply with one short line when done.
"""


def run_job(job):
    out = RAW / job["out"]
    if out.exists() and not FORCE:
        return job["id"], "skip", 0.0
    work = RAW / f".work-{job['id']}"
    work.mkdir(parents=True, exist_ok=True)
    name = Path(job["out"]).name
    prompt = SAVE_RULES.format(name=name) + "\n" + job["prompt"].strip() + "\n"
    args = [CODEX, "exec", "--cd", str(work), "--sandbox", "workspace-write",
            "--skip-git-repo-check", "--ephemeral"]
    for ref in job.get("refs", []):
        p = Path(ref)
        if not p.is_absolute():
            p = ROOT / ref
        args += ["-i", str(p)]
    args.append("-")
    t0 = time.time()
    with open(LOGS / f"{job['id']}.log", "w") as log:
        try:
            subprocess.run(args, input=prompt, text=True, stdout=log, stderr=subprocess.STDOUT,
                           timeout=15 * 60)
        except subprocess.TimeoutExpired:
            return job["id"], "timeout", time.time() - t0
    produced = work / name
    if not produced.exists():
        cands = sorted(work.glob("*.png"), key=lambda p: p.stat().st_mtime)
        produced = cands[-1] if cands else None
    if produced and produced.exists():
        out.parent.mkdir(parents=True, exist_ok=True)
        produced.replace(out)
        for f in work.iterdir():
            f.unlink()
        work.rmdir()
        return job["id"], "ok", time.time() - t0
    tail = (LOGS / f"{job['id']}.log").read_text()[-400:]
    return job["id"], "FAIL " + tail.replace("\n", " | "), time.time() - t0


if __name__ == "__main__":
    pats = [a for a in sys.argv[1:] if not a.startswith("--")]
    FORCE = "--force" in sys.argv
    par = 4
    if "--par" in sys.argv:
        par = int(sys.argv[sys.argv.index("--par") + 1])
        pats = [p for p in pats if p != str(par)]
    RAW.mkdir(exist_ok=True)
    LOGS.mkdir(exist_ok=True)
    todo = [j for j in JOBS if any(fnmatch.fnmatch(j["id"], p) for p in pats)]
    print(f"{len(todo)} jobs, parallel={par}", flush=True)
    with cf.ThreadPoolExecutor(par) as ex:
        futs = [ex.submit(run_job, j) for j in todo]
        for f in cf.as_completed(futs):
            jid, status, dt = f.result()
            print(json.dumps({"id": jid, "status": status, "sec": round(dt)}), flush=True)
