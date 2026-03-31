"""Flat rides and other non-coaster attractions."""

from kings_island.mcfunction_writer import McFunctionWriter
from kings_island.coaster_engine import FlatRideBuilder
from kings_island.config import BLOCKS, LAYOUT, ORIGIN_Y
from kings_island.geometry import cylinder_fill, cylinder, building_shell


def build_flat_rides(pack):
    """Build all flat rides and attractions."""
    writer = McFunctionWriter("kings_island/rides/flat_rides")
    y = ORIGIN_Y

    writer.comment("============================================")
    writer.comment("  FLAT RIDES & ATTRACTIONS")
    writer.comment("============================================")

    flat = FlatRideBuilder(writer)

    # Drop Tower: Scream Zone (315 feet - tallest gyro drop in the world when built)
    dtx, dty, dtz = LAYOUT["drop_tower"]
    flat.drop_tower(dtx, y, dtz, height=150)

    # WindSeeker
    wsx, wsy, wsz = LAYOUT["windseeker"]
    flat.windseeker(wsx, y, wsz, height=100)

    # Delirium (near Action Zone)
    ax, ay, az = LAYOUT["action_zone"]
    flat.delirium(ax + 30, y, az + 30)

    # Grand Carousel (Coney Mall)
    cx, cy, cz = LAYOUT["coney_mall"]
    flat.carousel(cx, y, cz + 20, radius=10)

    # Eiffel Tower base observation area (people can walk here)
    writer.comment("=== Eiffel Tower Base Plaza ===")
    tx, ty, tz = LAYOUT["eiffel_tower"]
    # Staircase from ground level down to tower base
    for step in range(ORIGIN_Y - ty):
        s_y = ORIGIN_Y - step
        writer.fill(tx - 3, s_y, tz - 55 - step, tx + 3, s_y, tz - 55 - step, BLOCKS["path_accent"])
    # Small plaza at base
    writer.fill(tx - 20, ty, tz - 20, tx + 20, ty, tz + 20, BLOCKS["path_main"])

    # Scrambler ride (Planet Snoopy area)
    px, py, pz = LAYOUT["planet_snoopy"]
    writer.comment("=== Scrambler ===")
    cylinder_fill(writer, px + 20, y, pz + 20, 8, 1, BLOCKS["plaza_white"])
    writer.fill(px + 20, y + 1, pz + 20, px + 20, y + 4, pz + 20, BLOCKS["iron"])
    for angle_i in range(6):
        import math
        angle = math.radians(angle_i * 60)
        arm_x = px + 20 + int(6 * math.cos(angle))
        arm_z = pz + 20 + int(6 * math.sin(angle))
        writer.fill(px + 20, y + 3, pz + 20, arm_x, y + 3, arm_z, BLOCKS["iron_bars"])
        writer.setblock(arm_x, y + 2, arm_z, BLOCKS["yellow_concrete"])

    # Bumper Cars building (Coney Mall)
    writer.comment("=== Bumper Cars ===")
    building_shell(writer, cx - 20, y, cz + 40, 25, 20, 8,
                   BLOCKS["blue_concrete"], BLOCKS["path_main"], BLOCKS["gray_concrete"])
    # Lights inside
    for lx in range(cx - 18, cx + 7, 4):
        for lz in range(cz + 42, cz + 58, 4):
            writer.setblock(lx, y + 7, lz, BLOCKS["glowstone"])

    # Slingshot (tall ride near Action Zone)
    writer.comment("=== Slingshot ===")
    sling_x = ax - 20
    sling_z = az - 20
    writer.fill(sling_x - 2, y, sling_z - 2, sling_x + 2, y, sling_z + 2, BLOCKS["path_main"])
    writer.fill(sling_x - 1, y + 1, sling_z, sling_x - 1, y + 80, sling_z, BLOCKS["iron"])
    writer.fill(sling_x + 1, y + 1, sling_z, sling_x + 1, y + 80, sling_z, BLOCKS["iron"])
    writer.fill(sling_x - 1, y + 80, sling_z, sling_x + 1, y + 80, sling_z, BLOCKS["iron"])

    pack.register_writer(writer)
