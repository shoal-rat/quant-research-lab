"""Build a clickable poster for the trailer: a gameplay hero frame, darkened,
with a play button and caption. Writes docs/media/promo-poster.png."""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 1280, 720
src = os.path.join(ROOT, "work", "video", "office_loop", "f_0001.png")

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


def font(sz, bold=True):
    return ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf", sz)


title = "QUANT RESEARCH LAB"
f = font(58)
tw = d.textlength(title, font=f)
d.text(((W - tw) / 2, cy + 86), title, font=f, fill=(246, 236, 217))
sub = "2-minute trailer  ·  real gameplay + sound"
fs = font(28, False)
sw2 = d.textlength(sub, font=fs)
d.text(((W - sw2) / 2, cy + 154), sub, font=fs, fill=(233, 180, 85))

out = os.path.join(ROOT, "docs", "media", "promo-poster.png")
canvas.save(out, optimize=True)
print("poster:", round(os.path.getsize(out) / 1e6, 2), "MB")
