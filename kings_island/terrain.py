"""Terrain generation - ground, paths, water features, elevation."""

import math
from kings_island.mcfunction_writer import McFunctionWriter
from kings_island.config import BLOCKS, ORIGIN_X, ORIGIN_Y, LAYOUT
from kings_island.geometry import (
    fill_box, floor_rect, cylinder_fill, filled_circle_points, tree
)


def generate_terrain(pack):
    """Generate all terrain including ground, paths, water, and landscaping."""
    writer = McFunctionWriter("kings_island/terrain/ground")
    _build_ground_plane(writer)
    pack.register_writer(writer)

    writer2 = McFunctionWriter("kings_island/terrain/paths")
    _build_paths(writer2)
    pack.register_writer(writer2)

    writer3 = McFunctionWriter("kings_island/terrain/water")
    _build_water_features(writer3)
    pack.register_writer(writer3)

    writer4 = McFunctionWriter("kings_island/terrain/elevation")
    _build_elevation(writer4)
    pack.register_writer(writer4)

    writer5 = McFunctionWriter("kings_island/terrain/landscaping")
    _build_landscaping(writer5)
    pack.register_writer(writer5)


def _build_ground_plane(writer):
    """Lay down the base ground for the entire park."""
    writer.comment("=== Park Ground Plane ===")

    # Main park area - grass base layer
    # Park spans roughly from x=-350 to x=350, z=-250 to z=500
    # Build in chunks for the fill volume limit

    # Dirt sub-layer
    for x_start in range(-350, 350, 100):
        x_end = min(x_start + 99, 349)
        writer.fill(x_start, ORIGIN_Y - 3, -250, x_end, ORIGIN_Y - 1, 500, BLOCKS["dirt"])

    # Grass top layer
    for x_start in range(-350, 350, 100):
        x_end = min(x_start + 99, 349)
        writer.fill(x_start, ORIGIN_Y, -250, x_end, ORIGIN_Y, 500, BLOCKS["grass"])

    # Main entrance plaza - checkerboard red/white concrete
    writer.comment("Main Entrance Plaza")
    ex, ey, ez = LAYOUT["main_entrance"]
    for x in range(ex - 40, ex + 41):
        for z in range(ez - 10, ez + 11):
            block = BLOCKS["plaza_red"] if (x + z) % 2 == 0 else BLOCKS["plaza_white"]
            writer.setblock(x, ey, z, block)

    # Entrance arch/gate area
    writer.comment("Entrance Gate")
    writer.fill(ex - 30, ey + 1, ez - 3, ex - 28, ey + 12, ez - 1, BLOCKS["white_concrete"])
    writer.fill(ex + 28, ey + 1, ez - 3, ex + 30, ey + 12, ez - 1, BLOCKS["white_concrete"])
    writer.fill(ex - 30, ey + 10, ez - 3, ex + 30, ey + 12, ez - 1, BLOCKS["white_concrete"])

    # "KINGS ISLAND" sign - gold blocks on the arch
    writer.fill(ex - 15, ey + 11, ez - 4, ex + 15, ey + 11, ez - 4, BLOCKS["yellow_concrete"])
    writer.fill(ex - 15, ey + 10, ez - 4, ex + 15, ey + 10, ez - 4, BLOCKS["yellow_concrete"])

    # Turnstile area
    for tx in range(-20, 21, 5):
        writer.fill(ex + tx, ey + 1, ez, ex + tx, ey + 3, ez, BLOCKS["iron_bars"])


def _build_paths(writer):
    """Build the main walkway system connecting all areas."""
    writer.comment("=== Main Pathways ===")

    y = ORIGIN_Y

    # International Street - wide boulevard from entrance to fountain
    writer.comment("International Street Boulevard")
    ix, iy, iz = LAYOUT["international_street"]
    fx, fy, fz = LAYOUT["royal_fountain"]
    ex, ey, ez = LAYOUT["main_entrance"]

    # Main boulevard - smooth stone with brick borders
    writer.fill(ix - 12, y, ez + 12, ix + 12, y, fz - 15, BLOCKS["path_main"])
    # Brick borders
    writer.fill(ix - 13, y, ez + 12, ix - 13, y, fz - 15, BLOCKS["path_brick"])
    writer.fill(ix + 13, y, ez + 12, ix + 13, y, fz - 15, BLOCKS["path_brick"])

    # Fountain plaza - large circular area
    writer.comment("Royal Fountain Plaza")
    for x in range(fx - 30, fx + 31):
        for z in range(fz - 30, fz + 31):
            dist = math.sqrt((x - fx) ** 2 + (z - fz) ** 2)
            if dist <= 30:
                if dist <= 28:
                    writer.setblock(x, y, z, BLOCKS["path_main"])
                else:
                    writer.setblock(x, y, z, BLOCKS["path_brick"])

    # Path to Coney Mall (east)
    cx, cy, cz = LAYOUT["coney_mall"]
    writer.fill(fx + 15, y, fz - 6, cx, y, fz + 6, BLOCKS["path_main"])

    # Path to Action Zone (west)
    ax, ay, az = LAYOUT["action_zone"]
    writer.fill(ax, y, fz - 6, fx - 15, y, fz + 6, BLOCKS["path_main"])

    # Path to Rivertown (south-east)
    rx, ry, rz = LAYOUT["rivertown"]
    writer.fill(fx - 6, y, fz + 15, fx + 6, y, rz, BLOCKS["path_main"])
    writer.fill(fx + 6, y, rz - 6, rx, y, rz + 6, BLOCKS["path_main"])

    # Path to Area 72 (south-west)
    a7x, a7y, a7z = LAYOUT["area_72"]
    writer.fill(ax - 6, y, az, ax + 6, y, a7z, BLOCKS["path_main"])
    writer.fill(a7x, y, a7z - 6, ax + 6, y, a7z + 6, BLOCKS["path_main"])

    # Path to Planet Snoopy (east-south)
    px, py, pz = LAYOUT["planet_snoopy"]
    writer.fill(cx - 6, y, cz, cx + 6, y, pz, BLOCKS["path_main"])
    writer.fill(cx + 6, y, pz - 6, px, y, pz + 6, BLOCKS["path_main"])

    # Circular connector paths around the Eiffel Tower
    writer.comment("Ring Path around Eiffel Tower")
    for angle in range(0, 360, 2):
        rad = math.radians(angle)
        for r in range(33, 37):
            px_r = fx + int(r * math.cos(rad))
            pz_r = fz + int(r * math.sin(rad))
            writer.setblock(px_r, y, pz_r, BLOCKS["path_accent"])


def _build_water_features(writer):
    """Build lakes, ponds, and the Royal Fountain basin."""
    writer.comment("=== Water Features ===")

    y = ORIGIN_Y

    # Royal Fountain basin
    fx, fy, fz = LAYOUT["royal_fountain"]
    writer.comment("Royal Fountain Basin")
    for x in range(fx - 12, fx + 13):
        for z in range(fz - 12, fz + 13):
            dist = math.sqrt((x - fx) ** 2 + (z - fz) ** 2)
            if dist <= 12:
                writer.setblock(x, y - 1, z, BLOCKS["prismarine"])
                writer.setblock(x, y, z, BLOCKS["water"])

    # Decorative fountain ring
    for x in range(fx - 14, fx + 15):
        for z in range(fz - 14, fz + 15):
            dist = math.sqrt((x - fx) ** 2 + (z - fz) ** 2)
            if 12 < dist <= 14:
                writer.setblock(x, y, z, BLOCKS["path_accent"])
                if dist > 13:
                    writer.setblock(x, y + 1, z, BLOCKS["path_accent"])

    # Diamondback splashdown lake
    dsx, dsy, dsz = LAYOUT["diamondback_station"]
    lake_x, lake_z = dsx + 30, dsz + 50
    writer.comment("Diamondback Splashdown Lake")
    for x in range(lake_x - 15, lake_x + 16):
        for z in range(lake_z - 10, lake_z + 11):
            dist = math.sqrt((x - lake_x) ** 2 + (z - lake_z) ** 2)
            if dist <= 12:
                writer.setblock(x, y - 2, z, BLOCKS["sand"])
                writer.setblock(x, y - 1, z, BLOCKS["water"])

    # White Water Canyon area (near Rivertown)
    rx, ry, rz = LAYOUT["rivertown"]
    stream_x = rx - 30
    writer.comment("River/Stream")
    for z in range(rz - 20, rz + 80):
        # Meandering stream
        offset = int(5 * math.sin(z * 0.05))
        for dx in range(-3, 4):
            writer.setblock(stream_x + offset + dx, y - 1, z, BLOCKS["water"])
            writer.setblock(stream_x + offset + dx, y - 2, z, BLOCKS["gravel"])


def _build_elevation(writer):
    """Create terrain elevation changes - ravines for The Beast, hills."""
    writer.comment("=== Terrain Elevation ===")

    y = ORIGIN_Y

    # The Beast ravine system - carved terrain south of Rivertown
    bx, by, bz = LAYOUT["the_beast_station"]
    writer.comment("Beast Ravine")
    for z in range(bz + 30, bz + 200):
        # Ravine widens and deepens
        progress = (z - bz - 30) / 170
        depth = int(15 + 10 * math.sin(progress * math.pi))
        width = int(8 + 6 * math.sin(progress * math.pi * 2))

        center_x = bx + int(30 * math.sin(progress * math.pi * 1.5))

        for dx in range(-width, width + 1):
            # Carve out ravine
            local_depth = int(depth * (1 - (abs(dx) / max(width, 1)) ** 2))
            if local_depth > 0:
                writer.fill(center_x + dx, y - local_depth, z,
                           center_x + dx, y, z, BLOCKS["air"])
                # Rocky walls
                writer.setblock(center_x + dx, y - local_depth, z, BLOCKS["stone"])

    # Orion hill - elevated terrain
    ox, oy, oz = LAYOUT["orion_station"]
    writer.comment("Orion Hill")
    for x in range(ox - 30, ox + 31):
        for z in range(oz - 10, oz + 40):
            dist = math.sqrt((x - ox) ** 2 + (z - oz - 15) ** 2)
            if dist < 35:
                height = int(8 * (1 - dist / 35))
                if height > 0:
                    writer.fill(x, y + 1, z, x, y + height, z, BLOCKS["dirt"])
                    writer.setblock(x, y + height + 1, z, BLOCKS["grass"])


def _build_landscaping(writer):
    """Place trees, flower beds, and decorative vegetation."""
    writer.comment("=== Landscaping ===")

    y = ORIGIN_Y

    # International Street trees (rows of trees along the boulevard)
    ix, iy, iz = LAYOUT["international_street"]
    ez = LAYOUT["main_entrance"][2]
    fz = LAYOUT["royal_fountain"][2]

    writer.comment("International Street Trees")
    for z in range(ez + 20, fz - 20, 15):
        tree(writer, ix - 16, y + 1, z, trunk_height=6, leaf_radius=3,
             trunk_block=BLOCKS["dark_oak_log"], leaf_block=BLOCKS["dark_oak_leaves"])
        tree(writer, ix + 16, y + 1, z, trunk_height=6, leaf_radius=3,
             trunk_block=BLOCKS["dark_oak_log"], leaf_block=BLOCKS["dark_oak_leaves"])

    # Rivertown forest
    rx, ry, rz = LAYOUT["rivertown"]
    writer.comment("Rivertown Forest")
    import random
    # Use deterministic seed for reproducibility
    rng = random.Random(42)
    for _ in range(60):
        tx = rx + rng.randint(-50, 80)
        tz = rz + rng.randint(20, 120)
        # Don't place on paths
        dist_to_path = min(abs(tx - rx), abs(tz - rz))
        if dist_to_path > 8:
            tree(writer, tx, y + 1, tz,
                 trunk_height=rng.randint(5, 8),
                 leaf_radius=rng.randint(2, 4),
                 trunk_block=BLOCKS["oak_log"],
                 leaf_block=BLOCKS["oak_leaves"])

    # Beast woodland area
    bx, by, bz = LAYOUT["the_beast_station"]
    writer.comment("Beast Woods")
    for _ in range(80):
        tx = bx + rng.randint(-60, 100)
        tz = bz + rng.randint(20, 200)
        tree(writer, tx, y + 1, tz,
             trunk_height=rng.randint(6, 10),
             leaf_radius=rng.randint(3, 5),
             trunk_block=BLOCKS["spruce_log"],
             leaf_block=BLOCKS["spruce_leaves"])

    # Flower beds around International Street
    writer.comment("Flower Beds")
    for z in range(ez + 15, fz - 15, 20):
        for dx in [-10, 10]:
            for fz_off in range(5):
                for fx_off in range(3):
                    flower = rng.choice([BLOCKS["rose"], BLOCKS["dandelion"]])
                    writer.setblock(ix + dx + fx_off, y + 1, z + fz_off, flower)

    # Planet Snoopy colorful bushes
    px, py, pz = LAYOUT["planet_snoopy"]
    writer.comment("Planet Snoopy Gardens")
    for _ in range(20):
        bx_s = px + rng.randint(-30, 30)
        bz_s = pz + rng.randint(-20, 30)
        leaf_color = rng.choice([BLOCKS["oak_leaves"], BLOCKS["spruce_leaves"]])
        writer.fill(bx_s - 1, y + 1, bz_s - 1, bx_s + 1, y + 2, bz_s + 1, leaf_color)
