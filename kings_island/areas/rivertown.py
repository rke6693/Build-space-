"""Rivertown - Rustic frontier-themed area.

Home to The Beast, Diamondback, and Mystic Timbers.
Features log cabin architecture, covered bridges, and woodsy atmosphere.
"""

from kings_island.mcfunction_writer import McFunctionWriter
from kings_island.config import BLOCKS, LAYOUT, ORIGIN_Y
from kings_island.geometry import building_shell, peaked_roof, tree, fence_line


def build_rivertown(pack):
    """Build Rivertown themed area."""
    writer = McFunctionWriter("kings_island/areas/rivertown")

    rx, ry, rz = LAYOUT["rivertown"]
    y = ORIGIN_Y

    writer.comment("============================================")
    writer.comment("  RIVERTOWN")
    writer.comment("  Rustic Frontier Area")
    writer.comment("============================================")

    # === Area ground ===
    writer.comment("Rivertown Ground")
    writer.fill(rx - 60, y, rz - 30, rx + 80, y, rz + 60, BLOCKS["grass"])
    # Dirt paths
    writer.fill(rx - 6, y, rz - 30, rx + 6, y, rz + 60, BLOCKS["cobble"])

    # === Log Cabin Buildings ===
    writer.comment("=== Log Cabin Shops ===")

    buildings = [
        ("General Store", rx - 30, rz - 20, 18, 14, 8),
        ("Tom & Chee", rx - 30, rz + 5, 15, 12, 7),
        ("LaRosa's", rx - 30, rz + 22, 16, 13, 8),
        ("Rivertown Trading Post", rx + 20, rz - 20, 20, 15, 9),
        ("Grain & Grill", rx + 20, rz + 5, 18, 14, 8),
        ("Smokehouse", rx + 20, rz + 25, 14, 12, 7),
    ]

    for name, bx, bz, w, d, h in buildings:
        writer.comment(f"  {name}")
        # Log cabin walls
        building_shell(writer, bx, y, bz, w, d, h,
                      BLOCKS["spruce_log"], BLOCKS["spruce_planks"], BLOCKS["dark_oak_planks"])
        # Peaked roof
        peaked_roof(writer, bx - 1, bz - 1, bx + w + 1, bz + d + 1, y + h, 4, BLOCKS["roof_brown"])
        # Door
        writer.fill(bx + w // 2, y + 1, bz, bx + w // 2 + 1, y + 3, bz, BLOCKS["air"])
        # Windows
        for wx in range(bx + 3, bx + w - 2, 4):
            writer.fill(wx, y + 2, bz, wx + 1, y + 3, bz, BLOCKS["glass"])
            writer.fill(wx, y + 2, bz + d, wx + 1, y + 3, bz + d, BLOCKS["glass"])
        # Porch overhang
        writer.fill(bx, y + h - 1, bz - 2, bx + w, y + h - 1, bz - 1, BLOCKS["spruce_planks"])
        # Interior light
        writer.setblock(bx + w // 2, y + h - 1, bz + d // 2, BLOCKS["lantern"])

    # === Covered Bridge ===
    writer.comment("=== Covered Bridge ===")
    bridge_z = rz + 45
    # Bridge structure over the stream
    writer.fill(rx - 40, y, bridge_z - 2, rx - 25, y, bridge_z + 2, BLOCKS["spruce_planks"])
    writer.fill(rx - 40, y + 1, bridge_z - 2, rx - 40, y + 5, bridge_z + 2, BLOCKS["spruce_log"])
    writer.fill(rx - 25, y + 1, bridge_z - 2, rx - 25, y + 5, bridge_z + 2, BLOCKS["spruce_log"])
    writer.fill(rx - 40, y + 1, bridge_z - 2, rx - 25, y + 5, bridge_z - 2, BLOCKS["spruce_planks"])
    writer.fill(rx - 40, y + 1, bridge_z + 2, rx - 25, y + 5, bridge_z + 2, BLOCKS["spruce_planks"])
    writer.fill(rx - 40, y + 5, bridge_z - 3, rx - 25, y + 5, bridge_z + 3, BLOCKS["roof_brown"])

    # === Barrel Props ===
    writer.comment("Barrel Props")
    import random
    rng = random.Random(111)
    for _ in range(15):
        bx_r = rx + rng.randint(-25, 25)
        bz_r = rz + rng.randint(-15, 50)
        writer.setblock(bx_r, y + 1, bz_r, BLOCKS["barrel"])

    # === Hay Bales ===
    writer.comment("Hay Bales")
    for _ in range(10):
        hx = rx + rng.randint(-20, 20)
        hz = rz + rng.randint(-10, 40)
        writer.setblock(hx, y + 1, hz, BLOCKS["hay"])

    # === Fence lines ===
    writer.comment("Fences")
    fence_line(writer, rx - 50, rz - 25, rx - 50, rz + 55, y + 1, BLOCKS["wood_coaster"])
    fence_line(writer, rx + 70, rz - 25, rx + 70, rz + 55, y + 1, BLOCKS["wood_coaster"])

    # === Rustic lampposts ===
    writer.comment("Rustic Lampposts")
    for z in range(rz - 20, rz + 50, 15):
        for x_off in [-8, 8]:
            writer.fill(rx + x_off, y + 1, z, rx + x_off, y + 3, z, BLOCKS["spruce_log"])
            writer.setblock(rx + x_off, y + 4, z, BLOCKS["lantern"])

    pack.register_writer(writer)
