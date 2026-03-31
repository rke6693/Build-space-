"""Area 72 - Sci-fi/alien themed area.

Home to Orion giga coaster.
Themed as a top-secret research facility.
Replaced the former "X-Base" area.
"""

import math
from kings_island.mcfunction_writer import McFunctionWriter
from kings_island.config import BLOCKS, LAYOUT, ORIGIN_Y
from kings_island.geometry import cylinder_fill, cylinder, building_shell, dome


def build_area_72(pack):
    """Build Area 72 sci-fi themed area."""
    writer = McFunctionWriter("kings_island/areas/area_72")

    a7x, a7y, a7z = LAYOUT["area_72"]
    y = ORIGIN_Y

    writer.comment("============================================")
    writer.comment("  AREA 72")
    writer.comment("  Top-Secret Research Facility")
    writer.comment("  Home of Orion")
    writer.comment("============================================")

    # Area ground - futuristic concrete with accent lines
    writer.comment("Area 72 Ground")
    writer.fill(a7x - 60, y, a7z - 40, a7x + 60, y, a7z + 80, BLOCKS["grass"])
    # Main path - dark with glowing accents
    writer.fill(a7x - 6, y, a7z - 40, a7x + 6, y, a7z + 80, BLOCKS["gray_concrete"])
    # Purple accent lines in path
    writer.fill(a7x - 1, y, a7z - 40, a7x - 1, y, a7z + 80, BLOCKS["purple_concrete"])
    writer.fill(a7x + 1, y, a7z - 40, a7x + 1, y, a7z + 80, BLOCKS["purple_concrete"])

    # === Research Lab Buildings ===
    writer.comment("=== Research Lab Alpha ===")
    lab_x = a7x - 30
    lab_z = a7z
    # Main building - modern angular
    writer.fill(lab_x, y, lab_z, lab_x + 25, y + 10, lab_z + 18, BLOCKS["gray_concrete"])
    writer.fill(lab_x + 1, y + 1, lab_z + 1, lab_x + 24, y + 9, lab_z + 17, BLOCKS["air"])
    # Glass facade
    writer.fill(lab_x, y + 2, lab_z, lab_x, y + 8, lab_z + 18, BLOCKS["blue_glass"])
    # Roof equipment
    writer.fill(lab_x + 5, y + 10, lab_z + 5, lab_x + 10, y + 12, lab_z + 10, BLOCKS["iron"])
    # Interior - sci-fi lab
    writer.fill(lab_x + 2, y, lab_z + 2, lab_x + 23, y, lab_z + 16, BLOCKS["prismarine"])
    for lx in range(lab_x + 3, lab_x + 23, 3):
        writer.setblock(lx, y + 9, lab_z + 9, BLOCKS["sea_lantern"])
    # Purple accent lighting
    writer.fill(lab_x + 1, y + 1, lab_z, lab_x + 24, y + 1, lab_z, BLOCKS["purple_concrete"])
    writer.fill(lab_x + 1, y + 1, lab_z + 18, lab_x + 24, y + 1, lab_z + 18, BLOCKS["purple_concrete"])

    # === Radar Dome ===
    writer.comment("=== Radar Dome ===")
    dome_x = a7x + 25
    dome_z = a7z + 20
    # Base platform
    cylinder_fill(writer, dome_x, y, dome_z, 10, 2, BLOCKS["gray_concrete"])
    # Dome structure
    dome(writer, dome_x, y + 2, dome_z, 10, BLOCKS["white_concrete"])
    # Antenna on top
    writer.fill(dome_x, y + 12, dome_z, dome_x, y + 20, dome_z, BLOCKS["iron"])
    writer.setblock(dome_x, y + 20, dome_z, BLOCKS["redstone_lamp"])

    # === Control Tower ===
    writer.comment("=== Control Tower ===")
    tower_x = a7x + 30
    tower_z = a7z - 10
    # Tower shaft
    writer.fill(tower_x - 3, y, tower_z - 3, tower_x + 3, y + 25, tower_z + 3, BLOCKS["gray_concrete"])
    # Glass observation level
    writer.fill(tower_x - 4, y + 20, tower_z - 4, tower_x + 4, y + 20, tower_z + 4, BLOCKS["iron"])
    writer.fill(tower_x - 4, y + 21, tower_z - 4, tower_x + 4, y + 24, tower_z + 4, BLOCKS["blue_glass"])
    writer.fill(tower_x - 4, y + 25, tower_z - 4, tower_x + 4, y + 25, tower_z + 4, BLOCKS["iron"])
    # Interior clear
    writer.fill(tower_x - 2, y + 1, tower_z - 2, tower_x + 2, y + 24, tower_z + 2, BLOCKS["air"])
    writer.fill(tower_x - 2, y + 21, tower_z - 2, tower_x + 2, y + 21, tower_z + 2, BLOCKS["sea_lantern"])

    # === UFO Decoration ===
    writer.comment("=== UFO Display ===")
    ufo_x = a7x - 10
    ufo_z = a7z + 50
    # Saucer shape
    cylinder_fill(writer, ufo_x, y + 8, ufo_z, 8, 2, BLOCKS["iron"])
    cylinder_fill(writer, ufo_x, y + 10, ufo_z, 5, 1, BLOCKS["iron"])
    cylinder_fill(writer, ufo_x, y + 11, ufo_z, 3, 1, BLOCKS["blue_glass"])
    cylinder_fill(writer, ufo_x, y + 12, ufo_z, 2, 1, BLOCKS["iron"])
    # Support pillar
    writer.fill(ufo_x - 1, y, ufo_z - 1, ufo_x + 1, y + 8, ufo_z + 1, BLOCKS["iron"])
    # Lights under saucer
    for angle_deg in range(0, 360, 30):
        rad = math.radians(angle_deg)
        lx = ufo_x + int(7 * math.cos(rad))
        lz = ufo_z + int(7 * math.sin(rad))
        writer.setblock(lx, y + 7, lz, BLOCKS["sea_lantern"])

    # === Security Fencing ===
    writer.comment("Security Fencing")
    for z in range(a7z - 35, a7z + 75, 2):
        writer.setblock(a7x - 55, y + 1, z, BLOCKS["iron_bars"])
        writer.setblock(a7x - 55, y + 2, z, BLOCKS["iron_bars"])
        writer.setblock(a7x + 55, y + 1, z, BLOCKS["iron_bars"])
        writer.setblock(a7x + 55, y + 2, z, BLOCKS["iron_bars"])

    # === Warning Signs & Props ===
    writer.comment("Warning Signs")
    for z in range(a7z - 30, a7z + 70, 20):
        for x_off in [-15, 15]:
            writer.fill(a7x + x_off, y + 1, z, a7x + x_off, y + 3, z, BLOCKS["iron_bars"])
            writer.setblock(a7x + x_off, y + 3, z, BLOCKS["orange_concrete"])

    # Alien artifact props
    writer.comment("Alien Artifacts")
    # Glowing end stone pillar
    writer.fill(a7x, y + 1, a7z + 35, a7x, y + 4, a7z + 35, BLOCKS["end_stone"])
    writer.setblock(a7x, y + 5, a7z + 35, BLOCKS["sea_lantern"])
    # Prismarine monolith
    writer.fill(a7x + 10, y + 1, a7z + 40, a7x + 11, y + 6, a7z + 41, BLOCKS["prismarine"])

    # === Sci-fi Lighting ===
    writer.comment("Sci-fi Lighting")
    for z in range(a7z - 25, a7z + 70, 8):
        for x_off in [-8, 8]:
            writer.fill(a7x + x_off, y + 1, z, a7x + x_off, y + 5, z, BLOCKS["iron_bars"])
            writer.setblock(a7x + x_off, y + 5, z, BLOCKS["sea_lantern"])
            writer.setblock(a7x + x_off, y + 4, z, BLOCKS["purple_concrete"])

    pack.register_writer(writer)
