#!/usr/bin/env python3
"""Generate hand-crafted pixel-art textures for the Wizard's Elixirs addon."""
from PIL import Image, ImageDraw
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "build" / "WizardsElixirs_RP" / "textures" / "items"
OUT.mkdir(parents=True, exist_ok=True)

# 16x16 bottle template.
# Glyphs:
#   .  transparent
#   k  bottle outline (black)
#   c  cork (brown)
#   C  cork highlight (light brown)
#   g  glass shine (white)
#   L  liquid primary
#   l  liquid light (highlight)
#   d  liquid dark (shadow)
BOTTLE = [
    "................",
    "......cccc......",
    "......cCCc......",
    "......cccc......",
    ".....kkkkkk.....",
    ".....kLLLLk.....",
    "....kLllLLLk....",
    "...kLlLLLLLLk...",
    "..kLLLLLLLLLLk..",
    "..kLLLLLLLLLLk..",
    "..kLLlLLLLLLLk..",
    "..kLLLLLLLLdLk..",
    "..kLLLLLLLdddk..",
    "...kLLLLdddLk...",
    "....kkkkkkkk....",
    "................",
]

# Palettes: (primary, light, dark)
ELIXIRS = {
    "flame_brew":    ((255,  88,  16), (255, 190,  70), (150,  20,   0)),  # fiery orange/red
    "frost_draught": (( 90, 200, 255), (200, 240, 255), ( 30,  90, 180)),  # icy blue
    "storm_tonic":   ((255, 240,  70), (255, 255, 200), (180, 120,   0)),  # lightning yellow
    "natures_sip":   (( 70, 200,  80), (180, 255, 140), ( 20, 100,  30)),  # leafy green
    "void_essence":  ((120,  40, 200), (200, 130, 255), ( 40,   0,  90)),  # mystic purple
}

OUTLINE = (20, 14, 24, 255)
CORK = (120, 72, 38, 255)
CORK_HI = (180, 120, 70, 255)
GLASS = (255, 255, 255, 255)


def render(name: str, primary, light, dark) -> None:
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(BOTTLE):
        for x, ch in enumerate(row):
            if ch == ".":
                continue
            if ch == "k":
                px[x, y] = OUTLINE
            elif ch == "c":
                px[x, y] = CORK
            elif ch == "C":
                px[x, y] = CORK_HI
            elif ch == "g":
                px[x, y] = GLASS
            elif ch == "L":
                px[x, y] = (*primary, 255)
            elif ch == "l":
                px[x, y] = (*light, 255)
            elif ch == "d":
                px[x, y] = (*dark, 255)
    # Add a subtle top glass shine on the shoulder of the bottle.
    px[6, 7] = (255, 255, 255, 200)
    px[7, 6] = (255, 255, 255, 160)
    img.save(OUT / f"{name}.png")
    print(f"wrote {name}.png")


for name, (p, l, d) in ELIXIRS.items():
    render(name, p, l, d)


# --- Pack icons (128x128) -------------------------------------------------
def make_pack_icon(path: Path, label_color):
    scale = 8  # 16 * 8 = 128
    base = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    bp = base.load()
    # Fill a wizard-purple gradient background.
    for y in range(16):
        for x in range(16):
            t = (x + y) / 30.0
            r = int(40 + 60 * t)
            g = int(10 + 30 * t)
            b = int(80 + 120 * t)
            bp[x, y] = (r, g, b, 255)
    # Overlay the bottle (purple magic).
    for y, row in enumerate(BOTTLE):
        for x, ch in enumerate(row):
            if ch == "k":
                bp[x, y] = OUTLINE
            elif ch == "c":
                bp[x, y] = CORK
            elif ch == "C":
                bp[x, y] = CORK_HI
            elif ch == "L":
                bp[x, y] = (*label_color, 255)
            elif ch == "l":
                bp[x, y] = (255, 220, 255, 255)
            elif ch == "d":
                bp[x, y] = (60, 10, 90, 255)
    # Little stars.
    for sx, sy in [(1, 2), (13, 3), (2, 12), (13, 13), (14, 9)]:
        bp[sx, sy] = (255, 240, 160, 255)
    big = base.resize((16 * scale, 16 * scale), Image.NEAREST)
    big.save(path)
    print(f"wrote {path.name}")


PACK_ICON_BP = Path(__file__).resolve().parents[1] / "build" / "WizardsElixirs_BP" / "pack_icon.png"
PACK_ICON_RP = Path(__file__).resolve().parents[1] / "build" / "WizardsElixirs_RP" / "pack_icon.png"
make_pack_icon(PACK_ICON_BP, (180, 90, 240))
make_pack_icon(PACK_ICON_RP, (180, 90, 240))
