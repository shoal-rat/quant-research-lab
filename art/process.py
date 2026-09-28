#!/usr/bin/env python3
"""Turn raw generated art (green screen) into game-ready WebP assets.

  uv run --with pillow --with numpy --with scipy art/process.py <raw_dir> <out_dir>

* soft chroma key on "greenness" (G - max(R, B)) with edge despill;
* chibi sheets (2 x 4 grids) are split by connected components per cell, scaled
  per sheet so the standing pose in cell 1 is exactly CHIBI_H px tall, and
  cropped around the feet so every frame shares a bottom-center anchor;
* the six expressions of a portrait share one crop box (they are pixel-aligned
  edits of the same image), so expression swaps never jitter;
* avatars are square head crops from the base portrait.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

CHIBI_H = 360
ORDER = ["akari", "shiori", "ren", "saki", "iori", "mio"]
SHEETS = {
    "a": ["idle", "walk1", "walk2", "back", "back_walk1", "back_walk2", "side_walk1", "side_walk2"],
    "b": [None, "type", "think", "write", "present", "drink", "read", "sig"],
    "c": [None, "joy", "angry", "cry", "shock", "blush", "dizzy", "victory"],
}
EXPR = ["base", "joy", "angry", "shock", "sad"]
SPECIAL = {"akari": "spark", "shiori": "fluster", "ren": "yawn", "saki": "tsun", "iori": "smug", "mio": "serious"}


def key(img: Image.Image, lo: float = 38, hi: float = 105) -> Image.Image:
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    greenness = g - np.maximum(r, b)
    alpha = np.clip((hi - greenness) / (hi - lo), 0, 1)
    bg = alpha < 0.02
    near = ndimage.binary_dilation(bg, iterations=3)
    spill = near & (g > np.maximum(r, b))
    a[..., 1] = np.where(spill, np.maximum(r, b), g)
    rgba = np.dstack([a, alpha * 255]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def bbox(alpha: np.ndarray, thr: int = 20):
    ys, xs = np.nonzero(alpha > thr)
    if len(xs) == 0:
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def split_sheet(img: Image.Image, rows: int = 2, cols: int = 4):
    arr = np.asarray(img)
    al = arr[..., 3]
    mask = ndimage.binary_dilation(al > 40, iterations=6)
    lab, n = ndimage.label(mask)
    H, W = al.shape
    cells = {}
    for i, sl in enumerate(ndimage.find_objects(lab), start=1):
        if sl is None:
            continue
        ys, xs = sl
        area = (lab[sl] == i).sum()
        if area < 400:
            continue
        cy, cx = (ys.start + ys.stop) / 2, (xs.start + xs.stop) / 2
        cell = (min(rows - 1, int(cy / (H / rows))), min(cols - 1, int(cx / (W / cols))))
        box = cells.get(cell)
        nb = (xs.start, ys.start, xs.stop, ys.stop)
        cells[cell] = nb if box is None else (min(box[0], nb[0]), min(box[1], nb[1]), max(box[2], nb[2]), max(box[3], nb[3]))
    out = []
    for r in range(rows):
        for c in range(cols):
            b = cells.get((r, c))
            if b is None:
                out.append(None)
                continue
            crop = img.crop(b)
            tb = bbox(np.asarray(crop)[..., 3])
            out.append(crop.crop(tb) if tb else crop)
    return out


def save(img: Image.Image, path: Path, q: int = 90):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "WEBP", quality=q, method=6)


def process_chibi(raw: Path, out: Path, manifest: dict):
    for cid in ORDER:
        entry = manifest.setdefault("chibi", {}).setdefault(cid, {})
        for sheet, names in SHEETS.items():
            p = raw / "chibi" / f"{cid}-{sheet}.png"
            if not p.exists():
                continue
            sprites = split_sheet(key(Image.open(p)))
            ref = sprites[0]
            if ref is None:
                continue
            s = CHIBI_H / ref.height
            for name, sp in zip(names, sprites):
                if name is None or sp is None:
                    continue
                sp = sp.resize((max(1, round(sp.width * s)), max(1, round(sp.height * s))), Image.LANCZOS)
                save(sp, out / "chibi" / cid / f"{name}.webp")
                entry[name] = [sp.width, sp.height]
        print("chibi", cid, len(entry))


def process_portraits(raw: Path, out: Path, manifest: dict):
    for cid in ORDER:
        names = EXPR + [SPECIAL[cid]]
        keyed = {}
        for n in names:
            p = raw / "portrait" / f"{cid}-{n}.png"
            if p.exists():
                keyed[n] = key(Image.open(p))
        boxes = [bbox(np.asarray(im)[..., 3], 30) for im in keyed.values()]
        boxes = [b for b in boxes if b]
        u = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
        pad = 8
        u = (max(0, u[0] - pad), max(0, u[1] - pad), min(1024, u[2] + pad), min(1536, u[3] + pad))
        ent = manifest.setdefault("portrait", {}).setdefault(cid, {})
        for n, im in keyed.items():
            face = "special" if n == SPECIAL[cid] else n
            crop = im.crop(u)
            save(crop, out / "portrait" / cid / f"{face}.webp", 88)
            ent[face] = [crop.width, crop.height]
        # avatar: square around the head, from the base portrait
        base = np.asarray(keyed["base"].crop(u))[..., 3]
        H, W = base.shape
        top = bbox(base[: int(H * 0.30)], 60)
        if top:
            cx = (top[0] + top[2]) / 2
            side = int(min(W, (top[2] - top[0]) * 0.85))
            y0 = max(0, top[1] - int(side * 0.02))
            box = (int(max(0, cx - side / 2)), y0, int(min(W, cx + side / 2)), y0 + side)
            av = keyed["base"].crop(u).crop(box).resize((256, 256), Image.LANCZOS)
            save(av, out / "avatar" / f"{cid}.webp", 90)
        print("portrait", cid, list(ent))


def process_bg(raw: Path, out: Path, manifest: dict):
    for p in sorted((raw / "bg").glob("*.png")):
        im = Image.open(p).convert("RGB")
        save(im, out / "bg" / f"{p.stem}.webp", 86)
        small = im.resize((im.width // 4, im.height // 4), Image.LANCZOS)
        save(small, out / "bg" / f"{p.stem}-thumb.webp", 70)
        manifest.setdefault("bg", {})[p.stem] = [im.width, im.height]
    print("bg", list(manifest.get("bg", {})))


if __name__ == "__main__":
    raw, out = Path(sys.argv[1]), Path(sys.argv[2])
    only = sys.argv[3:] or ["chibi", "portrait", "bg"]
    mpath = out / "manifest.json"
    manifest = json.loads(mpath.read_text()) if mpath.exists() else {}
    if "chibi" in only:
        process_chibi(raw, out, manifest)
    if "portrait" in only:
        process_portraits(raw, out, manifest)
    if "bg" in only:
        process_bg(raw, out, manifest)
    out.mkdir(parents=True, exist_ok=True)
    mpath.write_text(json.dumps(manifest, indent=1))
