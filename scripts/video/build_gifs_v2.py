"""Assemble v2 demo GIFs from captured frames (quantized, <10MB each)."""
import glob
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAP = os.path.join(ROOT, "work", "capture")
OUT = os.path.join(ROOT, "docs", "media")

JOBS = [
    ("office2", "demo-office.gif", 440, 900),
    ("boss2", "demo-boss.gif", 460, 900),
]

for src, name, duration, width in JOBS:
    paths = sorted(glob.glob(os.path.join(CAP, src, "frame_*.png")))
    frames = []
    for p in paths:
        img = Image.open(p).convert("RGB")
        ratio = width / img.width
        img = img.resize((width, int(img.height * ratio)), Image.LANCZOS)
        frames.append(img.quantize(colors=200, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG))
    out = os.path.join(OUT, name)
    frames[0].save(
        out,
        save_all=True,
        append_images=frames[1:],
        duration=duration,
        loop=0,
        optimize=True,
    )
    size = os.path.getsize(out) / 1e6
    print(f"{name}: {len(frames)} frames, {size:.1f} MB")

# stills: downscale to keep the repo light
for src, name, width in [("board_v2.png", "board.png", 1100), ("office_zh.png", "office-zh.png", 1100)]:
    img = Image.open(os.path.join(CAP, src)).convert("RGB")
    ratio = width / img.width
    img = img.resize((width, int(img.height * ratio)), Image.LANCZOS)
    img.save(os.path.join(OUT, name), optimize=True)
    print(f"{name}: {os.path.getsize(os.path.join(OUT, name)) / 1e6:.2f} MB")
