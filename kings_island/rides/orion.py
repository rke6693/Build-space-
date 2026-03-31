"""Orion - Giga coaster in Area 72.

Real stats:
- 300 foot first drop
- 5,321 feet of track
- Top speed 91 mph
- B&M hyper/giga style with airtime hills
"""

from kings_island.mcfunction_writer import McFunctionWriter
from kings_island.coaster_engine import CoasterBuilder
from kings_island.config import BLOCKS, LAYOUT, ORIGIN_Y


def build_orion(pack):
    """Build Orion giga coaster - rideable!"""
    writer = McFunctionWriter("kings_island/rides/orion")

    ox, oy, oz = LAYOUT["orion_station"]
    y = ORIGIN_Y

    writer.comment("============================================")
    writer.comment("  ORION")
    writer.comment("  Giga Coaster - 300ft Drop")
    writer.comment("  Rideable minecart coaster!")
    writer.comment("============================================")

    coaster = CoasterBuilder(writer, "Orion", style="steel")

    # Station
    coaster.build_station(ox, y, oz, length=25, width=10, direction="z")

    # Orion layout - massive first drop, speed hills, wide turns
    # Height compressed to 250 blocks to fit build limit
    control_points = [
        # Station exit
        (ox, y + 1, oz + 25),

        # Chain lift - 250 block climb
        (ox, y + 10, oz + 35),
        (ox, y + 50, oz + 50),
        (ox, y + 100, oz + 70),
        (ox, y + 150, oz + 90),
        (ox, y + 200, oz + 110),
        (ox, y + 250, oz + 130),

        # MASSIVE first drop - 250 blocks down
        (ox + 10, y + 200, oz + 150),
        (ox + 15, y + 120, oz + 170),
        (ox + 20, y + 50, oz + 190),
        (ox + 25, y + 10, oz + 210),

        # Speed hill 1 (airtime!)
        (ox + 30, y + 60, oz + 240),
        (ox + 35, y + 10, oz + 270),

        # Wide sweeping left turn
        (ox + 50, y + 15, oz + 300),
        (ox + 80, y + 20, oz + 310),
        (ox + 100, y + 15, oz + 300),

        # Speed hill 2
        (ox + 110, y + 50, oz + 280),
        (ox + 115, y + 10, oz + 260),

        # Turnaround
        (ox + 120, y + 20, oz + 230),
        (ox + 110, y + 25, oz + 200),
        (ox + 90, y + 15, oz + 190),

        # Speed hill 3
        (ox + 70, y + 40, oz + 180),
        (ox + 50, y + 10, oz + 160),

        # Final curve back to station
        (ox + 30, y + 15, oz + 140),
        (ox + 15, y + 10, oz + 120),
        (ox + 5, y + 5, oz + 80),

        # Brake run
        (ox, y + 3, oz + 60),
        (ox, y + 2, oz + 40),
        (ox, y + 1, oz + 25),
    ]

    # Chain lift segments
    chain_lift_segments = {1, 2, 3, 4, 5, 6}
    # Brake run at end
    brake_segments = {26, 27, 28}

    coaster.build_track(
        control_points,
        ground_y=y,
        chain_lift_segments=chain_lift_segments,
        brake_segments=brake_segments,
        spline_resolution=8
    )

    # Orion themed entrance arch
    writer.comment("=== Orion Entrance ===")
    writer.fill(ox - 8, y + 1, oz - 5, ox - 6, y + 10, oz - 3, BLOCKS["purple_concrete"])
    writer.fill(ox + 6, y + 1, oz - 5, ox + 8, y + 10, oz - 3, BLOCKS["purple_concrete"])
    writer.fill(ox - 8, y + 8, oz - 5, ox + 8, y + 10, oz - 3, BLOCKS["purple_concrete"])
    # Glowing accents
    writer.fill(ox - 5, y + 9, oz - 6, ox + 5, y + 9, oz - 6, BLOCKS["sea_lantern"])

    pack.register_writer(writer)
