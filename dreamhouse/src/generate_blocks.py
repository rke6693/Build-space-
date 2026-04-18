#!/usr/bin/env python3
"""Master generator for Dreamhouse Deluxe — all blocks, textures, recipes, and lang."""
import json, math, random
from pathlib import Path
from PIL import Image, ImageDraw

random.seed(42)

ROOT = Path(__file__).resolve().parents[1] / "build"
BP = ROOT / "DreamhouseDeluxe_BP"
RP = ROOT / "DreamhouseDeluxe_RP"
TEX_DIR = RP / "textures" / "blocks"
TEX_DIR.mkdir(parents=True, exist_ok=True)

# ── Pixel‑art helpers ──────────────────────────────────────────────────

def solid(c):
    img = Image.new("RGBA", (16,16), (*c, 255))
    return img

def brick_pattern(mortar, brick, bw=4, bh=3):
    img = Image.new("RGBA", (16,16), (*mortar, 255))
    d = ImageDraw.Draw(img)
    for row in range(0, 16, bh+1):
        offset = (bw//2) if (row // (bh+1)) % 2 else 0
        for col in range(-bw, 17, bw+1):
            x0 = col + offset
            d.rectangle([x0, row, x0+bw-1, row+bh-1], fill=(*brick, 255))
    return img

def plank_pattern(base, highlight, shadow):
    img = Image.new("RGBA", (16,16), (*base, 255))
    px = img.load()
    for x in range(16):
        for y in range(16):
            if x % 4 == 0:
                px[x, y] = (*shadow, 255)
            elif (x + y * 3) % 7 == 0:
                px[x, y] = (*highlight, 255)
    return img

def stripe_pattern(c1, c2, width=2, diagonal=False):
    img = Image.new("RGBA", (16,16), (*c1, 255))
    px = img.load()
    for x in range(16):
        for y in range(16):
            v = (x + y) if diagonal else x
            if (v // width) % 2 == 0:
                px[x, y] = (*c2, 255)
    return img

def spots_on(base, spot_color, spots=8, r=1):
    img = Image.new("RGBA", (16,16), (*base, 255))
    px = img.load()
    random.seed(base[0] + base[1])
    for _ in range(spots):
        cx, cy = random.randint(r, 15-r), random.randint(r, 15-r)
        for dx in range(-r, r+1):
            for dy in range(-r, r+1):
                if dx*dx + dy*dy <= r*r:
                    px[min(15, max(0, cx+dx)), min(15, max(0, cy+dy))] = (*spot_color, 255)
    return img

def gradient_v(top, bottom):
    img = Image.new("RGBA", (16,16), (0,0,0,0))
    px = img.load()
    for y in range(16):
        t = y / 15.0
        r = int(top[0] + (bottom[0]-top[0]) * t)
        g = int(top[1] + (bottom[1]-top[1]) * t)
        b = int(top[2] + (bottom[2]-top[2]) * t)
        for x in range(16):
            px[x, y] = (r, g, b, 255)
    return img

def checker(c1, c2, size=2):
    img = Image.new("RGBA", (16,16), (*c1, 255))
    px = img.load()
    for x in range(16):
        for y in range(16):
            if ((x // size) + (y // size)) % 2:
                px[x, y] = (*c2, 255)
    return img

def scatter_pattern(bg, shapes, count=12):
    img = Image.new("RGBA", (16,16), (*bg, 255))
    px = img.load()
    random.seed(bg[0]*7 + bg[1]*3)
    for _ in range(count):
        cx, cy = random.randint(1,14), random.randint(1,14)
        col = shapes[random.randint(0, len(shapes)-1)]
        px[cx, cy] = (*col, 255)
        for dx, dy in [(1,0),(-1,0),(0,1),(0,-1)]:
            nx, ny = cx+dx, cy+dy
            if 0 <= nx < 16 and 0 <= ny < 16:
                px[nx, ny] = (*col, 220)
    return img

def fluffy(c1, c2):
    img = Image.new("RGBA", (16,16), (*c1, 255))
    px = img.load()
    random.seed(c1[0] + c2[2])
    for x in range(16):
        for y in range(16):
            if random.random() < 0.35:
                px[x, y] = (*c2, 255)
    return img

def drip_pattern(bg, drip):
    img = Image.new("RGBA", (16,16), (*bg, 255))
    px = img.load()
    random.seed(bg[0] + drip[1])
    for x in range(16):
        depth = random.randint(2, 6)
        for y in range(depth):
            px[x, y] = (*drip, 255)
    return img

def spiral(bg, fg, cx=8, cy=8):
    img = Image.new("RGBA", (16,16), (*bg, 255))
    px = img.load()
    for x in range(16):
        for y in range(16):
            dx, dy = x - cx, y - cy
            angle = math.atan2(dy, dx)
            dist = math.sqrt(dx*dx + dy*dy)
            if int(angle / 0.8 + dist / 2.5) % 2 == 0:
                px[x, y] = (*fg, 255)
    return img

def wallpaper(bg, motif_color, motif="star"):
    img = Image.new("RGBA", (16,16), (*bg, 255))
    px = img.load()
    if motif == "star":
        positions = [(3,3),(11,3),(7,8),(3,13),(11,13)]
        for cx, cy in positions:
            px[cx, cy] = (*motif_color, 255)
            for dx, dy in [(1,0),(-1,0),(0,1),(0,-1)]:
                nx, ny = cx+dx, cy+dy
                if 0 <= nx < 16 and 0 <= ny < 16:
                    px[nx, ny] = (*motif_color, 200)
    elif motif == "heart":
        positions = [(4,4),(12,4),(4,12),(12,12)]
        for cx, cy in positions:
            for dx, dy in [(0,-1),(1,0),(-1,0),(0,1),(1,-1),(-1,-1)]:
                nx, ny = cx+dx, cy+dy
                if 0 <= nx < 16 and 0 <= ny < 16:
                    px[nx, ny] = (*motif_color, 255)
    return img

def glass_sparkle(tint, alpha=180):
    img = Image.new("RGBA", (16,16), (*tint, alpha))
    px = img.load()
    random.seed(tint[0]*13)
    for _ in range(8):
        x, y = random.randint(0,15), random.randint(0,15)
        px[x, y] = (255, 255, 255, 240)
    return img

def leaves_pattern(c1, c2, c3):
    img = Image.new("RGBA", (16,16), (*c1, 255))
    px = img.load()
    random.seed(c1[1]*5)
    for x in range(16):
        for y in range(16):
            r = random.random()
            if r < 0.25:
                px[x, y] = (*c2, 255)
            elif r < 0.35:
                px[x, y] = (*c3, 255)
    return img

# ── Block definitions: (id_suffix, display_name, texture_fn, map_color, render, light, recipe_ingredients, group) ──

FAIRY = [
    ("fairy_mushroom_red",   "Fairy Mushroom Cap (Red)",   lambda: spots_on((200,30,30),(255,255,240),6,1),   "#C81E1E", "opaque", 0, ["R:minecraft:red_dye","S:minecraft:red_mushroom"], "construction"),
    ("fairy_mushroom_purple","Fairy Mushroom Cap (Purple)",lambda: spots_on((140,40,180),(255,220,255),6,1),  "#8C28B4", "opaque", 0, ["R:minecraft:purple_dye","S:minecraft:red_mushroom"], "construction"),
    ("fairy_stem",           "Fairy Mushroom Stem",        lambda: plank_pattern((220,200,170),(235,220,195),(190,170,140)), "#DCC8AA", "opaque", 0, ["R:minecraft:brown_mushroom","S:minecraft:brown_mushroom"], "construction"),
    ("fairy_flower_pink",    "Flower Wall (Pink)",         lambda: scatter_pattern((180,220,180),[(255,140,180),(255,180,200),(220,100,140)],14), "#B4DCB4", "opaque", 0, ["R:minecraft:pink_dye","S:minecraft:moss_block"], "construction"),
    ("fairy_flower_yellow",  "Flower Wall (Yellow)",       lambda: scatter_pattern((180,220,180),[(255,240,60),(255,200,40),(240,220,80)],14),  "#B4DCB4", "opaque", 0, ["R:minecraft:yellow_dye","S:minecraft:moss_block"], "construction"),
    ("fairy_vine",           "Vine Rope",                  lambda: stripe_pattern((60,140,40),(40,100,25),2,True), "#3C8C28", "opaque", 0, ["R:minecraft:vine","S:minecraft:vine"], "construction"),
    ("fairy_toadstool",      "Toadstool Floor",            lambda: spots_on((200,170,120),(170,140,90),5,1),  "#C8AA78", "opaque", 0, ["R:minecraft:brown_mushroom","S:minecraft:dirt"], "construction"),
    ("fairy_brick",          "Fairy Brick",                lambda: brick_pattern((180,160,200),(140,100,180)), "#8C64B4", "opaque", 0, ["R:minecraft:purple_dye","S:minecraft:brick"], "construction"),
    ("fairy_moss",           "Mossy Fairy Stone",          lambda: scatter_pattern((120,120,120),[(60,140,50),(80,160,70),(50,120,40)],18), "#787878", "opaque", 0, ["R:minecraft:moss_block","S:minecraft:cobblestone"], "construction"),
    ("fairy_glow_flower",    "Glow Flower Block",          lambda: scatter_pattern((40,60,30),[(255,255,100),(200,255,80),(255,200,60)],10), "#283C1E", "alpha_test", 12, ["R:minecraft:glow_berries","S:minecraft:moss_block"], "construction"),
    ("fairy_leaf_roof",      "Leaf Roof",                  lambda: leaves_pattern((50,140,40),(70,170,55),(35,110,30)), "#328C28", "opaque", 0, ["R:minecraft:oak_leaves","S:minecraft:oak_leaves"], "construction"),
    ("fairy_bark",           "Bark Wall",                  lambda: plank_pattern((100,70,40),(120,85,50),(70,50,25)), "#644628", "opaque", 0, ["R:minecraft:oak_log","S:minecraft:oak_log"], "construction"),
    ("fairy_rose_petal",     "Rose Petal Floor",           lambda: scatter_pattern((200,160,170),[(220,80,100),(240,120,140),(200,60,80)],16), "#C8A0AA", "opaque", 0, ["R:minecraft:pink_dye","S:minecraft:red_dye"], "construction"),
    ("fairy_ivy",            "Ivy Wall",                   lambda: leaves_pattern((60,120,50),(40,90,35),(80,150,65)), "#3C7832", "alpha_test", 0, ["R:minecraft:vine","S:minecraft:moss_block"], "construction"),
    ("fairy_glass",          "Fairy Glass",                lambda: glass_sparkle((220,180,255),160), "#DCB4FF", "blend", 0, ["R:minecraft:amethyst_shard","S:minecraft:glass"], "construction"),
]

CANDY = [
    ("candy_gumdrop_red",    "Red Gumdrop Block",         lambda: gradient_v((255,80,80),(200,30,30)),     "#FF5050", "opaque", 0, ["R:minecraft:red_dye","S:minecraft:slime_ball"], "construction"),
    ("candy_gumdrop_blue",   "Blue Gumdrop Block",        lambda: gradient_v((80,150,255),(30,80,200)),    "#5096FF", "opaque", 0, ["R:minecraft:blue_dye","S:minecraft:slime_ball"], "construction"),
    ("candy_gumdrop_green",  "Green Gumdrop Block",       lambda: gradient_v((80,230,80),(30,160,30)),     "#50E650", "opaque", 0, ["R:minecraft:green_dye","S:minecraft:slime_ball"], "construction"),
    ("candy_peppermint_red", "Peppermint Wall (Red)",      lambda: stripe_pattern((255,255,255),(220,30,30),2,True), "#FFFFFF", "opaque", 0, ["R:minecraft:red_dye","S:minecraft:quartz_block"], "construction"),
    ("candy_peppermint_green","Peppermint Wall (Green)",   lambda: stripe_pattern((255,255,255),(30,180,30),2,True), "#FFFFFF", "opaque", 0, ["R:minecraft:green_dye","S:minecraft:quartz_block"], "construction"),
    ("candy_frosting",       "Frosting Trim",              lambda: drip_pattern((240,230,250),(255,200,220)),  "#F0E6FA", "opaque", 0, ["R:minecraft:sugar","S:minecraft:snow_block"], "construction"),
    ("candy_chocolate",      "Chocolate Floor",            lambda: brick_pattern((90,50,20),(120,70,30),4,4),  "#5A3214", "opaque", 0, ["R:minecraft:cocoa_beans","S:minecraft:cocoa_beans"], "construction"),
    ("candy_lollipop",       "Lollipop Block",             lambda: spiral((255,255,255),(255,80,180)),         "#FF50B4", "opaque", 0, ["R:minecraft:sugar","S:minecraft:stick"], "construction"),
    ("candy_cotton_pink",    "Cotton Candy (Pink)",        lambda: fluffy((255,180,220),(255,140,190)),        "#FFB4DC", "opaque", 0, ["R:minecraft:pink_dye","S:minecraft:white_wool"], "construction"),
    ("candy_cotton_blue",    "Cotton Candy (Blue)",        lambda: fluffy((180,210,255),(140,180,255)),        "#B4D2FF", "opaque", 0, ["R:minecraft:light_blue_dye","S:minecraft:white_wool"], "construction"),
    ("candy_cane",           "Candy Cane Block",           lambda: stripe_pattern((255,255,255),(200,20,20),3,False), "#FFFFFF", "opaque", 0, ["R:minecraft:red_dye","S:minecraft:bone"], "construction"),
    ("candy_jellybean",      "Jellybean Wall",             lambda: scatter_pattern((255,250,230),[(255,60,60),(60,200,60),(60,100,255),(255,200,40),(200,60,200)],20), "#FFFAE6", "opaque", 0, ["R:minecraft:sugar","S:minecraft:red_dye"], "construction"),
    ("candy_caramel",        "Caramel Floor",              lambda: fluffy((190,130,50),(170,110,35)),          "#BE8232", "opaque", 0, ["R:minecraft:cocoa_beans","S:minecraft:sugar"], "construction"),
    ("candy_sugar_glass",    "Sugar Glass",                lambda: glass_sparkle((255,240,250),150),           "#FFF0FA", "blend", 0, ["R:minecraft:sugar","S:minecraft:glass"], "construction"),
    ("candy_gingerbread",    "Gingerbread Brick",          lambda: brick_pattern((160,100,40),(200,130,60)),   "#A06428", "opaque", 0, ["R:minecraft:wheat","S:minecraft:cocoa_beans"], "construction"),
]

COZY = [
    ("cozy_plank_pink",      "Pastel Pink Plank",         lambda: plank_pattern((240,180,200),(255,200,220),(220,160,180)), "#F0B4C8", "opaque", 0, ["R:minecraft:pink_dye","S:minecraft:oak_planks"], "construction"),
    ("cozy_plank_blue",      "Pastel Blue Plank",         lambda: plank_pattern((180,200,240),(200,220,255),(160,180,220)), "#B4C8F0", "opaque", 0, ["R:minecraft:light_blue_dye","S:minecraft:oak_planks"], "construction"),
    ("cozy_plank_yellow",    "Pastel Yellow Plank",       lambda: plank_pattern((245,235,180),(255,245,200),(225,215,160)), "#F5EBB4", "opaque", 0, ["R:minecraft:yellow_dye","S:minecraft:oak_planks"], "construction"),
    ("cozy_plank_green",     "Pastel Green Plank",        lambda: plank_pattern((180,230,185),(200,245,205),(160,210,165)), "#B4E6B9", "opaque", 0, ["R:minecraft:lime_dye","S:minecraft:oak_planks"], "construction"),
    ("cozy_plank_purple",    "Pastel Purple Plank",       lambda: plank_pattern((215,190,240),(230,210,255),(195,170,220)), "#D7BEF0", "opaque", 0, ["R:minecraft:purple_dye","S:minecraft:oak_planks"], "construction"),
    ("cozy_plank_mint",      "Pastel Mint Plank",         lambda: plank_pattern((180,235,225),(200,250,240),(160,215,205)), "#B4EBE1", "opaque", 0, ["R:minecraft:cyan_dye","S:minecraft:oak_planks"], "construction"),
    ("cozy_rainbow_glass",   "Rainbow Glass",             lambda: gradient_v((255,100,100),(100,100,255)),    "#FF6464", "blend", 0, ["R:minecraft:red_dye","S:minecraft:glass"], "construction"),
    ("cozy_carpet_pink",     "Pink Carpet Tile",          lambda: fluffy((240,170,200),(250,190,215)),        "#F0AAC8", "opaque", 0, ["R:minecraft:pink_dye","S:minecraft:white_wool"], "construction"),
    ("cozy_carpet_blue",     "Blue Carpet Tile",          lambda: fluffy((170,200,240),(190,215,250)),        "#AAC8F0", "opaque", 0, ["R:minecraft:light_blue_dye","S:minecraft:white_wool"], "construction"),
    ("cozy_checker",         "Checkerboard Floor",        lambda: checker((240,240,240),(40,40,40),4),        "#F0F0F0", "opaque", 0, ["R:minecraft:black_dye","S:minecraft:quartz_block"], "construction"),
    ("cozy_white_brick",     "White Brick",               lambda: brick_pattern((200,200,200),(245,245,245)),  "#F5F5F5", "opaque", 0, ["R:minecraft:white_dye","S:minecraft:brick"], "construction"),
    ("cozy_cream_wall",      "Cream Wallpaper",           lambda: solid((255,245,225)),                       "#FFF5E1", "opaque", 0, ["R:minecraft:white_dye","S:minecraft:paper"], "construction"),
    ("cozy_star_wall",       "Star Wallpaper",            lambda: wallpaper((230,220,250),(255,230,80),"star"), "#E6DCFA", "opaque", 0, ["R:minecraft:glowstone_dust","S:minecraft:paper"], "construction"),
    ("cozy_heart_wall",      "Heart Wallpaper",           lambda: wallpaper((255,230,235),(230,60,80),"heart"), "#FFE6EB", "opaque", 0, ["R:minecraft:red_dye","S:minecraft:paper"], "construction"),
    ("cozy_curtain",         "Window Curtain Block",      lambda: stripe_pattern((240,200,210),(200,140,160),3,False), "#F0C8D2", "opaque", 0, ["R:minecraft:pink_dye","S:minecraft:white_wool"], "construction"),
]

ALL_BLOCKS = FAIRY + CANDY + COZY

# ── Generate textures ──────────────────────────────────────────────────

print(f"Generating {len(ALL_BLOCKS)} block textures...")
for bid, name, tex_fn, mc, rm, le, recipe, grp in ALL_BLOCKS:
    img = tex_fn()
    img.save(TEX_DIR / f"{bid}.png")
print("  done")

# ── terrain_texture.json ───────────────────────────────────────────────

terrain = {
    "resource_pack_name": "DreamhouseDeluxe",
    "texture_name": "atlas.terrain",
    "padding": 0,
    "num_mip_levels": 0,
    "texture_data": {}
}
for bid, *_ in ALL_BLOCKS:
    terrain["texture_data"][f"dh_{bid}"] = {"textures": f"textures/blocks/{bid}"}

(RP / "textures" / "terrain_texture.json").write_text(json.dumps(terrain, indent=2))
print("terrain_texture.json written")

# ── Block JSON files ───────────────────────────────────────────────────

print("Generating block JSONs...")
for bid, name, tex_fn, mc, rm, le, recipe, grp in ALL_BLOCKS:
    block = {
        "format_version": "1.20.50",
        "minecraft:block": {
            "description": {
                "identifier": f"dh:{bid}",
                "menu_category": {
                    "category": grp
                }
            },
            "components": {
                "minecraft:destructible_by_mining": {"seconds_to_destroy": 0.6},
                "minecraft:destructible_by_explosion": {"explosion_resistance": 3},
                "minecraft:map_color": mc,
                "minecraft:material_instances": {
                    "*": {
                        "texture": f"dh_{bid}",
                        "render_method": rm
                    }
                }
            }
        }
    }
    if le > 0:
        block["minecraft:block"]["components"]["minecraft:light_emission"] = le
    (BP / "blocks" / f"{bid}.json").write_text(json.dumps(block, indent=2))
print("  done")

# ── Recipes ────────────────────────────────────────────────────────────

print("Generating recipes...")
for bid, name, tex_fn, mc, rm, le, recipe_items, grp in ALL_BLOCKS:
    r_key = recipe_items[0].split(":")[0]
    r_item = recipe_items[0][2:]
    s_key = recipe_items[1].split(":")[0]
    s_item = recipe_items[1][2:]
    recipe = {
        "format_version": "1.20.50",
        "minecraft:recipe_shaped": {
            "description": {"identifier": f"dh:{bid}_recipe"},
            "tags": ["crafting_table"],
            "pattern": [r_key + r_key + r_key, s_key + s_key + s_key, s_key + s_key + s_key],
            "key": {
                r_key: {"item": r_item},
                s_key: {"item": s_item}
            },
            "result": {"item": f"dh:{bid}", "count": 8}
        }
    }
    if r_key == s_key:
        recipe["minecraft:recipe_shaped"]["pattern"] = ["AAA","AAA","   "]
        recipe["minecraft:recipe_shaped"]["key"] = {"A": {"item": r_item}}

    (BP / "recipes" / f"{bid}_recipe.json").write_text(json.dumps(recipe, indent=2))
print("  done")

# ── Lang entries for blocks ────────────────────────────────────────────

lang_lines = [
    "pack.name=Dreamhouse Deluxe",
    "pack.description=The ultimate build-a-home kit! 60+ blocks, 3D furniture, magic wands, and pets.",
    ""
]
for bid, name, *_ in ALL_BLOCKS:
    lang_lines.append(f"tile.dh:{bid}.name={name}")

(BP / "texts" / "en_US.lang").write_text("\n".join(lang_lines) + "\n")
print("Lang file written")

(BP / "texts" / "languages.json").write_text('["en_US"]\n')
print("All block generation complete!")
