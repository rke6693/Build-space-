#!/usr/bin/env python3
"""Generate furniture: geometry models, block JSONs, textures, and recipes."""
import json, math
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1] / "build"
BP = ROOT / "DreamhouseDeluxe_BP"
RP = ROOT / "DreamhouseDeluxe_RP"
GEO_DIR = RP / "models" / "blocks"
TEX_DIR = RP / "textures" / "blocks"
GEO_DIR.mkdir(parents=True, exist_ok=True)

# ── Geometry helper ────────────────────────────────────────────────────

def make_geo(identifier: str, cubes: list, tex_w=16, tex_h=16):
    return {
        "format_version": "1.16.0",
        "minecraft:geometry": [{
            "description": {
                "identifier": identifier,
                "texture_width": tex_w,
                "texture_height": tex_h,
                "visible_bounds_width": 2,
                "visible_bounds_height": 2.5,
                "visible_bounds_offset": [0, 0.75, 0]
            },
            "bones": [{
                "name": "body",
                "pivot": [0, 0, 0],
                "cubes": cubes
            }]
        }]
    }

def cube(x, y, z, w, h, d, u=0, v=0):
    return {"origin": [x, y, z], "size": [w, h, d], "uv": [u, v]}

# ── Furniture definitions ──────────────────────────────────────────────
# Each: (id, display_name, geo_id, cubes, collision_w, collision_h, light, recipe_key, recipe_sub, color_main, color_accent)

FURNITURE = [
    # ---- BEDS ----
    ("bed_pink", "Cozy Bed (Pink)", "geometry.dh.bed",
     [cube(-7,0,-7,14,4,14, 0,0),   # base frame
      cube(-6,4,-6,12,4,12, 0,0),   # mattress
      cube(-7,4,-7,14,8,2, 0,0)],   # headboard
     {"origin": [-7,0,-7], "size": [14,8,14]}, 8,
     0, "R:minecraft:pink_dye,S:minecraft:oak_planks",
     (240,160,190), (200,120,150)),

    ("bed_blue", "Cozy Bed (Blue)", "geometry.dh.bed_blue",
     [cube(-7,0,-7,14,4,14, 0,0),
      cube(-6,4,-6,12,4,12, 0,0),
      cube(-7,4,-7,14,8,2, 0,0)],
     {"origin": [-7,0,-7], "size": [14,8,14]}, 8,
     0, "R:minecraft:light_blue_dye,S:minecraft:oak_planks",
     (160,190,240), (120,150,200)),

    # ---- SEATING ----
    ("couch_pink", "Couch (Pink)", "geometry.dh.couch_pink",
     [cube(-8,0,-6,16,6,12, 0,0),    # seat
      cube(-8,6,-6,16,8,3, 0,0)],    # back rest
     {"origin": [-8,0,-6], "size": [16,10,12]}, 10,
     0, "R:minecraft:pink_dye,S:minecraft:white_wool",
     (230,150,180), (200,120,150)),

    ("couch_teal", "Couch (Teal)", "geometry.dh.couch_teal",
     [cube(-8,0,-6,16,6,12, 0,0),
      cube(-8,6,-6,16,8,3, 0,0)],
     {"origin": [-8,0,-6], "size": [16,10,12]}, 10,
     0, "R:minecraft:cyan_dye,S:minecraft:white_wool",
     (120,200,190), (80,170,160)),

    ("armchair", "Armchair (Yellow)", "geometry.dh.armchair",
     [cube(-5,0,-5,10,6,10, 0,0),    # seat
      cube(-5,6,-5,10,7,2, 0,0),     # back
      cube(-5,6,-3,2,4,8, 0,0),      # left arm
      cube(3,6,-3,2,4,8, 0,0)],      # right arm
     {"origin": [-5,0,-5], "size": [10,10,10]}, 10,
     0, "R:minecraft:yellow_dye,S:minecraft:white_wool",
     (240,220,140), (210,190,110)),

    # ---- TABLES ----
    ("dining_table", "Dining Table", "geometry.dh.dining_table",
     [cube(-7,10,-7,14,2,14, 0,0),   # tabletop
      cube(-6,0,-6,2,10,2, 0,0),     # legs
      cube(4,0,-6,2,10,2, 0,0),
      cube(-6,0,4,2,10,2, 0,0),
      cube(4,0,4,2,10,2, 0,0)],
     {"origin": [-7,0,-7], "size": [14,12,14]}, 12,
     0, "R:minecraft:oak_planks,S:minecraft:stick",
     (180,140,90), (140,100,60)),

    ("dining_chair", "Dining Chair", "geometry.dh.dining_chair",
     [cube(-4,6,-4,8,2,8, 0,0),      # seat
      cube(-4,0,-4,2,6,2, 0,0),      # legs
      cube(2,0,-4,2,6,2, 0,0),
      cube(-4,0,2,2,6,2, 0,0),
      cube(2,0,2,2,6,2, 0,0),
      cube(-4,8,-4,8,8,2, 0,0)],     # back
     {"origin": [-4,0,-4], "size": [8,16,8]}, 16,
     0, "R:minecraft:oak_planks,S:minecraft:stick",
     (180,140,90), (150,110,70)),

    ("coffee_table", "Coffee Table", "geometry.dh.coffee_table",
     [cube(-6,4,-4,12,2,8, 0,0),     # top
      cube(-5,0,-3,2,4,2, 0,0),      # legs
      cube(3,0,-3,2,4,2, 0,0),
      cube(-5,0,1,2,4,2, 0,0),
      cube(3,0,1,2,4,2, 0,0)],
     {"origin": [-6,0,-4], "size": [12,6,8]}, 6,
     0, "R:minecraft:quartz_block,S:minecraft:stick",
     (240,240,240), (200,200,200)),

    # ---- APPLIANCES ----
    ("tv", "Television", "geometry.dh.tv",
     [cube(-7,8,-1,14,9,2, 0,0),     # screen
      cube(-3,4,-2,6,4,4, 0,0)],     # stand
     {"origin": [-7,4,-2], "size": [14,13,4]}, 13,
     10, "R:minecraft:black_dye,S:minecraft:glass",
     (30,30,40), (50,50,200)),

    ("fridge", "Refrigerator", "geometry.dh.fridge",
     [cube(-5,0,-5,10,16,10, 0,0),   # body
      cube(-5,8,-6,10,1,1, 0,0),     # handle top
      cube(-5,3,-6,10,1,1, 0,0)],    # handle bottom
     {"origin": [-5,0,-6], "size": [10,16,11]}, 16,
     0, "R:minecraft:iron_ingot,S:minecraft:white_dye",
     (220,230,240), (180,190,200)),

    ("bookshelf_deco", "Decorative Bookshelf", "geometry.dh.bookshelf_deco",
     [cube(-7,0,-3,14,16,6, 0,0),    # frame
      cube(-6,1,-2,4,4,4, 0,0),      # book slot 1
      cube(2,1,-2,4,4,4, 0,0),       # book slot 2
      cube(-6,6,-2,4,4,4, 0,0),
      cube(2,6,-2,4,4,4, 0,0),
      cube(-6,11,-2,4,4,4, 0,0),
      cube(2,11,-2,4,4,4, 0,0)],
     {"origin": [-7,0,-3], "size": [14,16,6]}, 16,
     0, "R:minecraft:book,S:minecraft:oak_planks",
     (140,90,50), (180,40,40)),

    ("lamp", "Glowing Lamp", "geometry.dh.lamp",
     [cube(-3,0,-3,6,2,6, 0,0),      # base
      cube(-1,2,-1,2,8,2, 0,0),      # pole
      cube(-4,10,-4,8,5,8, 0,0)],    # shade
     {"origin": [-4,0,-4], "size": [8,15,8]}, 15,
     15, "R:minecraft:glowstone,S:minecraft:stick",
     (255,240,200), (255,220,140)),
]


# ── Generate geometry files ────────────────────────────────────────────

print(f"Generating {len(FURNITURE)} furniture pieces...")

for fid, fname, geo_id, cubes_list, coll, coll_h, light, recipe_str, c_main, c_acc in FURNITURE:
    geo = make_geo(geo_id, cubes_list)
    (GEO_DIR / f"{fid}.json").write_text(json.dumps(geo, indent=2))

# ── Generate furniture textures ────────────────────────────────────────

for fid, fname, geo_id, cubes_list, coll, coll_h, light, recipe_str, c_main, c_acc in FURNITURE:
    img = Image.new("RGBA", (16, 16), (*c_main, 255))
    px = img.load()
    for x in range(16):
        for y in range(16):
            if (x + y) % 3 == 0:
                px[x, y] = (*c_acc, 255)
            if x == 0 or y == 0:
                shade = tuple(max(0, c - 30) for c in c_main)
                px[x, y] = (*shade, 255)
    img.save(TEX_DIR / f"furn_{fid}.png")

# ── Add to terrain_texture.json ────────────────────────────────────────

tt_path = RP / "textures" / "terrain_texture.json"
terrain = json.loads(tt_path.read_text())
for fid, *_ in FURNITURE:
    terrain["texture_data"][f"dh_furn_{fid}"] = {"textures": f"textures/blocks/furn_{fid}"}
tt_path.write_text(json.dumps(terrain, indent=2))

# ── Generate block JSONs for furniture ─────────────────────────────────

for fid, fname, geo_id, cubes_list, coll, coll_h, light, recipe_str, c_main, c_acc in FURNITURE:
    render = "alpha_test"
    block = {
        "format_version": "1.20.50",
        "minecraft:block": {
            "description": {
                "identifier": f"dh:{fid}",
                "menu_category": {
                    "category": "items",
                    "group": "itemGroup.name.candles"
                }
            },
            "components": {
                "minecraft:destructible_by_mining": {"seconds_to_destroy": 0.4},
                "minecraft:destructible_by_explosion": {"explosion_resistance": 2},
                "minecraft:geometry": geo_id,
                "minecraft:material_instances": {
                    "*": {
                        "texture": f"dh_furn_{fid}",
                        "render_method": render,
                        "ambient_occlusion": True,
                        "face_dimming": True
                    }
                },
                "minecraft:collision_box": coll,
                "minecraft:selection_box": coll
            }
        }
    }
    if light > 0:
        block["minecraft:block"]["components"]["minecraft:light_emission"] = light
    (BP / "blocks" / f"furn_{fid}.json").write_text(json.dumps(block, indent=2))

# ── Recipes for furniture ──────────────────────────────────────────────

for fid, fname, geo_id, cubes_list, coll, coll_h, light, recipe_str, c_main, c_acc in FURNITURE:
    parts = recipe_str.split(",")
    r_item = parts[0][2:]
    s_item = parts[1][2:]
    r_key = "R"
    s_key = "S"
    recipe = {
        "format_version": "1.20.50",
        "minecraft:recipe_shaped": {
            "description": {"identifier": f"dh:{fid}_recipe"},
            "tags": ["crafting_table"],
            "pattern": ["RRR", "SSS", "S S"],
            "key": {
                "R": {"item": r_item},
                "S": {"item": s_item}
            },
            "result": {"item": f"dh:{fid}", "count": 1}
        }
    }
    (BP / "recipes" / f"furn_{fid}_recipe.json").write_text(json.dumps(recipe, indent=2))

# ── Append lang entries ────────────────────────────────────────────────

lang_path = BP / "texts" / "en_US.lang"
lang = lang_path.read_text()
lang += "\n## Furniture\n"
for fid, fname, *_ in FURNITURE:
    lang += f"tile.dh:{fid}.name={fname}\n"
lang_path.write_text(lang)

print("Furniture generation complete!")
