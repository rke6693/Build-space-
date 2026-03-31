"""Diamondback - Steel hyper coaster with splashdown.

Real stats:
- 230 foot first drop
- 5,282 feet of track
- Top speed 80 mph
- Famous splashdown finale
"""

from kings_island.mcfunction_writer import McFunctionWriter
from kings_island.coaster_engine import CoasterBuilder
from kings_island.config import BLOCKS, LAYOUT, ORIGIN_Y


def build_diamondback(pack):
    """Build Diamondback steel coaster - rideable with splashdown!"""
    writer = McFunctionWriter("kings_island/rides/diamondback")

    dx, dy, dz = LAYOUT["diamondback_station"]
    y = ORIGIN_Y

    writer.comment("============================================")
    writer.comment("  DIAMONDBACK")
    writer.comment("  Steel Hyper Coaster with Splashdown")
    writer.comment("  Rideable minecart coaster!")
    writer.comment("============================================")

    coaster = CoasterBuilder(writer, "Diamondback", style="steel")

    # Station
    coaster.build_station(dx, y, dz, length=22, width=10, direction="z")

    # Diamondback layout - out-and-back with airtime hills and splashdown
    control_points = [
        # Station exit
        (dx, y + 1, dz + 22),

        # Chain lift - 200 blocks
        (dx, y + 10, dz + 35),
        (dx, y + 50, dz + 50),
        (dx, y + 100, dz + 65),
        (dx, y + 150, dz + 80),
        (dx, y + 200, dz + 95),

        # First drop - 200 blocks
        (dx + 5, y + 150, dz + 110),
        (dx + 10, y + 80, dz + 125),
        (dx + 15, y + 20, dz + 140),
        (dx + 18, y + 5, dz + 155),

        # Airtime hill 1
        (dx + 20, y + 80, dz + 180),
        (dx + 22, y + 5, dz + 205),

        # Airtime hill 2
        (dx + 25, y + 60, dz + 230),
        (dx + 28, y + 5, dz + 255),

        # Turnaround
        (dx + 35, y + 10, dz + 275),
        (dx + 50, y + 15, dz + 280),
        (dx + 60, y + 10, dz + 270),

        # Return hills
        (dx + 55, y + 45, dz + 250),
        (dx + 50, y + 5, dz + 230),

        (dx + 45, y + 35, dz + 210),
        (dx + 40, y + 5, dz + 190),

        # Final turn toward splashdown
        (dx + 35, y + 15, dz + 170),
        (dx + 25, y + 10, dz + 150),
        (dx + 15, y + 5, dz + 130),

        # Splashdown approach (low over water)
        (dx + 30, y + 3, dz + 120),
        (dx + 30, y + 2, dz + 110),

        # Brake run
        (dx + 25, y + 2, dz + 90),
        (dx + 15, y + 2, dz + 70),
        (dx + 5, y + 1, dz + 50),
        (dx, y + 1, dz + 22),
    ]

    chain_lift_segments = {1, 2, 3, 4, 5}
    brake_segments = {26, 27, 28, 29}

    coaster.build_track(
        control_points,
        ground_y=y,
        chain_lift_segments=chain_lift_segments,
        brake_segments=brake_segments,
        spline_resolution=7
    )

    # Splashdown pool
    writer.comment("=== Diamondback Splashdown Pool ===")
    splash_x = dx + 30
    splash_z = dz + 115
    for sx in range(splash_x - 8, splash_x + 9):
        for sz in range(splash_z - 5, splash_z + 6):
            import math
            dist = math.sqrt((sx - splash_x) ** 2 + (sz - splash_z) ** 2)
            if dist <= 8:
                writer.setblock(sx, y - 1, sz, BLOCKS["prismarine"])
                writer.setblock(sx, y, sz, BLOCKS["water"])

    # Diamondback themed entrance - snake motif
    writer.comment("=== Diamondback Entrance ===")
    writer.fill(dx - 6, y + 1, dz - 5, dx - 4, y + 8, dz - 3, BLOCKS["brown_concrete"])
    writer.fill(dx + 4, y + 1, dz - 5, dx + 6, y + 8, dz - 3, BLOCKS["brown_concrete"])
    writer.fill(dx - 6, y + 6, dz - 5, dx + 6, y + 8, dz - 3, BLOCKS["yellow_concrete"])

    pack.register_writer(writer)
