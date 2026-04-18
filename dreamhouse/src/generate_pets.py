#!/usr/bin/env python3
"""Generate pet textures (puppy and bunny) and pack icon."""
import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1] / "build"
RP = ROOT / "DreamhouseDeluxe_RP"
BP = ROOT / "DreamhouseDeluxe_BP"
TEX_ENT = RP / "textures" / "entity"
TEX_ENT.mkdir(parents=True, exist_ok=True)

# ── Puppy texture (64x32) ─────────────────────────────────────────────

def make_puppy():
    img = Image.new("RGBA", (64, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    body = (200, 135, 90)      # warm golden brown
    belly = (235, 200, 160)    # light underside
    dark = (100, 65, 35)       # dark patches
    nose = (40, 25, 15)        # nose
    eye = (30, 20, 15)         # eyes
    tongue = (230, 100, 100)   # tongue

    # Body (0,0 → 6w 5h 8d = UV spans ~20x13 at 0,0)
    d.rectangle([0, 0, 19, 12], fill=body)
    d.rectangle([0, 5, 19, 8], fill=belly)

    # Head (20,0 → 5w 5h 4d)
    d.rectangle([20, 0, 33, 12], fill=body)
    # Eyes
    d.rectangle([23, 3, 24, 4], fill=eye)
    d.rectangle([27, 3, 28, 4], fill=eye)
    # Nose/mouth
    d.rectangle([25, 5, 26, 6], fill=nose)
    d.rectangle([25, 7, 26, 7], fill=tongue)

    # Snout (0,20 → 2w 2h 2d)
    d.rectangle([0, 20, 7, 23], fill=body)
    d.rectangle([2, 21, 5, 22], fill=nose)

    # Ears (8,20 and 14,20)
    d.rectangle([8, 20, 11, 25], fill=dark)
    d.rectangle([14, 20, 17, 25], fill=dark)

    # Legs (0,13 and 8,13)
    d.rectangle([0, 13, 7, 17], fill=body)
    d.rectangle([8, 13, 15, 17], fill=body)
    # Paws
    d.rectangle([2, 16, 5, 17], fill=belly)
    d.rectangle([10, 16, 13, 17], fill=belly)

    # Tail (20,10)
    d.rectangle([20, 10, 25, 12], fill=body)

    # Spots
    d.rectangle([3, 1, 5, 3], fill=dark)
    d.rectangle([12, 2, 14, 4], fill=dark)

    img.save(TEX_ENT / "puppy.png")
    print("puppy.png written")

# ── Bunny texture (64x32) ─────────────────────────────────────────────

def make_bunny():
    img = Image.new("RGBA", (64, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    fur = (232, 220, 208)      # cream white
    pink = (240, 170, 180)     # pink inner ears
    eye = (140, 60, 80)        # deep pink eyes
    nose = (230, 140, 150)     # nose
    belly = (245, 240, 235)    # lighter belly
    dark = (200, 185, 170)     # shading

    # Body (0,0)
    d.rectangle([0, 0, 16, 9], fill=fur)
    d.rectangle([0, 4, 16, 7], fill=belly)
    d.rectangle([0, 8, 16, 9], fill=dark)

    # Head (22,0)
    d.rectangle([22, 0, 32, 9], fill=fur)
    # Eyes
    d.rectangle([24, 3, 25, 4], fill=eye)
    d.rectangle([28, 3, 29, 4], fill=eye)
    # Nose
    d.rectangle([26, 5, 27, 5], fill=nose)
    # Cheeks
    d.rectangle([23, 5, 24, 6], fill=pink)
    d.rectangle([29, 5, 30, 6], fill=pink)

    # Snout (0,22)
    d.rectangle([0, 22, 3, 24], fill=fur)
    d.rectangle([1, 23, 2, 23], fill=nose)

    # Ears (4,22 and 8,22)
    d.rectangle([4, 22, 5, 27], fill=fur)
    d.rectangle([4, 23, 5, 26], fill=pink)
    d.rectangle([8, 22, 9, 27], fill=fur)
    d.rectangle([8, 23, 9, 26], fill=pink)

    # Tail (22,8)
    d.rectangle([22, 8, 25, 11], fill=(255, 255, 255))

    # Legs front (0,10 and 8,10)
    d.rectangle([0, 10, 5, 13], fill=fur)
    d.rectangle([8, 10, 13, 13], fill=fur)

    # Legs back (0,14 and 8,14)
    d.rectangle([0, 14, 5, 18], fill=fur)
    d.rectangle([8, 14, 13, 18], fill=fur)
    d.rectangle([0, 17, 5, 18], fill=dark)
    d.rectangle([8, 17, 13, 18], fill=dark)

    img.save(TEX_ENT / "bunny.png")
    print("bunny.png written")

# ── Pack icons (128×128) ──────────────────────────────────────────────

def make_pack_icon(path, label):
    img = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Background gradient — warm sunset
    for y in range(128):
        t = y / 127.0
        r = int(255 - 60 * t)
        g = int(180 - 80 * t)
        b = int(220 + 35 * t)
        d.line([(0, y), (127, y)], fill=(r, g, b, 255))

    # House silhouette
    d.polygon([(30, 70), (64, 35), (98, 70)], fill=(180, 120, 60))  # roof
    d.rectangle([38, 70, 90, 105], fill=(200, 140, 80))  # walls
    d.rectangle([55, 80, 73, 105], fill=(120, 80, 40))   # door
    d.rectangle([42, 75, 52, 85], fill=(180, 220, 255))   # window left
    d.rectangle([76, 75, 86, 85], fill=(180, 220, 255))   # window right

    # Stars
    for sx, sy in [(15, 15), (108, 20), (25, 40), (100, 45), (50, 12), (80, 18)]:
        d.rectangle([sx, sy, sx+2, sy+2], fill=(255, 255, 200, 255))

    # Heart above house
    for dx, dy in [(-2,-1),(-1,-2),(0,-1),(1,-2),(2,-1),(-1,0),(0,1),(1,0),(0,0),(-1,-1),(1,-1)]:
        cx, cy = 64 + dx, 28 + dy
        d.rectangle([cx, cy, cx, cy], fill=(255, 100, 130, 255))

    # Ground
    d.rectangle([0, 105, 127, 127], fill=(100, 180, 80))
    for x in range(0, 128, 6):
        d.rectangle([x, 103, x+3, 105], fill=(80, 160, 60))

    img.save(path)
    print(f"pack_icon written: {path.name}")

make_puppy()
make_bunny()
make_pack_icon(BP / "pack_icon.png", "BP")
make_pack_icon(RP / "pack_icon.png", "RP")

# ── Append pet lang entries ───────────────────────────────────────────

lang_path = BP / "texts" / "en_US.lang"
lang = lang_path.read_text()
lang += "\n## Pets\n"
lang += "entity.dh:puppy.name=Dreamhouse Puppy\n"
lang += "entity.dh:bunny.name=Dreamhouse Bunny\n"
lang += "item.spawn_egg.entity.dh:puppy.name=Spawn Puppy\n"
lang += "item.spawn_egg.entity.dh:bunny.name=Spawn Bunny\n"
lang_path.write_text(lang)
print("Pet lang entries appended")
