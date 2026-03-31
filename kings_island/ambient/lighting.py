"""Park-wide lighting system for immersive nighttime experience."""

import math
from kings_island.mcfunction_writer import McFunctionWriter
from kings_island.config import BLOCKS, LAYOUT, ORIGIN_Y


def build_lighting(pack):
    """Build comprehensive lighting throughout the park."""
    writer = McFunctionWriter("kings_island/ambient/lighting")

    y = ORIGIN_Y

    writer.comment("============================================")
    writer.comment("  PARK LIGHTING SYSTEM")
    writer.comment("  For immersive day/night experience")
    writer.comment("============================================")

    # === Main Entrance Grand Lighting ===
    writer.comment("=== Main Entrance Lighting ===")
    ex, ey, ez = LAYOUT["main_entrance"]
    for x in range(ex - 25, ex + 26, 5):
        writer.setblock(x, ey + 1, ez - 5, BLOCKS["sea_lantern"])
        writer.setblock(x, ey + 13, ez - 2, BLOCKS["glowstone"])

    # === Path Lighting (throughout park) ===
    writer.comment("=== Path Lighting ===")
    fx, fy, fz = LAYOUT["royal_fountain"]

    # Radial paths from fountain
    for angle_deg in range(0, 360, 30):
        rad = math.radians(angle_deg)
        for dist in range(20, 80, 15):
            lx = fx + int(dist * math.cos(rad))
            lz = fz + int(dist * math.sin(rad))
            # Ground-level path light
            writer.setblock(lx, y, lz, BLOCKS["sea_lantern"])

    # === Eiffel Tower Night Lighting ===
    writer.comment("=== Eiffel Tower Spotlight ===")
    tx, ty, tz = LAYOUT["eiffel_tower"]
    # Ring of spotlights around base
    for angle_deg in range(0, 360, 45):
        rad = math.radians(angle_deg)
        spot_x = int(55 * math.cos(rad))
        spot_z = int(55 * math.sin(rad))
        writer.setblock(spot_x, y, spot_z, BLOCKS["sea_lantern"])
        writer.setblock(spot_x, y + 1, spot_z, BLOCKS["glowstone"])

    # === Ride Queue Lighting ===
    writer.comment("=== Ride Queue Lighting ===")
    for ride_key in ["the_beast_station", "orion_station", "diamondback_station",
                     "banshee_station", "mystic_timbers_station", "the_racer_station"]:
        rx, ry, rz = LAYOUT[ride_key]
        # Lights approaching each ride
        for dz in range(-15, 0, 5):
            writer.setblock(rx - 5, y + 4, rz + dz, BLOCKS["lantern"])
            writer.setblock(rx + 5, y + 4, rz + dz, BLOCKS["lantern"])

    # === Water Feature Lighting ===
    writer.comment("=== Water Feature Lighting ===")
    fx, fy, fz = LAYOUT["royal_fountain"]
    for angle_deg in range(0, 360, 20):
        rad = math.radians(angle_deg)
        for r in [5, 10]:
            lx = fx + int(r * math.cos(rad))
            lz = fz + int(r * math.sin(rad))
            writer.setblock(lx, y - 1, lz, BLOCKS["sea_lantern"])

    # === Decorative String Lights (Coney Mall) ===
    writer.comment("=== Coney Mall String Lights ===")
    cx, cy, cz = LAYOUT["coney_mall"]
    for z in range(cz - 20, cz + 60, 2):
        writer.setblock(cx, y + 7, z, BLOCKS["glowstone"])
        # Side strings
        if z % 4 == 0:
            writer.setblock(cx - 8, y + 6, z, BLOCKS["glowstone"])
            writer.setblock(cx + 8, y + 6, z, BLOCKS["glowstone"])

    # === Planet Snoopy Colorful Lighting ===
    writer.comment("=== Planet Snoopy Lights ===")
    px, py, pz = LAYOUT["planet_snoopy"]
    colors_light = [BLOCKS["glowstone"], BLOCKS["sea_lantern"], BLOCKS["redstone_lamp"]]
    for i, z in enumerate(range(pz - 20, pz + 40, 6)):
        color = colors_light[i % len(colors_light)]
        writer.setblock(px - 5, y + 4, z, color)
        writer.setblock(px + 5, y + 4, z, color)

    # === Area 72 Accent Lighting ===
    writer.comment("=== Area 72 Glow Lighting ===")
    a7x, a7y, a7z = LAYOUT["area_72"]
    for z in range(a7z - 20, a7z + 60, 5):
        writer.setblock(a7x - 1, y, z, BLOCKS["sea_lantern"])
        writer.setblock(a7x + 1, y, z, BLOCKS["sea_lantern"])

    pack.register_writer(writer)
