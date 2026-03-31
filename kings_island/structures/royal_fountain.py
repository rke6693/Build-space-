"""Royal Fountain - the iconic centerpiece fountain at the end of International Street."""

import math
from kings_island.mcfunction_writer import McFunctionWriter
from kings_island.config import BLOCKS, LAYOUT, ORIGIN_Y


def build_royal_fountain(pack):
    """Build the Royal Fountain with water jets and lighting."""
    writer = McFunctionWriter("kings_island/structures/royal_fountain")

    fx, fy, fz = LAYOUT["royal_fountain"]
    y = ORIGIN_Y

    writer.comment("============================================")
    writer.comment("  ROYAL FOUNTAIN")
    writer.comment("  Centerpiece of Kings Island")
    writer.comment("============================================")

    # Outer basin ring (decorative stone border)
    writer.comment("Outer Basin Ring")
    for angle in range(360):
        rad = math.radians(angle)
        for r in [13, 14]:
            bx = fx + int(r * math.cos(rad))
            bz = fz + int(r * math.sin(rad))
            writer.setblock(bx, y, bz, BLOCKS["path_accent"])
            writer.setblock(bx, y + 1, bz, BLOCKS["path_accent"])

    # Basin floor
    writer.comment("Basin Floor")
    for x in range(fx - 12, fx + 13):
        for z in range(fz - 12, fz + 13):
            dist = math.sqrt((x - fx) ** 2 + (z - fz) ** 2)
            if dist <= 12:
                writer.setblock(x, y - 1, z, BLOCKS["sea_lantern"])

    # Water (already placed by terrain, but reinforce)
    writer.comment("Fountain Water")
    for x in range(fx - 12, fx + 13):
        for z in range(fz - 12, fz + 13):
            dist = math.sqrt((x - fx) ** 2 + (z - fz) ** 2)
            if dist <= 11:
                writer.setblock(x, y, z, BLOCKS["water"])

    # Central fountain column
    writer.comment("Central Fountain Column")
    writer.fill(fx - 1, y, fz - 1, fx + 1, y + 8, fz + 1, BLOCKS["prismarine"])
    writer.fill(fx, y, fz, fx, y + 12, fz, BLOCKS["sea_lantern"])

    # Tiered fountain bowls
    writer.comment("Fountain Tiers")
    # First tier (lower, larger)
    for angle in range(360):
        rad = math.radians(angle)
        for r in range(3, 6):
            bx = fx + int(r * math.cos(rad))
            bz = fz + int(r * math.sin(rad))
            writer.setblock(bx, y + 4, bz, BLOCKS["prismarine"])
            if r < 5:
                writer.setblock(bx, y + 5, bz, BLOCKS["water"])

    # Second tier (higher, smaller)
    for angle in range(360):
        rad = math.radians(angle)
        for r in range(1, 4):
            bx = fx + int(r * math.cos(rad))
            bz = fz + int(r * math.sin(rad))
            writer.setblock(bx, y + 8, bz, BLOCKS["prismarine"])
            if r < 3:
                writer.setblock(bx, y + 9, bz, BLOCKS["water"])

    # Water jet columns (tall water pillars simulated with glass/ice)
    writer.comment("Water Jets")
    # Central jet
    for jet_y in range(y + 10, y + 25):
        writer.setblock(fx, jet_y, fz, BLOCKS["blue_glass"])

    # Ring of jets
    for angle_deg in range(0, 360, 45):
        rad = math.radians(angle_deg)
        jx = fx + int(8 * math.cos(rad))
        jz = fz + int(8 * math.sin(rad))
        jet_height = 15
        for jet_y in range(y + 1, y + jet_height):
            writer.setblock(jx, jet_y, jz, BLOCKS["blue_glass"])

    # Inner ring of shorter jets
    for angle_deg in range(22, 360, 45):
        rad = math.radians(angle_deg)
        jx = fx + int(5 * math.cos(rad))
        jz = fz + int(5 * math.sin(rad))
        for jet_y in range(y + 1, y + 10):
            writer.setblock(jx, jet_y, jz, BLOCKS["blue_glass"])

    # Underwater lights (sea lanterns in the basin)
    writer.comment("Underwater Lighting")
    for angle_deg in range(0, 360, 30):
        rad = math.radians(angle_deg)
        for r in [4, 8, 11]:
            lx = fx + int(r * math.cos(rad))
            lz = fz + int(r * math.sin(rad))
            writer.setblock(lx, y - 1, lz, BLOCKS["sea_lantern"])

    # Decorative posts around the fountain
    writer.comment("Decorative Posts")
    for angle_deg in range(0, 360, 30):
        rad = math.radians(angle_deg)
        px = fx + int(15 * math.cos(rad))
        pz = fz + int(15 * math.sin(rad))
        writer.fill(px, y, pz, px, y + 3, pz, BLOCKS["path_accent"])
        writer.setblock(px, y + 3, pz, BLOCKS["lantern"])

    pack.register_writer(writer)
