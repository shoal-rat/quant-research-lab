# Chroma-keys the Love & Whip green-screen art into transparent sprites
# and splits the icon sheets into individual PNGs.
import os
import sys
from PIL import Image

SRC_DIR = r"C:\Users\Weike_Zhang\Desktop\美术设计图"
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "generated", "ui", "love-whip")

SOURCES = {
    "panel": "ChatGPT Image Jun 12, 2026, 03_19_03 AM (1).png",
    "love": "ChatGPT Image Jun 12, 2026, 03_19_03 AM (2).png",
    "whip": "ChatGPT Image Jun 12, 2026, 03_19_03 AM (3).png",
}


def chroma_key(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            # green dominance metric
            dom = g - max(r, b)
            if dom > 90 and g > 120:
                px[x, y] = (r, g, b, 0)
            elif dom > 40 and g > 100:
                # edge: fade alpha and despill green
                alpha = max(0, 255 - int((dom - 40) * 255 / 50))
                px[x, y] = (r, max(r, b), b, min(a, alpha))
            elif dom > 15 and g > 90:
                # light spill: despill only
                px[x, y] = (r, max(r, b), b, a)
    return img


def alpha_bbox(img: Image.Image, threshold: int = 8):
    alpha = img.split()[3]
    mask = alpha.point(lambda v: 255 if v > threshold else 0)
    return mask.getbbox()


def split_columns(img: Image.Image, min_gap: int = 6):
    """Split a keyed sheet into sprites separated by fully transparent column gaps."""
    w, h = img.size
    alpha = img.split()[3]
    data = list(alpha.getdata())
    col_has = [False] * w
    for x in range(w):
        for y in range(h):
            if data[y * w + x] > 8:
                col_has[x] = True
                break
    parts = []
    start = None
    gap = 0
    for x in range(w):
        if col_has[x]:
            if start is None:
                start = x
            gap = 0
        else:
            if start is not None:
                gap += 1
                if gap >= min_gap:
                    parts.append((start, x - gap + 1))
                    start = None
                    gap = 0
    if start is not None:
        parts.append((start, w))
    out = []
    for x0, x1 in parts:
        piece = img.crop((x0, 0, x1, h))
        box = alpha_bbox(piece)
        if box:
            piece = piece.crop(box)
            if piece.width >= 12 and piece.height >= 12:
                out.append(piece)
    return out


def save(img: Image.Image, name: str):
    path = os.path.join(OUT_DIR, name)
    img.save(path)
    print(f"saved {name}: {img.size[0]}x{img.size[1]}")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    panel = chroma_key(Image.open(os.path.join(SRC_DIR, SOURCES["panel"])))
    box = alpha_bbox(panel)
    if box:
        panel = panel.crop(box)
    save(panel, "panel.png")

    love = chroma_key(Image.open(os.path.join(SRC_DIR, SOURCES["love"])))
    love_parts = split_columns(love)
    print(f"love sheet parts: {len(love_parts)}")
    names = ["heart.png", "heart-burst.png", "heart-badge.png"]
    for img, name in zip(love_parts, names):
        save(img, name)

    whip = chroma_key(Image.open(os.path.join(SRC_DIR, SOURCES["whip"])))
    whip_parts = split_columns(whip)
    print(f"whip sheet parts: {len(whip_parts)}")
    names = ["whip.png", "whip-burst.png", "whip-badge.png"]
    for img, name in zip(whip_parts, names):
        save(img, name)

    if len(love_parts) != 3 or len(whip_parts) != 3:
        print("WARNING: expected 3 parts per sheet", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
