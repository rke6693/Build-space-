"""Coney Mall - Classic midway area.

Home to The Racer, classic midway games, and nostalgic attractions.
Named after the original Coney Island park in Cincinnati.
"""

from kings_island.mcfunction_writer import McFunctionWriter
from kings_island.config import BLOCKS, LAYOUT, ORIGIN_Y
from kings_island.geometry import building_shell, peaked_roof


def build_coney_mall(pack):
    """Build Coney Mall themed area."""
    writer = McFunctionWriter("kings_island/areas/coney_mall")

    cx, cy, cz = LAYOUT["coney_mall"]
    y = ORIGIN_Y

    writer.comment("============================================")
    writer.comment("  CONEY MALL")
    writer.comment("  Classic Midway & Games")
    writer.comment("============================================")

    # Area ground - classic midway feel
    writer.comment("Coney Mall Ground")
    writer.fill(cx - 50, y, cz - 30, cx + 60, y, cz + 70, BLOCKS["grass"])
    # Midway path
    writer.fill(cx - 6, y, cz - 30, cx + 6, y, cz + 70, BLOCKS["path_main"])
    # Brick borders
    writer.fill(cx - 7, y, cz - 30, cx - 7, y, cz + 70, BLOCKS["path_brick"])
    writer.fill(cx + 7, y, cz - 30, cx + 7, y, cz + 70, BLOCKS["path_brick"])

    # === Game Booths ===
    writer.comment("=== Midway Game Booths ===")
    booth_colors = [
        BLOCKS["red_concrete"], BLOCKS["blue_concrete"],
        BLOCKS["yellow_concrete"], BLOCKS["green_concrete"],
        BLOCKS["orange_concrete"], BLOCKS["purple_concrete"],
    ]

    for i, bz_off in enumerate(range(-20, 50, 12)):
        color = booth_colors[i % len(booth_colors)]

        # West side booths
        writer.comment(f"  Game Booth {i + 1}")
        writer.fill(cx - 20, y, cz + bz_off, cx - 10, y, cz + bz_off + 8, BLOCKS["path_main"])
        writer.fill(cx - 20, y + 1, cz + bz_off, cx - 20, y + 5, cz + bz_off + 8, color)
        writer.fill(cx - 10, y + 1, cz + bz_off, cx - 10, y + 5, cz + bz_off + 8, color)
        writer.fill(cx - 20, y + 1, cz + bz_off, cx - 10, y + 5, cz + bz_off, color)
        writer.fill(cx - 20, y + 5, cz + bz_off - 1, cx - 10, y + 5, cz + bz_off + 9, color)
        # Counter
        writer.fill(cx - 12, y + 2, cz + bz_off + 1, cx - 12, y + 2, cz + bz_off + 7,
                   BLOCKS["oak_planks"])
        # Open front
        writer.fill(cx - 11, y + 1, cz + bz_off + 1, cx - 11, y + 4, cz + bz_off + 7, BLOCKS["air"])
        # Lights
        writer.setblock(cx - 15, y + 4, cz + bz_off + 4, BLOCKS["glowstone"])

        # East side booths (mirrored)
        writer.fill(cx + 10, y, cz + bz_off, cx + 20, y, cz + bz_off + 8, BLOCKS["path_main"])
        writer.fill(cx + 10, y + 1, cz + bz_off, cx + 10, y + 5, cz + bz_off + 8, color)
        writer.fill(cx + 20, y + 1, cz + bz_off, cx + 20, y + 5, cz + bz_off + 8, color)
        writer.fill(cx + 10, y + 1, cz + bz_off, cx + 20, y + 5, cz + bz_off, color)
        writer.fill(cx + 10, y + 5, cz + bz_off - 1, cx + 20, y + 5, cz + bz_off + 9, color)
        writer.fill(cx + 12, y + 2, cz + bz_off + 1, cx + 12, y + 2, cz + bz_off + 7,
                   BLOCKS["oak_planks"])
        writer.fill(cx + 11, y + 1, cz + bz_off + 1, cx + 11, y + 4, cz + bz_off + 7, BLOCKS["air"])
        writer.setblock(cx + 15, y + 4, cz + bz_off + 4, BLOCKS["glowstone"])

    # === Prize Tent ===
    writer.comment("=== Prize Tent ===")
    writer.fill(cx - 15, y, cz + 55, cx + 15, y, cz + 68, BLOCKS["path_main"])
    # Striped tent (alternating colors)
    for dx in range(cx - 15, cx + 16):
        stripe = BLOCKS["red_concrete"] if (dx // 2) % 2 == 0 else BLOCKS["white_concrete"]
        writer.fill(dx, y + 6, cz + 55, dx, y + 6, cz + 68, stripe)
    # Tent poles
    for px_off in [-12, -4, 4, 12]:
        writer.fill(cx + px_off, y + 1, cz + 55, cx + px_off, y + 6, cz + 55, BLOCKS["oak_log"])
        writer.fill(cx + px_off, y + 1, cz + 68, cx + px_off, y + 6, cz + 68, BLOCKS["oak_log"])

    # === Cotton Candy / Food Stands ===
    writer.comment("=== Food Stands ===")
    food_stands = [
        ("Funnel Cakes", cx - 30, cz + 10, BLOCKS["pink_concrete"]),
        ("Cotton Candy", cx - 30, cz + 30, BLOCKS["magenta_concrete"]),
        ("Corn Dogs", cx + 25, cz + 10, BLOCKS["yellow_concrete"]),
        ("Lemonade", cx + 25, cz + 30, BLOCKS["lime_concrete"]),
    ]

    for name, fx, fz, color in food_stands:
        writer.comment(f"  {name}")
        writer.fill(fx, y, fz, fx + 8, y, fz + 6, BLOCKS["path_main"])
        writer.fill(fx, y + 1, fz, fx + 8, y + 4, fz + 6, color)
        writer.fill(fx + 1, y + 1, fz + 1, fx + 7, y + 3, fz + 5, BLOCKS["air"])
        # Counter window
        writer.fill(fx + 2, y + 1, fz, fx + 6, y + 3, fz, BLOCKS["air"])
        writer.fill(fx + 2, y + 1, fz, fx + 6, y + 1, fz, BLOCKS["oak_planks"])
        # Awning
        writer.fill(fx - 1, y + 4, fz - 2, fx + 9, y + 4, fz - 1, color)
        writer.setblock(fx + 4, y + 3, fz + 3, BLOCKS["lantern"])

    # === Midway Decorations ===
    writer.comment("=== Midway Decorations ===")
    # String lights (glowstone line overhead)
    for z in range(cz - 20, cz + 60, 3):
        writer.setblock(cx, y + 7, z, BLOCKS["glowstone"])

    # Lampposts
    for z in range(cz - 15, cz + 55, 12):
        for x_off in [-8, 8]:
            writer.fill(cx + x_off, y + 1, z, cx + x_off, y + 5, z, BLOCKS["iron_bars"])
            writer.setblock(cx + x_off, y + 6, z, BLOCKS["redstone_lamp"])

    pack.register_writer(writer)
