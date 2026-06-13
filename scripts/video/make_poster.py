"""Build a clickable poster for the trailer: a gameplay hero frame, darkened,
with a play button and caption. Writes docs/media/promo-poster.png."""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

def _find_root(p):
    p = os.path.dirname(os.path.abspath(p))
    while p != os.path.dirname(p):
        if os.path.exists(os.path.join(p, "package.json")):
            return p
        p = os.path.dirname(p)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


ROOT = _find_root(__file__)
W, H = 1280, 720
src = os.environ.get("QRL_POSTER_SRC", os.path.join(ROOT, "work", "video", "office_loop", "f_0001.png"))

# themed background
top = np.array([26, 21, 15], np.float32); bot = np.array([21, 28, 26], np.float32)
ramp = np.linspace(0, 1, H)[:, None]
bg = np.repeat((top[None] * (1 - ramp) + bot[None] * ramp)[:, None, :], W, axis=1).astype(np.uint8)
canvas = Image.fromarray(bg)

full = Image.open(src).convert("RGB")
sw = int(round(full.width * H / full.height))
full = full.resize((sw, H), Image.LANCZOS)
canvas.paste(full, ((W - sw) // 2, 0))

# darken
ov = Image.new("RGB", (W, H), (8, 8, 10))
canvas = Image.blend(canvas, ov, 0.42)
d = ImageDraw.Draw(canvas, "RGBA")

# play button
cx, cy, r = W // 2, H // 2 - 18, 62
d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(233, 180, 85, 235))
d.polygon([(cx - 22, cy - 32), (cx - 22, cy + 32), (cx + 34, cy)], fill=(26, 21, 15, 255))


def has_cjk(s):
    return any("一" <= c <= "鿿" for c in s)


def font(s, sz, bold=True):
    if has_cjk(s):
        return ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc", sz)
    return ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf", sz)


title = os.environ.get("QRL_POSTER_TITLE", "QUANT RESEARCH LAB")
poster_sub = os.environ.get("QRL_POSTER_SUB", "2-minute trailer  ·  real gameplay + sound")
if os.environ.get("QRL_LANG") == "zh":
    import json as _json
    _cp = os.environ.get("QRL_CARDS", os.path.join(ROOT, "work", "zh_cards.json"))
    if os.path.exists(_cp):
        _c = _json.load(open(_cp, encoding="utf-8"))
        title = _c.get("cardTitle", title)
        poster_sub = _c.get("posterSub", "2 分钟预告片  ·  全程实机 + 旁白")
f = font(title, 58)
tw = d.textlength(title, font=f)
d.text(((W - tw) / 2, cy + 86), title, font=f, fill=(246, 236, 217))
sub = poster_sub
fs = font(sub, 28, False)
sw2 = d.textlength(sub, font=fs)
d.text(((W - sw2) / 2, cy + 154), sub, font=fs, fill=(233, 180, 85))

out = os.environ.get("QRL_POSTER_OUT", os.path.join(ROOT, "docs", "media", "promo-poster.png"))
canvas.save(out, optimize=True)
print("poster:", round(os.path.getsize(out) / 1e6, 2), "MB")
