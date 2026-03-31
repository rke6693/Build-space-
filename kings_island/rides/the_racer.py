"""The Racer - Twin racing wooden coaster.

Real stats:
- Two parallel tracks (originally one forward, one backward - now both forward)
- 88 foot first drop
- 3,415 feet of track each side
- Classic out-and-back layout
"""

from kings_island.mcfunction_writer import McFunctionWriter
from kings_island.coaster_engine import CoasterBuilder
from kings_island.config import BLOCKS, LAYOUT, ORIGIN_Y


def build_the_racer(pack):
    """Build The Racer twin wooden coaster - both sides rideable!"""
    writer = McFunctionWriter("kings_island/rides/the_racer")

    rx, ry, rz = LAYOUT["the_racer_station"]
    y = ORIGIN_Y

    writer.comment("============================================")
    writer.comment("  THE RACER")
    writer.comment("  Twin Racing Wooden Coaster")
    writer.comment("  Both tracks rideable!")
    writer.comment("============================================")

    # Build both tracks with a 10-block separation
    offset = 5  # Half the gap between tracks

    for side, side_name, x_off in [(-1, "Blue (Left)", -offset), (1, "Red (Right)", offset)]:
        writer.comment(f"=== The Racer - {side_name} Track ===")
        coaster = CoasterBuilder(writer, f"The Racer {side_name}", style="wood")

        sx = rx + x_off

        # Station
        coaster.build_station(sx, y, rz, length=18, width=6, direction="z")

        # Classic out-and-back layout
        control_points = [
            # Station exit
            (sx, y + 1, rz + 18),

            # Lift hill - 88 feet
            (sx, y + 10, rz + 28),
            (sx, y + 30, rz + 40),
            (sx, y + 60, rz + 55),
            (sx, y + 88, rz + 70),

            # First drop
            (sx + side * 3, y + 50, rz + 85),
            (sx + side * 5, y + 15, rz + 100),

            # Hill 1
            (sx + side * 5, y + 45, rz + 120),
            (sx + side * 5, y + 10, rz + 140),

            # Hill 2
            (sx + side * 5, y + 35, rz + 160),
            (sx + side * 5, y + 8, rz + 180),

            # Turnaround
            (sx + side * 15, y + 15, rz + 200),
            (sx + side * 25, y + 20, rz + 195),
            (sx + side * 25, y + 15, rz + 180),

            # Return hills
            (sx + side * 20, y + 30, rz + 160),
            (sx + side * 15, y + 8, rz + 140),

            (sx + side * 10, y + 25, rz + 120),
            (sx + side * 5, y + 6, rz + 100),

            (sx + side * 3, y + 20, rz + 80),
            (sx + side * 1, y + 5, rz + 60),

            # Brake run
            (sx, y + 3, rz + 40),
            (sx, y + 2, rz + 30),
            (sx, y + 1, rz + 18),
        ]

        chain_lift_segments = {1, 2, 3, 4}
        brake_segments = {20, 21, 22}

        coaster.build_track(
            control_points,
            ground_y=y,
            chain_lift_segments=chain_lift_segments,
            brake_segments=brake_segments,
            spline_resolution=6
        )

    # The Racer station building (shared structure)
    writer.comment("=== The Racer Station Building ===")
    writer.fill(rx - 15, y, rz - 5, rx + 15, y, rz + 20, BLOCKS["path_main"])
    writer.fill(rx - 15, y + 1, rz - 5, rx - 15, y + 8, rz + 20, BLOCKS["white_concrete"])
    writer.fill(rx + 15, y + 1, rz - 5, rx + 15, y + 8, rz + 20, BLOCKS["white_concrete"])
    writer.fill(rx - 15, y + 1, rz - 5, rx + 15, y + 8, rz - 5, BLOCKS["white_concrete"])
    writer.fill(rx - 15, y + 9, rz - 6, rx + 15, y + 9, rz + 21, BLOCKS["roof_red"])

    # Clear interior
    writer.fill(rx - 14, y + 1, rz - 4, rx + 14, y + 8, rz + 19, BLOCKS["air"])

    # Race finish line
    writer.comment("Finish Line")
    for x in range(rx - 12, rx + 13):
        if (x + rz) % 2 == 0:
            writer.setblock(x, y + 1, rz + 18, BLOCKS["white_concrete"])
        else:
            writer.setblock(x, y + 1, rz + 18, BLOCKS["black_concrete"])

    pack.register_writer(writer)
