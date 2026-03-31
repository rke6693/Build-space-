"""Action Zone - Extreme thrill rides area.

Home to Banshee, Drop Tower, Delirium, and other thrill rides.
Industrial/urban theming.
"""

from kings_island.mcfunction_writer import McFunctionWriter
from kings_island.config import BLOCKS, LAYOUT, ORIGIN_Y
from kings_island.geometry import building_shell


def build_action_zone(pack):
    """Build Action Zone themed area."""
    writer = McFunctionWriter("kings_island/areas/action_zone")

    ax, ay, az = LAYOUT["action_zone"]
    y = ORIGIN_Y

    writer.comment("============================================")
    writer.comment("  ACTION ZONE")
    writer.comment("  Extreme Thrill Rides")
    writer.comment("============================================")

    # Area ground
    writer.comment("Action Zone Ground")
    writer.fill(ax - 80, y, az - 40, ax + 60, y, az + 60, BLOCKS["grass"])
    # Concrete paths (industrial feel)
    writer.fill(ax - 6, y, az - 40, ax + 6, y, az + 60, BLOCKS["plaza_gray"])

    # === Industrial Theming ===
    writer.comment("=== Industrial Theming ===")

    # Concrete walls / barriers
    for z_off in range(-30, 50, 20):
        # Left side wall segments
        writer.fill(ax - 25, y + 1, az + z_off, ax - 22, y + 3, az + z_off + 8,
                   BLOCKS["gray_concrete"])
        # Graffiti-like colored accents
        writer.setblock(ax - 25, y + 2, az + z_off + 2, BLOCKS["red_concrete"])
        writer.setblock(ax - 25, y + 2, az + z_off + 4, BLOCKS["blue_concrete"])
        writer.setblock(ax - 25, y + 2, az + z_off + 6, BLOCKS["yellow_concrete"])

    # Chain link fencing around rides
    for x in range(ax - 60, ax + 50, 2):
        writer.setblock(x, y + 1, az - 35, BLOCKS["iron_bars"])
        writer.setblock(x, y + 2, az - 35, BLOCKS["iron_bars"])

    # === Food / Shops ===
    writer.comment("=== Action Zone Shops ===")

    # Xtreme Eats
    building_shell(writer, ax + 15, y, az - 15, 20, 15, 8,
                   BLOCKS["black_concrete"], BLOCKS["gray_concrete"], BLOCKS["gray_concrete"])
    # Neon-style accents
    writer.fill(ax + 15, y + 4, az - 16, ax + 35, y + 4, az - 16, BLOCKS["orange_concrete"])
    writer.fill(ax + 15, y + 5, az - 16, ax + 35, y + 5, az - 16, BLOCKS["yellow_concrete"])
    # Door
    writer.fill(ax + 24, y + 1, az - 15, ax + 26, y + 3, az - 15, BLOCKS["air"])

    # Merchandise shop
    building_shell(writer, ax + 15, y, az + 10, 18, 14, 7,
                   BLOCKS["gray_concrete"], BLOCKS["gray_concrete"], BLOCKS["black_concrete"])
    writer.fill(ax + 22, y + 1, az + 10, ax + 24, y + 3, az + 10, BLOCKS["air"])

    # === Warning Signs (red/yellow markers) ===
    writer.comment("Warning Markers")
    for z in range(az - 25, az + 50, 15):
        writer.fill(ax - 8, y + 1, z, ax - 8, y + 4, z, BLOCKS["iron_bars"])
        writer.setblock(ax - 8, y + 4, z, BLOCKS["yellow_concrete"])
        writer.setblock(ax - 8, y + 3, z, BLOCKS["black_concrete"])

    # === Spectator viewing areas ===
    writer.comment("Viewing Areas")
    # Elevated platform to watch Banshee
    writer.fill(ax - 50, y, az + 40, ax - 35, y, az + 50, BLOCKS["path_main"])
    writer.fill(ax - 50, y + 1, az + 40, ax - 50, y + 3, az + 50, BLOCKS["gray_concrete"])
    writer.fill(ax - 35, y + 1, az + 40, ax - 35, y + 3, az + 50, BLOCKS["gray_concrete"])
    # Railing
    writer.fill(ax - 50, y + 1, az + 40, ax - 35, y + 1, az + 40, BLOCKS["iron_bars"])

    # === Industrial Lighting ===
    writer.comment("Industrial Lighting")
    for z in range(az - 25, az + 50, 10):
        for x_off in [-10, 10]:
            writer.fill(ax + x_off, y + 1, z, ax + x_off, y + 6, z, BLOCKS["iron_bars"])
            writer.setblock(ax + x_off, y + 7, z, BLOCKS["redstone_lamp"])

    pack.register_writer(writer)
