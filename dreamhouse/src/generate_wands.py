#!/usr/bin/env python3
"""Generate wand items: JSONs, textures, recipes, and lang entries."""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "build"
BP = ROOT / "DreamhouseDeluxe_BP"
RP = ROOT / "DreamhouseDeluxe_RP"
TEX_ITEMS = RP / "textures" / "items"
TEX_ITEMS.mkdir(parents=True, exist_ok=True)

WANDS = [
    ("wand_fairy",   "Fairy Cottage Wand",  (200,  60, 160), (255, 180, 240), "minecraft:red_mushroom"),
    ("wand_candy",   "Candy Castle Wand",   (255, 100, 120), (255, 220, 200), "minecraft:sugar"),
    ("wand_cozy",    "Cozy Cabin Wand",     (180, 140,  90), (240, 220, 180), "minecraft:oak_planks"),
    ("wand_tree",    "Treehouse Wand",      ( 60, 140,  50), (160, 230, 140), "minecraft:oak_sapling"),
    ("wand_rainbow", "Rainbow Tent Wand",   (255, 100, 100), (100, 180, 255), "minecraft:white_wool"),
]

# ── Wand textures (16x16 pixel art) ───────────────────────────────────

WAND_SHAPE = [
    "................",
    "...........##...",
    "..........#T#...",
    ".........#T#....",
    "........#T#.....",
    ".......#S#......",
    "......#S#.......",
    ".....#S#........",
    "....#S#.........",
    "...#S#..........",
    "..#H#...........",
    ".#H#............",
    "#H#.............",
    "##..............",
    "................",
    "................",
]

def make_wand_texture(name, handle_color, tip_color):
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    px = img.load()
    outline = (30, 20, 40)
    stick = (180, 160, 120)
    for y, row in enumerate(WAND_SHAPE):
        for x, ch in enumerate(row):
            if ch == "#":
                px[x, y] = (*outline, 255)
            elif ch == "H":
                px[x, y] = (*handle_color, 255)
            elif ch == "S":
                px[x, y] = (stick[0], stick[1], stick[2], 255)
            elif ch == "T":
                px[x, y] = (*tip_color, 255)
    # Add sparkle at tip
    for sx, sy in [(10, 0), (12, 1), (11, 3)]:
        if 0 <= sx < 16 and 0 <= sy < 16:
            px[sx, sy] = (255, 255, 200, 255)
    img.save(TEX_ITEMS / f"{name}.png")

# ── Item JSON ──────────────────────────────────────────────────────────

for wid, wname, handle, tip, ingredient in WANDS:
    make_wand_texture(wid, handle, tip)

    item = {
        "format_version": "1.20.50",
        "minecraft:item": {
            "description": {
                "identifier": f"dh:{wid}",
                "menu_category": {
                    "category": "equipment",
                    "group": "itemGroup.name.none"
                }
            },
            "components": {
                "minecraft:icon": {"texture": f"dh_{wid}"},
                "minecraft:max_stack_size": 1,
                "minecraft:display_name": {"value": f"item.dh.{wid}.name"},
                "minecraft:can_destroy_in_creative": False,
                "minecraft:hand_equipped": True,
                "minecraft:glint": True
            }
        }
    }
    (BP / "items" / f"{wid}.json").write_text(json.dumps(item, indent=2))

    recipe = {
        "format_version": "1.20.50",
        "minecraft:recipe_shaped": {
            "description": {"identifier": f"dh:{wid}_recipe"},
            "tags": ["crafting_table"],
            "pattern": ["  T", " S ", "B  "],
            "key": {
                "T": {"item": ingredient},
                "S": {"item": "minecraft:stick"},
                "B": {"item": "minecraft:amethyst_shard"}
            },
            "result": {"item": f"dh:{wid}", "count": 1}
        }
    }
    (BP / "recipes" / f"{wid}_recipe.json").write_text(json.dumps(recipe, indent=2))

# ── item_texture.json ──────────────────────────────────────────────────

item_tex_path = RP / "textures" / "item_texture.json"
item_tex = {
    "resource_pack_name": "DreamhouseDeluxe",
    "texture_name": "atlas.items",
    "texture_data": {}
}
for wid, *_ in WANDS:
    item_tex["texture_data"][f"dh_{wid}"] = {"textures": f"textures/items/{wid}"}

item_tex_path.write_text(json.dumps(item_tex, indent=2))

# ── Append lang ────────────────────────────────────────────────────────

lang_path = BP / "texts" / "en_US.lang"
lang = lang_path.read_text()
lang += "\n## Wands\n"
for wid, wname, *_ in WANDS:
    lang += f"item.dh.{wid}.name={wname}\n"
lang += "\n## Chat commands\n"
lang += "## Type !wands in chat to receive all wands\n"
lang += "## Type !pets in chat to spawn your pets\n"
lang_path.write_text(lang)

print(f"Generated {len(WANDS)} wand items with textures, recipes, and lang")
