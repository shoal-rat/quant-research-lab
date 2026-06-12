from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = Path("C:/Users/Weike_Zhang/Desktop/\u7f8e\u672f\u8bbe\u8ba1\u56fe")
REFERENCE_ROOT = ROOT / "public/assets/reference"
GENERATED_ROOT = ROOT / "public/assets/generated"
DESIGN_AGENT_ROOT = ROOT / "public/assets/design/agents"


OFFICE_SOURCE = SOURCE_ROOT / "\u7a7a\u529e\u516c\u5ba4.png"
OFFICE_CONCEPT = SOURCE_ROOT / "\u524d\u7aef\u8bbe\u60f3\u56fe.png"
SHEETS_ROOT = SOURCE_ROOT / "\u4eba\u7269\u4e09\u89c6\u56fe\u548c\u8bbe\u8ba1\u56fe"


AGENTS = [
    {
        "id": "strategy-researcher",
        "displayName": "Strategy Researcher",
        "roleCn": "\u7b56\u7565\u7814\u7a76\u5458",
        "base": "strategy.png",
        "scale": 1.03,
        "states": [
            "idle",
            "walk",
            "thinking",
            "writing-whiteboard",
            "debating",
            "excited",
            "confused",
        ],
    },
    {
        "id": "code-engineer",
        "displayName": "Code Engineer",
        "roleCn": "\u4ee3\u7801\u5de5\u7a0b\u5e08",
        "base": "code.png",
        "scale": 1.02,
        "states": [
            "idle",
            "walk",
            "coding",
            "frustrated",
            "tired",
            "fixed-bug",
            "drinking-coffee",
        ],
    },
    {
        "id": "risk-reviewer",
        "displayName": "Risk Reviewer",
        "roleCn": "\u98ce\u63a7\u5ba1\u67e5\u5458",
        "base": "risk.png",
        "scale": 1.04,
        "states": [
            "idle",
            "walk",
            "reviewing",
            "angry",
            "rejecting",
            "table-slam",
            "serious",
        ],
    },
    {
        "id": "skeptic-researcher",
        "displayName": "Skeptic Researcher",
        "roleCn": "\u6000\u7591\u8bba\u7814\u7a76\u5458",
        "base": "skeptic.png",
        "scale": 1.02,
        "states": [
            "idle",
            "walk",
            "skeptical",
            "whispering",
            "smirking",
            "deep-thinking",
            "debating",
        ],
    },
    {
        "id": "experiment-manager",
        "displayName": "Experiment Manager",
        "roleCn": "\u5b9e\u9a8c\u7ecf\u7406",
        "base": "manager.png",
        "scale": 1.05,
        "states": [
            "idle",
            "walk",
            "presenting",
            "calling-meeting",
            "deciding",
            "updating-screen",
            "confident",
        ],
    },
    {
        "id": "data-manager",
        "displayName": "Data Manager",
        "roleCn": "\u6570\u636e\u7ba1\u7406\u5458",
        "base": "data.png",
        "scale": 1.02,
        "states": [
            "idle",
            "walk",
            "checking-data",
            "carrying-files",
            "confused",
            "problem-solved",
            "inspecting-timestamp",
        ],
    },
]


STATE_TRANSFORMS = {
    "idle": {"dx": 0, "dy": 0, "rot": 0, "scale": 1},
    "walk": {"dx": 10, "dy": -2, "rot": -2, "scale": 1},
    "thinking": {"dx": 0, "dy": 0, "rot": -1, "scale": 1},
    "writing-whiteboard": {"dx": 12, "dy": -2, "rot": -4, "scale": 1},
    "debating": {"dx": -3, "dy": -2, "rot": 3, "scale": 1.02},
    "excited": {"dx": 0, "dy": -16, "rot": 0, "scale": 1.04},
    "confused": {"dx": -4, "dy": 0, "rot": -3, "scale": 1},
    "coding": {"dx": 0, "dy": 2, "rot": 1, "scale": 1},
    "frustrated": {"dx": -2, "dy": 8, "rot": -5, "scale": 0.98},
    "tired": {"dx": -8, "dy": 13, "rot": -7, "scale": 0.96},
    "fixed-bug": {"dx": 0, "dy": -9, "rot": 2, "scale": 1.02},
    "drinking-coffee": {"dx": 2, "dy": 0, "rot": -1, "scale": 1},
    "reviewing": {"dx": 0, "dy": 0, "rot": 0, "scale": 1},
    "angry": {"dx": -2, "dy": -3, "rot": -3, "scale": 1.03},
    "rejecting": {"dx": 5, "dy": -1, "rot": 4, "scale": 1.01},
    "table-slam": {"dx": 8, "dy": 4, "rot": 5, "scale": 0.98},
    "serious": {"dx": 0, "dy": 0, "rot": 0, "scale": 1},
    "skeptical": {"dx": 0, "dy": 0, "rot": -1, "scale": 1},
    "whispering": {"dx": -8, "dy": 0, "rot": -4, "scale": 0.99},
    "smirking": {"dx": 0, "dy": -1, "rot": 2, "scale": 1},
    "deep-thinking": {"dx": -2, "dy": 0, "rot": -2, "scale": 0.99},
    "presenting": {"dx": 6, "dy": -2, "rot": 3, "scale": 1.02},
    "calling-meeting": {"dx": 10, "dy": -5, "rot": 4, "scale": 1.03},
    "deciding": {"dx": -2, "dy": 0, "rot": -1, "scale": 1},
    "updating-screen": {"dx": 8, "dy": -3, "rot": 3, "scale": 1.02},
    "confident": {"dx": 0, "dy": -4, "rot": 0, "scale": 1.03},
    "checking-data": {"dx": 0, "dy": 0, "rot": -1, "scale": 1},
    "carrying-files": {"dx": 8, "dy": -1, "rot": 2, "scale": 1},
    "problem-solved": {"dx": 0, "dy": -10, "rot": 1, "scale": 1.03},
    "inspecting-timestamp": {"dx": -5, "dy": 0, "rot": -3, "scale": 1},
}


def ensure_dirs() -> None:
    for folder in [
        REFERENCE_ROOT / "office",
        REFERENCE_ROOT / "agents",
        GENERATED_ROOT / "office",
        GENERATED_ROOT / "agents",
    ]:
        folder.mkdir(parents=True, exist_ok=True)


def copy_references() -> list[str]:
    copied: list[str] = []
    for src, name in [
        (OFFICE_SOURCE, "empty-office.png"),
        (OFFICE_CONCEPT, "ui-concept.png"),
    ]:
        dst = REFERENCE_ROOT / "office" / name
        Image.open(src).save(dst)
        copied.append(str(dst.relative_to(ROOT)))
    for sheet in sorted(SHEETS_ROOT.glob("*.png")):
        dst = REFERENCE_ROOT / "agents" / sheet.name
        Image.open(sheet).save(dst)
        copied.append(str(dst.relative_to(ROOT)))
    return copied


def rounded_rect(draw: ImageDraw.ImageDraw, xy: tuple[int, int, int, int], radius: int, fill, outline=None, width=1) -> None:
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def create_office_background() -> None:
    img = Image.open(OFFICE_SOURCE).convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # Blank editable surfaces while preserving the rendered room, frames, and lighting.
    rounded_rect(draw, (290, 68, 770, 235), 10, (16, 31, 46, 238), (98, 180, 210, 72), 2)
    rounded_rect(draw, (975, 102, 1375, 405), 12, (239, 232, 214, 242), (250, 246, 232, 100), 2)
    rounded_rect(draw, (1200, 544, 1537, 682), 8, (14, 35, 52, 232), (92, 180, 210, 65), 2)
    rounded_rect(draw, (565, 660, 902, 805), 10, (13, 34, 51, 235), (90, 190, 210, 70), 2)
    rounded_rect(draw, (1418, 95, 1520, 170), 8, (17, 43, 78, 238), (84, 190, 255, 80), 2)

    # Mild screen glow and whiteboard warmth for better embedded overlays.
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    for box, color in [
        ((280, 60, 780, 245), (56, 190, 226, 38)),
        ((1190, 534, 1548, 692), (56, 190, 226, 32)),
        ((555, 650, 912, 815), (56, 190, 226, 34)),
        ((968, 95, 1385, 415), (255, 236, 198, 32)),
    ]:
        glow_draw.rounded_rectangle(box, radius=18, fill=color)
    glow = glow.filter(ImageFilter.GaussianBlur(12))

    img = Image.alpha_composite(img, glow)
    img = Image.alpha_composite(img, overlay)
    bg = img.convert("RGB")
    bg.save(GENERATED_ROOT / "office/office-bg.webp", "WEBP", quality=92)
    thumb = ImageOps.contain(bg, (480, 270))
    thumb.save(GENERATED_ROOT / "office/office-bg-thumb.webp", "WEBP", quality=86)


def trim_alpha(img: Image.Image) -> Image.Image:
    alpha = img.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        return img
    return img.crop(bbox)


def make_sprite(base: Image.Image, state: str, size=(512, 640)) -> Image.Image:
    transform = STATE_TRANSFORMS.get(state, STATE_TRANSFORMS["idle"])
    subject = trim_alpha(base.convert("RGBA"))
    target_h = int(size[1] * 0.82 * transform["scale"])
    ratio = target_h / subject.height
    subject = subject.resize((max(1, int(subject.width * ratio)), target_h), Image.Resampling.LANCZOS)
    subject = subject.rotate(transform["rot"], resample=Image.Resampling.BICUBIC, expand=True)

    canvas = Image.new("RGBA", size, (255, 255, 255, 0))
    x = int((size[0] - subject.width) / 2 + transform["dx"])
    y = int(size[1] - subject.height - 30 + transform["dy"])
    canvas.alpha_composite(subject, (x, y))
    return canvas


def make_avatar(base: Image.Image) -> Image.Image:
    subject = trim_alpha(base.convert("RGBA"))
    # Use top half for a consistent head/upper-body avatar.
    crop = subject.crop((0, 0, subject.width, int(subject.height * 0.58)))
    crop = trim_alpha(crop)
    canvas = Image.new("RGBA", (512, 512), (255, 255, 255, 0))
    ratio = min(420 / crop.width, 440 / crop.height)
    crop = crop.resize((int(crop.width * ratio), int(crop.height * ratio)), Image.Resampling.LANCZOS)
    canvas.alpha_composite(crop, ((512 - crop.width) // 2, 58))
    return canvas


def create_agent_assets() -> list[dict]:
    manifest_agents: list[dict] = []
    for agent in AGENTS:
        agent_dir = GENERATED_ROOT / "agents" / agent["id"]
        agent_dir.mkdir(parents=True, exist_ok=True)
        base_path = DESIGN_AGENT_ROOT / agent["base"]
        base = Image.open(base_path).convert("RGBA")

        sprite_paths = {}
        for state in agent["states"]:
            out_path = agent_dir / f"{state}.png"
            make_sprite(base, state).save(out_path)
            sprite_paths[state] = f"/assets/generated/agents/{agent['id']}/{state}.png"

        avatar_path = agent_dir / "avatar.png"
        make_avatar(base).save(avatar_path)
        agent_manifest = {
            "id": agent["id"],
            "displayName": agent["displayName"],
            "roleCn": agent["roleCn"],
            "scale": agent["scale"],
            "anchor": {"x": 0.5, "y": 0.92},
            "avatar": f"/assets/generated/agents/{agent['id']}/avatar.png",
            "sprites": sprite_paths,
            "provenance": "temporary-reference-derived; replace with native generated transparent sprites when available",
        }
        (agent_dir / "manifest.json").write_text(json.dumps(agent_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        manifest_agents.append(agent_manifest)

    (GENERATED_ROOT / "agents/agents.manifest.json").write_text(
        json.dumps({"version": 1, "agents": manifest_agents}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return manifest_agents


def main() -> None:
    ensure_dirs()
    copied = copy_references()
    create_office_background()
    agents = create_agent_assets()
    print(
        json.dumps(
            {
                "referencesCopied": copied,
                "office": [
                    "public/assets/generated/office/office-bg.webp",
                    "public/assets/generated/office/office-bg-thumb.webp",
                ],
                "agents": [agent["id"] for agent in agents],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
