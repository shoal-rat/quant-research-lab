"""Composite the trailer: real gameplay frames + Ken Burns + caption bands +
crossfades, piped as raw RGB to ffmpeg (H.264). Produces work/video_silent.mp4.

Reads work/timeline.json. Footage in work/video/<source>/f_*.png (1920x1200)."""
import functools
import glob
import json
import math
import os
import re
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

def _find_root(p):
    p = os.path.dirname(os.path.abspath(p))
    while p != os.path.dirname(p):
        if os.path.exists(os.path.join(p, "package.json")):
            return p
        p = os.path.dirname(p)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


ROOT = _find_root(__file__)
VID = os.environ.get("QRL_VID", os.path.join(ROOT, "work", "video"))
tl = json.load(open(os.environ.get("QRL_TIMELINE", os.path.join(ROOT, "work", "timeline.json")), encoding="utf-8"))
W, H, FPS = tl["width"], tl["height"], tl["fps"]
OUT = os.environ.get("QRL_OUT", os.path.join(ROOT, "work", "video_silent.mp4"))
LANG = os.environ.get("QRL_LANG", "en")
CARD = {
    "title": "QUANT RESEARCH LAB",
    "sub": "Real data. Real gates. Really cute.",
    "outroFree": "Free & open source  ·  MIT",
    "outroUrl": "github.com/shoal-rat/quant-research-lab",
    "outroCta": "Press Start, and good luck, Boss.",
}
# Chinese (or any localized) card text comes from a JSON file to avoid passing
# non-ASCII through environment variables.
if LANG == "zh":
    _cp = os.environ.get("QRL_CARDS", os.path.join(ROOT, "work", "zh_cards.json"))
    if os.path.exists(_cp):
        _c = json.load(open(_cp, encoding="utf-8"))
        CARD.update({
            "title": _c.get("cardTitle", CARD["title"]),
            "sub": _c.get("cardSub", CARD["sub"]),
            "outroFree": _c.get("outroFree", CARD["outroFree"]),
            "outroUrl": _c.get("outroUrl", CARD["outroUrl"]),
            "outroCta": _c.get("outroCta", CARD["outroCta"]),
        })

# ---------------------------------------------------------------- fonts
FONT_LAT = "C:/Windows/Fonts/segoeuib.ttf"      # Segoe UI Bold
FONT_LAT2 = "C:/Windows/Fonts/segoeui.ttf"      # Segoe UI
FONT_CJK = "C:/Windows/Fonts/msyhbd.ttc"        # YaHei Bold


@functools.lru_cache(maxsize=64)
def font(size, kind="bold"):
    path = FONT_LAT if kind == "bold" else FONT_LAT2
    return ImageFont.truetype(path, size)


@functools.lru_cache(maxsize=32)
def font_cjk(size):
    return ImageFont.truetype(FONT_CJK, size)


def has_cjk(s):
    return any("一" <= c <= "鿿" for c in s)


def pick_font(s, size, kind="bold"):
    return font_cjk(size) if has_cjk(s) else font(size, kind)


# strip emoji / symbols PIL can't color-render; keep CJK + basic punctuation
def clean(s):
    # strip emoji / pictographs that PIL can't color-render, but KEEP Latin,
    # CJK ideographs, and CJK/fullwidth punctuation (。，、！？：；（）《》…).
    out = []
    for c in s:
        o = ord(c)
        if (o < 0x2190 or 0x3000 <= o <= 0x303F or 0x3400 <= o <= 0x9FFF
                or 0xFF00 <= o <= 0xFFEF):
            out.append(c)
    return "".join(out).strip(" ·-")


# ---------------------------------------------------------------- theme bg
def make_bg():
    top = np.array([26, 21, 15], np.float32)
    bot = np.array([21, 28, 26], np.float32)
    ramp = np.linspace(0, 1, H)[:, None]
    col = (top[None, :] * (1 - ramp) + bot[None, :] * ramp)
    bg = np.repeat(col[:, None, :], W, axis=1).astype(np.uint8)
    return bg


BG = make_bg()


@functools.lru_cache(maxsize=96)
def load_full(path):
    im = Image.open(path).convert("RGB")
    return np.asarray(im, dtype=np.uint8)


@functools.lru_cache(maxsize=16)
def clip_frames(name):
    fs = sorted(glob.glob(os.path.join(VID, name, "f_*.png")))
    return tuple(fs)


def fit_gameplay(full):
    """Scale whole capture to height H, center on themed canvas (side bars)."""
    im = Image.fromarray(full)
    sw = int(round(full.shape[1] * H / full.shape[0]))
    im = im.resize((sw, H), Image.LANCZOS)
    canvas = BG.copy()
    x0 = (W - sw) // 2
    arr = np.asarray(im)
    if x0 >= 0:
        canvas[:, x0:x0 + sw] = arr
    else:
        canvas[:, :] = arr[:, -x0:-x0 + W]
    return canvas


def crop_zoom(full, cx, cy, zoom, drift=0.0):
    """Full-bleed 16:9 crop centered at (cx,cy) in 0..1, scaled to fill."""
    fh, fw = full.shape[:2]
    cw = fw / zoom
    ch = cw * H / W
    if ch > fh:
        ch = fh
        cw = ch * W / H
    cx_px = cx * fw + drift * 60
    cy_px = cy * fh
    x0 = int(np.clip(cx_px - cw / 2, 0, fw - cw))
    y0 = int(np.clip(cy_px - ch / 2, 0, fh - ch))
    crop = Image.fromarray(full[y0:y0 + int(ch), x0:x0 + int(cw)])
    return np.asarray(crop.resize((W, H), Image.LANCZOS))


def ken_burns(full, t01, path):
    """Smooth pan/zoom across a still for board segments."""
    fh, fw = full.shape[:2]
    # path: list of (cx,cy,zoom) keyframes; interpolate
    n = len(path)
    pos = t01 * (n - 1)
    i = min(int(pos), n - 2)
    f = pos - i
    a, b = path[i], path[i + 1]
    cx = a[0] + (b[0] - a[0]) * f
    cy = a[1] + (b[1] - a[1]) * f
    zoom = a[2] + (b[2] - a[2]) * f
    return crop_zoom(full, cx, cy, zoom)


# ---------------------------------------------------------------- captions
@functools.lru_cache(maxsize=64)
def split_chunks(text):
    """Split a VO line into short subtitle chunks (~1 readable line each)."""
    text = clean(text)
    if not text:
        return ()
    if has_cjk(text):
        parts = [p for p in re.split(r"(?<=[。！？，、；：])", text) if p.strip()]
        chunks, cur = [], ""
        for p in parts:
            if len(cur) + len(p) <= 20 or not cur:
                cur += p
            else:
                chunks.append(cur)
                cur = p
        if cur:
            chunks.append(cur)
        out = []
        for c in chunks:
            while len(c) > 26:
                out.append(c[:26])
                c = c[26:]
            out.append(c)
        return tuple(out)
    parts = [p for p in re.split(r"(?<=[.!?,;:])\s+", text) if p.strip()]
    chunks, cur = [], ""
    for p in parts:
        if len((cur + " " + p).split()) <= 9 or not cur:
            cur = (cur + " " + p).strip()
        else:
            chunks.append(cur)
            cur = p
    if cur:
        chunks.append(cur)
    return tuple(chunks)


def wrap_lines(d, text, fnt, max_w):
    if has_cjk(text):
        lines, cur = [], ""
        for ch in text:
            if d.textlength(cur + ch, font=fnt) > max_w and cur:
                lines.append(cur)
                cur = ch
            else:
                cur += ch
        if cur:
            lines.append(cur)
        return lines
    lines, cur = [], ""
    for w in text.split():
        test = (cur + " " + w).strip()
        if d.textlength(test, font=fnt) > max_w and cur:
            lines.append(cur)
            cur = w
        else:
            cur = test
    if cur:
        lines.append(cur)
    return lines


def draw_top_label(base, title, subtitle):
    """Small translucent pill at the top: the marketing section label."""
    title = clean(title)
    subtitle = clean(subtitle)
    if not title and not subtitle:
        return base
    img = Image.fromarray(base).convert("RGBA")
    ov = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    tf = pick_font(title, 30) if title else None
    sf = pick_font(subtitle, 18, "reg") if subtitle else None
    tw = d.textlength(title, font=tf) if title else 0
    sw = d.textlength(subtitle, font=sf) if subtitle else 0
    pill_w = int(max(tw, sw)) + 46
    pill_h = (38 if title else 6) + (24 if subtitle else 0) + 12
    x0 = (W - pill_w) // 2
    d.rounded_rectangle([x0, 14, x0 + pill_w, 14 + pill_h], radius=15, fill=(18, 14, 10, 170))
    y = 22
    if title:
        d.text(((W - tw) / 2, y), title, font=tf, fill=(246, 236, 217))
        y += 36
    if subtitle:
        d.text(((W - sw) / 2, y), subtitle, font=sf, fill=(233, 180, 85))
    return np.asarray(Image.alpha_composite(img, ov).convert("RGB"))


def draw_subtitle(base, text):
    """Burned-in subtitle of the spoken narration, bottom-centered."""
    text = clean(text)
    if not text:
        return base
    img = Image.fromarray(base).convert("RGBA")
    ov = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    fnt = pick_font(text, 34, "reg")
    lines = wrap_lines(d, text, fnt, W - 220)[:2]
    line_h = 44
    band_top = H - line_h * len(lines) - 30
    d.rectangle([0, band_top - 8, W, H], fill=(0, 0, 0, 125))
    y = band_top
    for ln in lines:
        lw = d.textlength(ln, font=fnt)
        d.text(((W - lw) / 2, y), ln, font=fnt, fill=(248, 244, 236),
               stroke_width=3, stroke_fill=(0, 0, 0))
        y += line_h
    return np.asarray(Image.alpha_composite(img, ov).convert("RGB"))


def active_chunk(seg, k):
    """The subtitle chunk to show at frame k, timed across the VO window."""
    chunks = split_chunks(seg["vo"])
    if not chunks:
        return ""
    local_voat = (seg["voAt"] - seg["start"]) if seg.get("voAt") is not None else 0.18
    vodur = seg.get("voDur", 0) or 0
    if vodur <= 0:
        return chunks[0]
    rel = k / FPS - local_voat
    if rel < 0:
        return ""
    weights = [max(1, len(c)) for c in chunks]
    tot = sum(weights)
    cum = 0
    for c, w in zip(chunks, weights):
        cum += w
        if rel <= cum / tot * vodur + 0.08:
            return c
    return chunks[-1]


def decorate(base, seg, k):
    base = draw_top_label(base, seg["title"], seg["subtitle"])
    base = draw_subtitle(base, active_chunk(seg, k))
    return base


# ---------------------------------------------------------------- cards
def card_title(t01):
    img = Image.fromarray(BG.copy())
    d = ImageDraw.Draw(img)
    # equity-curve doodle
    pts = [(120 + i * (W - 240) / 10, 470 - 120 * (i / 10) - 18 * math.sin(i)) for i in range(11)]
    d.line(pts, fill=(86, 228, 188), width=5, joint="curve")
    title = CARD["title"]
    f = pick_font(title, 78)
    tw = d.textlength(title, font=f)
    d.text(((W - tw) / 2 + 3, 243), title, font=f, fill=(0, 0, 0))
    d.text(((W - tw) / 2, 240), title, font=f, fill=(233, 180, 85))
    sub = CARD["sub"]
    fs = pick_font(sub, 34, "reg")
    sw = d.textlength(sub, font=fs)
    d.text(((W - sw) / 2, 336), sub, font=fs, fill=(205, 187, 155))
    # crown motif
    cx = W / 2
    d.polygon([(cx - 54, 200), (cx - 36, 168), (cx - 18, 192), (cx, 160),
               (cx + 18, 192), (cx + 36, 168), (cx + 54, 200)],
              fill=(233, 180, 85))
    return np.asarray(img)


def card_outro(t01):
    img = Image.fromarray(BG.copy())
    d = ImageDraw.Draw(img)
    title = CARD["title"]
    f = pick_font(title, 64)
    tw = d.textlength(title, font=f)
    d.text(((W - tw) / 2, 196), title, font=f, fill=(233, 180, 85))
    lines = [
        (CARD["outroFree"], pick_font(CARD["outroFree"], 30, "reg"), (205, 187, 155)),
        (CARD["outroUrl"], font(34), (138, 222, 199)),
        (CARD["outroCta"], pick_font(CARD["outroCta"], 28, "reg"), (233, 180, 85)),
    ]
    y = 290
    for text, ff, col in lines:
        lw = d.textlength(text, font=ff)
        d.text(((W - lw) / 2, y), text, font=ff, fill=col)
        y += 56
    return np.asarray(img)


# ---------------------------------------------------------------- per-source
SRC_FPS = {"office_loop": 15, "boss_directive": 16, "love_burst": 16,
           "whip_gossip": 16, "confetti": 15, "chinese": 15, "wallpaper": 13}
CLOSEUP = {  # id -> (clip, cx, cy, zoom, fstart, fend, clipfps)
    "s03": ("love_burst", 0.31, 0.42, 1.75, 0, 18, 12),   # Mira + heart burst, loop it
    "s06": ("office_loop", 0.82, 0.36, 1.70, None, None, 14),  # right side (Kira's corner)
    "s16": ("confetti", 0.36, 0.45, 1.70, 0, 40, 14),     # delighted cluster
}
BOARD_PATHS = [
    [(0.5, 0.22, 1.25), (0.5, 0.34, 1.2), (0.42, 0.5, 1.35)],   # NAV -> niche grid
    [(0.45, 0.55, 1.3), (0.5, 0.74, 1.25), (0.62, 0.78, 1.35)],  # bandit -> PBO
]
board_seen = [0]


def render_segment_frame(seg, k, outN):
    src = seg["source"]
    t01 = k / max(1, outN - 1)
    if src == "title":
        return card_title(t01)  # card already carries its own text
    if src == "outro":
        return draw_subtitle(card_outro(t01), active_chunk(seg, k))
    if src == "board":
        idx = BOARD_PATHS[min(board_seen[0], len(BOARD_PATHS) - 1)]
        still = load_full(os.path.join(VID, "board_still.png"))
        base = ken_burns(still, t01, idx)
        return decorate(base, seg, k)
    if src == "closeup":
        clip, cx, cy, zoom, f0, f1, cfps = CLOSEUP.get(seg["id"], ("office_loop", 0.5, 0.4, 1.7, None, None, 14))
        frames = clip_frames(clip)
        if f0 is None:
            si = int(k * cfps / FPS) % len(frames)
        else:
            rng = max(1, min(f1, len(frames)) - f0)
            si = f0 + (int(k * cfps / FPS) % rng)
        full = load_full(frames[si])
        base = crop_zoom(full, cx, cy, zoom, drift=0.4 * math.sin(t01 * math.pi))
        return decorate(base, seg, k)
    # generic gameplay clip
    frames = clip_frames(src)
    sfps = SRC_FPS.get(src, 14)
    si = int(k * sfps / FPS) % len(frames)
    full = load_full(frames[si])
    base = fit_gameplay(full)
    return decorate(base, seg, k)


# ---------------------------------------------------------------- main
total = tl["total"]
total_frames = round(total * FPS)
fade_in = int(0.5 * FPS)
fade_out = int(0.6 * FPS)
xfade_n = int(0.35 * FPS)

ff = imageio_ffmpeg.get_ffmpeg_exe()
cmd = [ff, "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
       "-r", str(FPS), "-i", "-", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p",
       "-crf", "19", "-preset", "medium", "-movflags", "+faststart", OUT]
proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

prev_frame = None
gf = 0  # global frame index
for si, seg in enumerate(tl["segments"]):
    f0 = round(seg["start"] * FPS)
    f1 = round(seg["end"] * FPS)
    outN = f1 - f0
    do_xfade = seg["transition"] == "crossfade" and prev_frame is not None
    for k in range(outN):
        frame = render_segment_frame(seg, k, outN)
        if do_xfade and k < xfade_n:
            a = (k + 1) / (xfade_n + 1)
            frame = (prev_frame.astype(np.float32) * (1 - a) + frame.astype(np.float32) * a).astype(np.uint8)
        # global fades
        if gf < fade_in:
            frame = (frame.astype(np.float32) * (gf / fade_in)).astype(np.uint8)
        elif gf >= total_frames - fade_out:
            frame = (frame.astype(np.float32) * max(0.0, (total_frames - gf) / fade_out)).astype(np.uint8)
        proc.stdin.write(frame.tobytes())
        prev_frame = frame
        gf += 1
    if seg["source"] == "board":
        board_seen[0] += 1
    sys.stdout.write(f"\r{seg['id']} done ({gf}/{total_frames})   ")
    sys.stdout.flush()

proc.stdin.close()
proc.wait()
print(f"\nvideo_silent.mp4: {os.path.getsize(OUT)/1e6:.1f} MB, {gf} frames, {gf/FPS:.1f}s")
