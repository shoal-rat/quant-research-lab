#!/usr/bin/env python3
"""Slice + pack the AI-generated anime-movie sheets (work/anime-raw) into game assets.

- Chroma-keys the #00FF00 backgrounds (despill + feather)
- Splits 2x4 pose sheets into individual sprites via connected components
  (fixed-grid fallback)
- Normalizes each character's scale from its idle-front pose, composes every
  sprite onto the existing 256x320 canvas contract (feet baseline y=307)
- Writes avatars (256x256), README portraits (docs/media/portraits), and the
  cinematic banner (docs/media/banner-anime.png)
- Leaves manifest paths untouched (same filenames as the previous art set)

Run: <venv>/bin/python scripts/art-pipeline/build_anime_assets.py [--only strategy-researcher,...]
     add --contact to also write per-character contact sheets into work/anime-raw/
"""
import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORK = os.path.join(ROOT, "work", "anime-raw")
AGENTS2D = os.path.join(ROOT, "public", "assets", "generated", "agents-2d")
PORTRAITS = os.path.join(ROOT, "docs", "media", "portraits")
L = Image.Resampling.LANCZOS

CANVAS = (256, 320)
FEET_Y = 307          # matches the previous art set (feet baseline ~0.96)
STAND_H = 294         # standing subject height on the canvas (~0.92)

SHEET_A = ["idle-front", "idle-back", "idle-left", "idle-right",
           "walk-front", "walk-back", "walk-left", "walk-right"]
EXPR_ORDER = ["delighted", "shocked", "angry", "smug", "worried", "crying", "embarrassed", "determined"]

CHARS = {
    "strategy-researcher": {
        "actions": ["thinking", "writing-whiteboard", "debating", "eureka"],
        "portrait": "mira",
    },
    "code-engineer": {
        "actions": ["coding", "bug-meltdown", "tired", "deploy-victory"],
        "portrait": "ren",
    },
    "risk-reviewer": {
        "actions": ["reviewing", "audit-alarm", "rejection-stamp", "controlled-approval"],
        "portrait": "sana",
    },
    "skeptic-researcher": {
        "actions": ["skeptical", "whispering", "gotcha", "silent-judgment"],
        "portrait": "ivo",
    },
    "experiment-manager": {
        "actions": ["presenting", "calling-meeting", "final-verdict", "team-encourage"],
        "portrait": "noa",
    },
    "data-manager": {
        "actions": ["checking-data", "carrying-files", "dirty-timestamp", "missing-data-panic", "clean-data-pride"],
        "portrait": "kira",
    },
}


def chroma_key(img):
    """#00FF00 green screen -> RGBA.

    Border-connected keying: only green regions CONNECTED to the image border
    are background. Greenish pixels inside the figure (pastel fabric, tinted
    lineart, spill) stay opaque, so light-colored outfits are not eaten hollow.
    Despill runs only in a thin band around the background boundary.
    """
    from scipy import ndimage

    arr = np.asarray(img.convert("RGB")).astype(np.int16)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    # corner-sampled background mode: green sheets use g - max(r,b); magenta
    # sheets (used for light-outfit characters) use min(r,b) - g
    corners = np.array([arr[0, 0], arr[0, -1], arr[-1, 0], arr[-1, -1]]).mean(axis=0)
    magenta_bg = corners[1] < max(corners[0], corners[2])
    if magenta_bg:
        greenness = np.minimum(r, b) - g
    else:
        greenness = g - np.maximum(r, b)
    greenish = greenness > 40
    labels, count = ndimage.label(greenish)
    border_labels = np.unique(
        np.concatenate([labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]])
    )
    background = np.isin(labels, border_labels[border_labels != 0])

    # soft edge: feather the hard background mask, then push very green pixels
    # near the boundary toward transparent for a clean silhouette
    alpha = np.where(background, 0, 255).astype(np.uint8)
    edge_band = ndimage.binary_dilation(background, iterations=2) & ~background
    strong_green = greenness > 90
    alpha[edge_band & strong_green] = 0
    partial = edge_band & (greenness > 40) & ~strong_green
    alpha[partial] = np.clip(255 - (greenness[partial] - 40) * 4, 60, 255).astype(np.uint8)

    # despill only near the boundary so interior fabric tints are untouched
    despill_band = ndimage.binary_dilation(background, iterations=3) & ~background & (greenness > 8)
    g2 = g.copy()
    r2 = r.copy()
    b2 = b.copy()
    if magenta_bg:
        # magenta reflections read as loud pink stains anywhere on the figure —
        # clamp them everywhere (interior included); a plum-grey patch is invisible,
        # a hot-pink one is not
        stain = (greenness > 25) & ~background
        r2[stain] = np.minimum(r[stain], g[stain] + 30)
        b2[stain] = np.minimum(b[stain], g[stain] + 30)
    else:
        g2[despill_band] = np.maximum(r, b)[despill_band]

    rgba = np.dstack([np.dstack([r2, g2, b2]).astype(np.uint8), alpha])
    im = Image.fromarray(rgba, "RGBA")
    a = im.getchannel("A").filter(ImageFilter.GaussianBlur(0.7))
    im.putalpha(a)
    return im


def components(im, min_area_frac=0.002):
    """Connected components on downsampled alpha; full-res bboxes."""
    ds = 4
    a = np.asarray(im.getchannel("A").resize((im.width // ds, im.height // ds)))
    mask = a > 40
    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    cur = 0
    for yy in range(h):
        for xx in range(w):
            if mask[yy, xx] and labels[yy, xx] == 0:
                cur += 1
                q = deque([(yy, xx)])
                labels[yy, xx] = cur
                while q:
                    y0, x0 = q.popleft()
                    for ny in range(max(0, y0 - 1), min(h, y0 + 2)):
                        for nx in range(max(0, x0 - 1), min(w, x0 + 2)):
                            if mask[ny, nx] and labels[ny, nx] == 0:
                                labels[ny, nx] = cur
                                q.append((ny, nx))
    boxes = []
    min_area = h * w * min_area_frac
    for i in range(1, cur + 1):
        ys, xs = np.where(labels == i)
        if len(ys) < min_area:
            continue
        boxes.append([xs.min() * ds, ys.min() * ds, (xs.max() + 1) * ds, (ys.max() + 1) * ds, len(ys)])
    merged = True
    while merged:
        merged = False
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                a_, b_ = boxes[i], boxes[j]
                pad = 14
                if not (a_[2] + pad < b_[0] or b_[2] + pad < a_[0] or a_[3] + pad < b_[1] or b_[3] + pad < a_[1]):
                    boxes[i] = [min(a_[0], b_[0]), min(a_[1], b_[1]),
                                max(a_[2], b_[2]), max(a_[3], b_[3]), a_[4] + b_[4]]
                    boxes.pop(j)
                    merged = True
                    break
            if merged:
                break
    return boxes


def grid_sort(boxes, rows, cols):
    if len(boxes) != rows * cols:
        return None
    cys = sorted((b[1] + b[3]) / 2 for b in boxes)
    gaps = sorted(range(len(cys) - 1), key=lambda i: cys[i + 1] - cys[i], reverse=True)[: rows - 1]
    cuts = sorted(cys[i] + (cys[i + 1] - cys[i]) / 2 for i in gaps)
    rowsets = [[] for _ in range(rows)]
    for b in boxes:
        cy = (b[1] + b[3]) / 2
        rowsets[sum(cy > c for c in cuts)].append(b)
    out = []
    for rs in rowsets:
        if len(rs) != cols:
            return None
        out.extend(sorted(rs, key=lambda b: (b[0] + b[2]) / 2))
    return out


def fixed_grid(im, rows, cols):
    cw, ch = im.width // cols, im.height // rows
    boxes = []
    for r in range(rows):
        for c in range(cols):
            cell = im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
            bbox = cell.getbbox()
            if bbox is None:
                boxes.append([c * cw, r * ch, (c + 1) * cw, (r + 1) * ch, 0])
            else:
                boxes.append([c * cw + bbox[0], r * ch + bbox[1], c * cw + bbox[2], r * ch + bbox[3], 0])
    return boxes


def isolate_largest(crop):
    """Keep only the dominant figure in a cell: fixed-grid slicing can catch a
    sliver of the neighboring pose when a character crosses the cell boundary."""
    boxes = components(crop, min_area_frac=0.004)
    if len(boxes) <= 1:
        bbox = crop.getbbox()
        return crop.crop(bbox) if bbox else crop
    main = max(boxes, key=lambda b: b[4])
    arr = np.array(crop)
    keep = np.zeros(arr.shape[:2], dtype=bool)
    keep[main[1]:main[3], main[0]:main[2]] = True
    arr[..., 3] = np.where(keep, arr[..., 3], 0)
    im = Image.fromarray(arr, "RGBA")
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def slice_sheet(path, rows=2, cols=4):
    im = chroma_key(Image.open(path))
    boxes = grid_sort(components(im), rows, cols)
    if boxes is None:
        boxes = fixed_grid(im, rows, cols)
    return [isolate_largest(im.crop((b[0], b[1], b[2], b[3]))) for b in boxes]


def compose_sprite(crop, scale):
    """Place a sliced pose on the 256x320 canvas: feet on the baseline, centered."""
    w = max(1, int(round(crop.width * scale)))
    h = max(1, int(round(crop.height * scale)))
    subject = crop.resize((w, h), L)
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    x = (CANVAS[0] - w) // 2
    y = FEET_Y - h
    if y < 4:  # very tall pose (jump/eureka): shrink to fit rather than crop the head
        fit = (FEET_Y - 4) / h
        w2, h2 = max(1, int(w * fit)), max(1, int(h * fit))
        subject = subject.resize((w2, h2), L)
        x, y = (CANVAS[0] - w2) // 2, FEET_Y - h2
    if subject.width > CANVAS[0] - 4:
        fit = (CANVAS[0] - 4) / subject.width
        w2, h2 = max(1, int(subject.width * fit)), max(1, int(subject.height * fit))
        subject = subject.resize((w2, h2), L)
        x, y = (CANVAS[0] - w2) // 2, FEET_Y - h2
    canvas.alpha_composite(subject, (x, y))
    return canvas


def compose_avatar(crop):
    """256x256 bust avatar from a bust cell (or the top of a full-body cell)."""
    c = crop
    if c.height > c.width * 1.35:  # full body fallback: take head/chest
        c = c.crop((0, 0, c.width, int(c.height * 0.42)))
        bbox = c.getbbox()
        if bbox:
            c = c.crop(bbox)
    canvas = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    ratio = min(224 / c.width, 236 / c.height)
    c = c.resize((max(1, int(c.width * ratio)), max(1, int(c.height * ratio))), L)
    canvas.alpha_composite(c, ((256 - c.width) // 2, 252 - c.height))
    return canvas


def build_char(cid, spec, contact=False):
    outdir = os.path.join(AGENTS2D, cid)
    exprdir = os.path.join(outdir, "expressions")
    os.makedirs(exprdir, exist_ok=True)
    paths = {s: os.path.join(WORK, f"{cid}_sheet{s}.png") for s in ("A", "B", "C")}
    missing = [s for s, p in paths.items() if not os.path.exists(p)]
    if missing:
        print(f"!! {cid}: missing sheets {missing} — skipped")
        return False

    a_cells = slice_sheet(paths["A"])
    b_cells = slice_sheet(paths["B"])
    c_cells = slice_sheet(paths["C"])

    actions = spec["actions"]
    n_act = len(actions)
    # B: actions then first expressions; C: remaining expressions then busts
    b_names = actions + EXPR_ORDER[: 8 - n_act]
    c_expr = EXPR_ORDER[8 - n_act:]
    c_names = c_expr + [f"bust-{i}" for i in range(8 - len(c_expr))]

    # normalize: idle-front defines the character's scale on this sheet set
    idle_h = a_cells[0].height
    scale = STAND_H / max(1, idle_h)

    outputs = {}
    for name, crop in zip(SHEET_A, a_cells):
        outputs[name] = compose_sprite(crop, scale)
    # sheets B/C can drift in cell scale — renormalize against their own median
    # standing height so poses stay consistent with sheet A
    for cells, names in ((b_cells, b_names), (c_cells, c_names)):
        standing = [c.height for c in cells[:4]] or [idle_h]
        local = STAND_H / max(1, int(np.median(standing)))
        for name, crop in zip(names, cells):
            if name.startswith("bust-"):
                outputs[name] = crop  # raw crop; used for avatar/portrait below
            else:
                outputs[name] = compose_sprite(crop, local)

    for name, img in outputs.items():
        if name.startswith("bust-"):
            continue
        if name in EXPR_ORDER:
            img.save(os.path.join(exprdir, f"{name}.png"))
        else:
            img.save(os.path.join(outdir, f"{name}.png"))

    busts = [outputs[k] for k in sorted(outputs) if k.startswith("bust-")]
    if busts:
        avatar = compose_avatar(busts[0])
        avatar.save(os.path.join(outdir, "avatar.png"))
        os.makedirs(PORTRAITS, exist_ok=True)
        portrait = compose_avatar(busts[1] if len(busts) > 1 else busts[0])
        portrait.save(os.path.join(PORTRAITS, f"{spec['portrait']}.png"))

    if contact:
        cell = 170
        names = [n for n in outputs if not n.startswith("bust-")]
        cols = 8
        rows = (len(names) + cols - 1) // cols
        sheet = Image.new("RGBA", (cols * cell, rows * cell), (44, 47, 53, 255))
        for i, n in enumerate(sorted(names)):
            im = outputs[n].copy()
            im.thumbnail((cell - 10, cell - 10), L)
            sheet.paste(im, ((i % cols) * cell + 5, (i // cols) * cell + 5), im)
        sheet.save(os.path.join(WORK, f"_{cid}_contact.png"))
    print(f"ok {cid}: {len(outputs)} pieces (incl. {len(busts)} busts)")
    return True


def build_banner():
    src = os.path.join(WORK, "banner_group.png")
    if not os.path.exists(src):
        print("!! banner_group.png missing — skipped")
        return
    im = Image.open(src).convert("RGB")
    im.thumbnail((1600, 900), L)
    out = os.path.join(ROOT, "docs", "media", "banner-anime.png")
    im.save(out, optimize=True)
    print("ok banner ->", out)


if __name__ == "__main__":
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1].split(",")
    contact = "--contact" in sys.argv
    done = 0
    for cid, spec in CHARS.items():
        if only and cid not in only:
            continue
        done += build_char(cid, spec, contact=contact)
    build_banner()
    print(f"built {done} characters")
