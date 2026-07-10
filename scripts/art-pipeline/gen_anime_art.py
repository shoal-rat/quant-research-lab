#!/usr/bin/env python3
"""Drive the Codex CLI image generator to produce the anime-movie art set.

Usage:
  python3 scripts/art-pipeline/gen_anime_art.py list
  python3 scripts/art-pipeline/gen_anime_art.py run <job> [<job> ...]   # parallel (max 3)
  python3 scripts/art-pipeline/gen_anime_art.py auto                    # run everything missing, in dependency order
  python3 scripts/art-pipeline/gen_anime_art.py missing

Raw sheets land in work/anime-raw/<job>.png (gitignored).
Slicing/packing into public/assets is done by scripts/art-pipeline/build_anime_assets.py.
"""
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORK = os.path.join(ROOT, "work", "anime-raw")
AGENTS2D = os.path.join(ROOT, "public", "assets", "generated", "agents-2d")
# the Codex CLI ships inside the ChatGPT desktop app now (old Codex.app path kept as fallback)
_CODEX_CANDIDATES = [
    "/Applications/ChatGPT.app/Contents/Resources/codex",
    "/Applications/Codex.app/Contents/Resources/codex",
]
CODEX = next((p for p in _CODEX_CANDIDATES if os.path.exists(p)), _CODEX_CANDIDATES[0])

STYLE = (
    "modern anime feature-film style (in the spirit of a Makoto Shinkai / Kyoto Animation theatrical production): "
    "adult characters with realistic 6-to-6.5-head-tall proportions (NOT chibi, NOT super-deformed), "
    "soft painterly cel shading with two shadow tones plus a gentle warm rim light, "
    "large expressive detailed eyes with layered iris highlights, flowing hair drawn in distinct strand clusters, "
    "clean thin lineart with color-traced edges, subtle cinematic color grading"
)
GREEN = (
    "The ENTIRE background must be flat pure chroma-key green (#00FF00) everywhere — "
    "no gradients, no floor, no ground shadows, no text, no labels, no watermark, no border or grid lines. "
    "After saving, verify the background pixels are exactly #00FF00 and re-save normalized if not. "
    "CRITICAL: never tint any part of the character toward the background color — clothing, hair and skin "
    "must contain zero chroma-green pixels; when normalizing, only recolor pixels OUTSIDE the characters."
)
# Light/white outfits get eaten when the model normalizes near-white pixels into a
# green screen; those characters are generated on magenta instead (nobody wears magenta).
MAGENTA = (
    "The ENTIRE background must be flat pure chroma-key magenta (#FF00FF) everywhere — "
    "no gradients, no floor, no ground shadows, no text, no labels, no watermark, no border or grid lines. "
    "After saving, verify the background pixels are exactly #FF00FF and re-save normalized if not. "
    "CRITICAL: never tint any part of the character toward the background color — clothing, hair and skin "
    "must contain zero magenta pixels; when normalizing, only recolor pixels OUTSIDE the characters."
)

# Character look bibles — identity comes from the attached chibi avatar; proportions must NOT.
IDENTITY_NOTE = (
    "The attached small image shows this character's established IDENTITY: copy the hair color and hairstyle, "
    "eye color, glasses, outfit and accessories faithfully — but the attached image is chibi and you must "
    "REDESIGN the body as a tall adult with realistic anime-movie proportions as specified in the style."
)

CHARS = {
    "strategy-researcher": dict(
        name="Mira Signal",
        look=(
            "Mira Signal, a young woman quant strategy researcher: very long wavy silver-lavender hair with a "
            "stray ahoge and two small gold X-shaped hairpins on her right side, warm amber eyes behind round "
            "thin-rimmed glasses, gentle confident smile, crisp white blouse with sleeves rolled to the forearm, "
            "high-waisted black pencil skirt, green ID lanyard around her neck, holding a black leather research notebook"
        ),
        actions={
            "thinking": "standing, tilting her head with one hand on her chin, notebook hugged to her chest, pondering",
            "writing-whiteboard": "reaching up and writing on an invisible whiteboard with a marker, seen from a back three-quarter angle",
            "debating": "leaning forward, one arm sweeping out as she argues a point, notebook in the other hand",
            "eureka": "one fist thrust to the sky, face lit with joy, hair lifting, notebook raised in the other hand",
        },
    ),
    "code-engineer": dict(
        name="Ren Compile",
        look=(
            "Ren Compile, a young man software engineer: messy black hair falling over his forehead, bright blue "
            "eyes behind dark rectangular glasses, black tech hoodie with a small cyan </> patch on the chest and "
            "thin cyan zipper accents, grey ID lanyard, slim dark jeans, white sneakers, a slim dark laptop under his arm"
        ),
        actions={
            "coding": "standing while typing intensely on the laptop balanced on one forearm, focused eyes reflecting screen light",
            "bug-meltdown": "clutching his head with both hands, laptop tucked under one arm, screaming at the sky in despair",
            "tired": "shoulders slumped, dark circles under his eyes, holding a paper coffee cup, hood half up",
            "deploy-victory": "both fists raised in triumph, laptop held high in one hand, huge grin",
        },
    ),
    "risk-reviewer": dict(
        name="Sana Risk",
        look=(
            "Sana Risk, a woman risk officer with a composed, severe elegance: ash-beige hair tied in a loose low "
            "bun with side bangs, sharp orange-amber eyes behind thin oval glasses, beige belted trench coat worn "
            "open over a soft dove-grey blouse and charcoal pencil skirt (no pure-white fabric anywhere), dark tights, "
            "holding a slate-grey tablet like a clipboard"
        ),
        bg="magenta",
        actions={
            "reviewing": "reading the tablet held in one hand, a red pen poised in the other, stern evaluating gaze",
            "audit-alarm": "eyes wide, pointing sharply at the tablet, loose papers whirling around her",
            "rejection-stamp": "slamming a big red REJECTED stamp downward with force, coat flaring",
            "controlled-approval": "reluctantly pressing a small green stamp, looking away with a resigned sigh",
        },
    ),
    "skeptic-researcher": dict(
        name="Ivo Doubt",
        look=(
            "Ivo Doubt, a young man skeptic researcher: tousled jet-black hair with a small gold X pin above his ear, "
            "heavy-lidded dark brown eyes, permanent faint smirk, long dark-espresso overcoat worn open over a black "
            "shirt, silver ID badge clipped to the lapel, charcoal-grey trousers (all clothing dark or mid-tone, no "
            "pure-white or pale fabric), carrying a worn oxblood-red notebook"
        ),
        bg="magenta",
        actions={
            "skeptical": "arms crossed, one eyebrow raised high, weight on one hip, unimpressed",
            "whispering": "leaning sideways with one hand cupped beside his mouth, eyes sliding to the side",
            "gotcha": "pointing dramatically at the viewer with a wide triumphant grin, coat swirling",
            "silent-judgment": "hands in coat pockets, staring flatly at the viewer, dead-eyed deadpan",
        },
    ),
    "experiment-manager": dict(
        name="Noa Ledger",
        look=(
            "Noa Ledger, a woman lab director with warm authority: long wavy deep-purple hair in a high ponytail "
            "with a lively ahoge, round glasses over hazel-brown eyes, white lab coat with rolled sleeves worn over "
            "a black turtleneck dress, brass clipboard-tablet in hand, small silver pocket-watch chain on the coat"
        ),
        actions={
            "presenting": "gesturing to an invisible chart with an extended telescoping pointer, confident smile",
            "calling-meeting": "hands cupped around her mouth calling everyone over, leaning forward energetically",
            "final-verdict": "arm extended in a decisive flat-palm cut, eyes closed, delivering the final word",
            "team-encourage": "clapping warmly, eyes closed in a proud smile, slight bow of the head",
        },
    ),
    "data-manager": dict(
        name="Kira Timestamp",
        look=(
            "Kira Timestamp, a woman data curator: very long wavy periwinkle-blue hair with a braided crown strand "
            "and one tall ahoge, clear blue eyes behind round gold-rimmed glasses, white lab coat over a navy pinafore "
            "dress and light-blue shirt, blue ID lanyard, hugging a thick blue data binder and a slate tablet"
        ),
        actions={
            "checking-data": "inspecting the tablet through a magnifying glass, one eye comically enlarged, meticulous",
            "carrying-files": "carrying a tottering stack of colored binders taller than her head, peeking around it",
            "dirty-timestamp": "holding a single sheet at arm's length with two fingers, face scrunched in disgust",
            "missing-data-panic": "papers exploding around her, hands on cheeks, wide-eyed panic",
            "clean-data-pride": "hugging the blue binder tight, chin up, radiant sparkling pride",
        },
    ),
}

EXPRESSIONS = {
    "delighted": "leaping with joy, arms flung wide, sparkles around, beaming open-mouth smile",
    "shocked": "recoiling backwards, jaw dropped, pupils shrunk to dots, hands half-raised",
    "angry": "fists clenched at the sides, shoulders squared, brow furrowed hard, faint red anger tick",
    "smug": "arms crossed, chin tilted up, one-corner smirk, half-lidded eyes",
    "worried": "hands clasped near the mouth, brows knit, glancing aside, faint sweat drop",
    "crying": "comic waterfall tears, mouth wobbling, fists rubbing eyes",
    "embarrassed": "one hand scratching the back of the head, cheeks glowing pink, awkward laugh, eyes closed",
    "determined": "one fist raised before the chest, eyes blazing with resolve, feet planted wide",
}
EXPR_ORDER = ["delighted", "shocked", "angry", "smug", "worried", "crying", "embarrassed", "determined"]

BUST_VARIANTS = [
    "bust portrait, chest-up, three-quarter angle facing slightly left, soft confident smile, looking at the viewer",
    "bust portrait, chest-up, facing the viewer straight on, gentle neutral expression",
    "bust portrait, chest-up, three-quarter angle facing slightly right, mid-laugh, eyes closed",
    "bust portrait, chest-up, dramatic low-key lighting, intense focused expression, wind in the hair",
]


def cellline(i, desc):
    return f"({i}) {desc}; "


def sheet_prompt(look, cells, extra="", bg=None):
    body = "".join(cellline(i + 1, c) for i, c in enumerate(cells))
    return (
        "Use your image generation tool to create ONE image in landscape orientation, then save it in the "
        "current working directory with the EXACT filename given at the end. "
        f"The image is an anime CHARACTER SHEET in {STYLE}. "
        f"It shows THE SAME character eight times: {look}. {IDENTITY_NOTE} {extra} "
        "The eight drawings are arranged in a strict grid of 2 rows x 4 columns, evenly spaced, all at the "
        "same scale, each drawing fully inside its own grid cell with clear background-color gaps between cells, "
        "no drawings touching or overlapping, FULL BODY from hair to shoes visible in every cell (except "
        "cells explicitly described as bust portraits), consistent outfit, face and hair in all eight. "
        f"TOP ROW, left to right: {body.split(';')[0]}; {'; '.join(body.split('; ')[1:4])}. "
        f"BOTTOM ROW, left to right: {'; '.join(body.split('; ')[4:8])}. {bg or GREEN}"
    )


JOBS = {}

for cid, c in CHARS.items():
    avatar = os.path.join(AGENTS2D, cid, "avatar.png")
    actions = list(c["actions"].items())
    bg_text = MAGENTA if c.get("bg") == "magenta" else GREEN
    # ---- sheet A: 4 idle directions + 4 walk directions (turnaround)
    a_cells = [
        "standing idle, relaxed, seen from the FRONT, arms natural",
        "standing idle seen from BEHIND (full back view, back of hair and outfit)",
        "standing idle in full LEFT profile, facing left",
        "standing idle in full RIGHT profile, facing right",
        "mid-stride walking toward the viewer (front view), natural arm swing",
        "mid-stride walking away from the viewer (back view)",
        "mid-stride walking to the LEFT in full profile",
        "mid-stride walking to the RIGHT in full profile",
    ]
    JOBS[f"{cid}_sheetA"] = dict(
        refs=[avatar],
        prompt=sheet_prompt(c["look"], a_cells, bg=bg_text) + f" Save as {cid}_sheetA.png.",
        out=f"{cid}_sheetA.png",
        needs=[],
    )
    style_ref_note = (
        "The second attached image is the already-approved sheet A of this exact character — match its art "
        "style, proportions, palette, face and outfit EXACTLY."
    )
    # ---- sheet B: role actions (4 or 5) + first expressions
    n_act = len(actions)
    b_cells = [f"{desc}" for _k, desc in actions] + [
        f"full-body dramatic emotion pose — {EXPRESSIONS[e]}" for e in EXPR_ORDER[: 8 - n_act]
    ]
    JOBS[f"{cid}_sheetB"] = dict(
        refs=[avatar, os.path.join(WORK, f"{cid}_sheetA.png")],
        prompt=sheet_prompt(c["look"], b_cells, extra=style_ref_note, bg=bg_text) + f" Save as {cid}_sheetB.png.",
        out=f"{cid}_sheetB.png",
        needs=[f"{cid}_sheetA"],
    )
    # ---- sheet C: remaining expressions + bust portraits
    rest = EXPR_ORDER[8 - n_act:]
    c_cells = [f"full-body dramatic emotion pose — {EXPRESSIONS[e]}" for e in rest] + BUST_VARIANTS[: 8 - len(rest)]
    JOBS[f"{cid}_sheetC"] = dict(
        refs=[avatar, os.path.join(WORK, f"{cid}_sheetA.png")],
        prompt=sheet_prompt(c["look"], c_cells, extra=style_ref_note, bg=bg_text) + f" Save as {cid}_sheetC.png.",
        out=f"{cid}_sheetC.png",
        needs=[f"{cid}_sheetA"],
    )

JOBS["banner_group"] = dict(
    refs=[os.path.join(AGENTS2D, cid, "avatar.png") for cid in CHARS],
    prompt=(
        "Use your image generation tool to create ONE image in wide landscape orientation (16:9), then save it "
        "in the current working directory as banner_group.png. "
        f"A cinematic anime-movie key visual in {STYLE}: the six quant researchers of a trading-floor research "
        "lab standing together in their softly lit office at dusk, huge wall screens glowing with abstract "
        "charts behind them (screens show only abstract glowing lines, NO readable text or numbers anywhere). "
        "The six attached small images are the six characters' identity references (hair color/style, glasses, "
        "outfits) — redraw each as a tall adult in the specified movie style, NOT chibi. Arrange them in a "
        "loose confident group: some seated on desk edges, some standing, one pointing at a screen, warm "
        "window light from the left, dust motes in the air, cinematic depth of field. "
        "No text, no logos, no watermark. Save as banner_group.png."
    ),
    out="banner_group.png",
    needs=[],
)


def run_job(name):
    job = JOBS[name]
    out_path = os.path.join(WORK, job["out"])
    refs = [r for r in job.get("refs", []) if os.path.exists(r)]
    cmd = [CODEX, "exec", "--cd", WORK, "--sandbox", "workspace-write",
           "--skip-git-repo-check", "--color", "never", "--ephemeral"]
    for r in refs:
        cmd += ["-i", r]
    cmd.append("-")
    try:
        res = subprocess.run(cmd, input=job["prompt"], capture_output=True, text=True, timeout=1200)
    except subprocess.TimeoutExpired:
        return name, False, "timeout"
    ok = os.path.exists(out_path) and os.path.getsize(out_path) > 30000
    tail = ((res.stdout or "") + (res.stderr or "")).strip().splitlines()[-3:]
    return name, ok, " | ".join(tail)


def done(name):
    return os.path.exists(os.path.join(WORK, JOBS[name]["out"]))


def run_batch(names):
    results = {}
    with ThreadPoolExecutor(max_workers=3) as ex:
        futs = {ex.submit(run_job, n): n for n in names}
        for f in as_completed(futs):
            name, ok, msg = f.result()
            results[name] = ok
            print(("OK   " if ok else "FAIL ") + name + "  " + msg[-200:], flush=True)
    return results


def main():
    os.makedirs(WORK, exist_ok=True)
    if len(sys.argv) < 2 or sys.argv[1] == "list":
        for k in JOBS:
            print(("done " if done(k) else "todo ") + k)
        return
    if sys.argv[1] == "missing":
        for k in JOBS:
            if not done(k):
                print(k)
        return
    if sys.argv[1] == "run":
        names = [n for n in sys.argv[2:] if n in JOBS]
        bad = [n for n in sys.argv[2:] if n not in JOBS]
        if bad:
            print("unknown jobs:", bad)
            sys.exit(1)
        run_batch(names)
        return
    if sys.argv[1] == "auto":
        # waves: run everything whose deps are satisfied, until no progress
        for wave in range(10):
            todo = [k for k in JOBS if not done(k) and all(done(d) for d in JOBS[k]["needs"])]
            if not todo:
                break
            print(f"--- wave {wave}: {todo}", flush=True)
            run_batch(todo)
        missing = [k for k in JOBS if not done(k)]
        print("MISSING AFTER AUTO:" if missing else "ALL DONE", missing or "")
        return
    print("unknown command")


if __name__ == "__main__":
    main()
