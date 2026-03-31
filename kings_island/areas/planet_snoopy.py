"""Planet Snoopy - Kids' area themed to Peanuts characters.

Features kid-friendly rides, colorful buildings, and Peanuts theming.
Replaced the former "Nickelodeon Universe" in 2010.
"""

import math
from kings_island.mcfunction_writer import McFunctionWriter
from kings_island.config import BLOCKS, LAYOUT, ORIGIN_Y
from kings_island.geometry import (
    building_shell, cylinder_fill, cylinder, tree, dome
)


def build_planet_snoopy(pack):
    """Build Planet Snoopy kids' area."""
    writer = McFunctionWriter("kings_island/areas/planet_snoopy")

    px, py, pz = LAYOUT["planet_snoopy"]
    y = ORIGIN_Y

    writer.comment("============================================")
    writer.comment("  PLANET SNOOPY")
    writer.comment("  Kids' Area - Peanuts Themed")
    writer.comment("============================================")

    # Area ground - colorful!
    writer.comment("Planet Snoopy Ground")
    writer.fill(px - 60, y, pz - 40, px + 60, y, pz + 60, BLOCKS["grass"])

    # Colorful path
    for z in range(pz - 35, pz + 55, 2):
        colors = [BLOCKS["red_concrete"], BLOCKS["yellow_concrete"],
                  BLOCKS["blue_concrete"], BLOCKS["green_concrete"]]
        color = colors[((z - pz) // 2) % len(colors)]
        writer.fill(px - 4, y, z, px + 4, y, z + 1, color)

    # === Snoopy's Doghouse ===
    writer.comment("=== Snoopy's Doghouse ===")
    sh_x, sh_z = px - 20, pz
    # Red doghouse
    writer.fill(sh_x, y, sh_z, sh_x + 8, y + 6, sh_z + 6, BLOCKS["red_concrete"])
    writer.fill(sh_x + 1, y + 1, sh_z + 1, sh_x + 7, y + 5, sh_z + 5, BLOCKS["air"])
    # Door opening
    writer.fill(sh_x + 3, y + 1, sh_z, sh_x + 5, y + 4, sh_z, BLOCKS["air"])
    # Peaked roof (white)
    for dy in range(3):
        writer.fill(sh_x + dy, y + 6 + dy, sh_z - 1, sh_x + 8 - dy, y + 6 + dy, sh_z + 7,
                   BLOCKS["white_concrete"])
    # Snoopy on top (white wool figure)
    writer.setblock(sh_x + 4, y + 9, sh_z + 3, BLOCKS["wool_white"])
    writer.setblock(sh_x + 4, y + 10, sh_z + 3, BLOCKS["wool_white"])
    writer.setblock(sh_x + 4, y + 10, sh_z + 2, BLOCKS["wool_white"])  # head
    writer.setblock(sh_x + 4, y + 11, sh_z + 2, BLOCKS["black_concrete"])  # ear

    # === Charlie Brown's Kite Flyer (small ride) ===
    writer.comment("=== Kite Flyer Ride ===")
    kf_x, kf_z = px + 15, pz - 15
    cylinder_fill(writer, kf_x, y, kf_z, 8, 1, BLOCKS["yellow_concrete"])
    writer.fill(kf_x, y + 1, kf_z, kf_x, y + 10, kf_z, BLOCKS["iron"])
    # Kite-shaped decorations
    for angle_deg in range(0, 360, 60):
        rad = math.radians(angle_deg)
        kx = kf_x + int(6 * math.cos(rad))
        kz = kf_z + int(6 * math.sin(rad))
        color = BLOCKS["yellow_concrete"] if angle_deg % 120 == 0 else BLOCKS["red_concrete"]
        writer.setblock(kx, y + 8, kz, color)
        writer.setblock(kx, y + 7, kz, BLOCKS["iron_bars"])

    # === Woodstock Express (small coaster) ===
    writer.comment("=== Woodstock Express ===")
    from kings_island.coaster_engine import CoasterBuilder
    we_coaster = CoasterBuilder(writer, "Woodstock Express", style="wood")
    we_x, we_z = px + 30, pz + 10
    we_coaster.build_station(we_x, y, we_z, length=12, width=6, direction="z")

    we_points = [
        (we_x, y + 1, we_z + 12),
        (we_x, y + 10, we_z + 20),
        (we_x, y + 25, we_z + 30),
        (we_x, y + 38, we_z + 42),
        # Small first drop
        (we_x + 3, y + 20, we_z + 55),
        (we_x + 6, y + 8, we_z + 65),
        # Hill
        (we_x + 8, y + 20, we_z + 78),
        (we_x + 10, y + 8, we_z + 88),
        # Turnaround
        (we_x + 15, y + 12, we_z + 95),
        (we_x + 20, y + 10, we_z + 88),
        # Return
        (we_x + 18, y + 15, we_z + 75),
        (we_x + 15, y + 6, we_z + 60),
        (we_x + 10, y + 10, we_z + 45),
        (we_x + 5, y + 4, we_z + 30),
        # Brake
        (we_x + 2, y + 2, we_z + 20),
        (we_x, y + 1, we_z + 12),
    ]

    we_coaster.build_track(
        we_points, ground_y=y,
        chain_lift_segments={1, 2, 3},
        brake_segments={14, 15},
        spline_resolution=5
    )

    # === Playground Structure ===
    writer.comment("=== Playground ===")
    pg_x, pg_z = px - 30, pz + 30
    # Colorful climbing structure
    writer.fill(pg_x, y, pg_z, pg_x + 12, y, pg_z + 12, BLOCKS["path_main"])
    # Towers
    for tx_off, tz_off, color in [(0, 0, BLOCKS["red_concrete"]),
                                   (10, 0, BLOCKS["blue_concrete"]),
                                   (0, 10, BLOCKS["yellow_concrete"]),
                                   (10, 10, BLOCKS["green_concrete"])]:
        writer.fill(pg_x + tx_off, y + 1, pg_z + tz_off,
                   pg_x + tx_off + 2, y + 5, pg_z + tz_off + 2, color)
    # Bridges between towers
    writer.fill(pg_x + 2, y + 4, pg_z + 1, pg_x + 10, y + 4, pg_z + 1, BLOCKS["oak_planks"])
    writer.fill(pg_x + 2, y + 4, pg_z + 11, pg_x + 10, y + 4, pg_z + 11, BLOCKS["oak_planks"])
    writer.fill(pg_x + 1, y + 4, pg_z + 2, pg_x + 1, y + 4, pg_z + 10, BLOCKS["oak_planks"])
    writer.fill(pg_x + 11, y + 4, pg_z + 2, pg_x + 11, y + 4, pg_z + 10, BLOCKS["oak_planks"])
    # Slide (yellow)
    for s in range(6):
        writer.setblock(pg_x + 13, y + 5 - s, pg_z + 6, BLOCKS["yellow_concrete"])

    # === Peanuts Character Statues ===
    writer.comment("=== Character Statues ===")
    statues = [
        ("Charlie Brown", px - 5, pz - 10, BLOCKS["yellow_concrete"]),
        ("Lucy", px + 5, pz - 10, BLOCKS["blue_concrete"]),
        ("Linus", px - 5, pz + 10, BLOCKS["red_concrete"]),
        ("Woodstock", px + 5, pz + 10, BLOCKS["yellow_concrete"]),
    ]
    for name, sx, sz, color in statues:
        writer.comment(f"  {name}")
        # Simple figure: body + head
        writer.setblock(sx, y + 1, sz, color)
        writer.setblock(sx, y + 2, sz, color)
        writer.setblock(sx, y + 3, sz, BLOCKS["white_concrete"])  # Head
        # Nameplate
        writer.setblock(sx, y, sz - 1, BLOCKS["path_accent"])

    # === Colorful Decorations ===
    writer.comment("=== Decorations ===")
    # Balloon-like decorations (colored wool on fences)
    import random
    rng = random.Random(321)
    balloon_colors = [BLOCKS["red_concrete"], BLOCKS["blue_concrete"],
                      BLOCKS["yellow_concrete"], BLOCKS["green_concrete"],
                      BLOCKS["pink_concrete"]]
    for _ in range(20):
        bx = px + rng.randint(-40, 40)
        bz = pz + rng.randint(-25, 45)
        writer.fill(bx, y + 1, bz, bx, y + 3, bz, BLOCKS["iron_bars"])
        writer.setblock(bx, y + 4, bz, rng.choice(balloon_colors))

    # Trees with colorful leaves (fantastical)
    for _ in range(8):
        tx = px + rng.randint(-35, 35)
        tz = pz + rng.randint(-15, 40)
        tree(writer, tx, y + 1, tz,
             trunk_height=4, leaf_radius=3,
             trunk_block=BLOCKS["oak_log"],
             leaf_block=rng.choice([BLOCKS["oak_leaves"], BLOCKS["spruce_leaves"]]))

    # === Area Lighting ===
    writer.comment("Lighting")
    for z in range(pz - 25, pz + 50, 10):
        for x_off in [-6, 6]:
            writer.fill(px + x_off, y + 1, z, px + x_off, y + 4, z, BLOCKS["iron_bars"])
            writer.setblock(px + x_off, y + 5, z, BLOCKS["glowstone"])

    pack.register_writer(writer)
