"""The Beast - World's longest wooden roller coaster.

Real stats:
- 7,359 feet of track (compressed to ~1800 blocks for playability)
- 135 foot first drop
- Two lift hills
- Runs through heavily wooded terrain and ravines
- Top speed 65 mph
"""

from kings_island.mcfunction_writer import McFunctionWriter
from kings_island.coaster_engine import CoasterBuilder
from kings_island.config import BLOCKS, LAYOUT, ORIGIN_Y


def build_the_beast(pack):
    """Build The Beast wooden roller coaster - rideable!"""
    writer = McFunctionWriter("kings_island/rides/beast")

    bx, by, bz = LAYOUT["the_beast_station"]
    y = ORIGIN_Y

    writer.comment("============================================")
    writer.comment("  THE BEAST")
    writer.comment("  World's Longest Wooden Roller Coaster")
    writer.comment("  Rideable minecart coaster!")
    writer.comment("============================================")

    coaster = CoasterBuilder(writer, "The Beast", style="wood")

    # Station
    coaster.build_station(bx, y, bz, length=25, width=10, direction="z")

    # Control points defining The Beast's layout
    # The Beast is famous for its two lift hills, long runs through woods,
    # and the legendary helix tunnel at the end
    control_points = [
        # Station exit
        (bx, y + 1, bz + 25),

        # First lift hill - 135 feet
        (bx, y + 5, bz + 40),
        (bx, y + 30, bz + 60),
        (bx, y + 60, bz + 80),
        (bx, y + 100, bz + 110),
        (bx, y + 135, bz + 140),

        # First drop - plunging down into the ravine
        (bx + 10, y + 80, bz + 170),
        (bx + 20, y + 30, bz + 200),
        (bx + 25, y + 10, bz + 230),

        # High-speed run through the woods
        (bx + 40, y + 15, bz + 260),
        (bx + 60, y + 20, bz + 280),
        (bx + 80, y + 10, bz + 290),
        (bx + 100, y + 15, bz + 280),

        # Turnaround
        (bx + 120, y + 20, bz + 260),
        (bx + 130, y + 25, bz + 230),
        (bx + 120, y + 15, bz + 200),

        # Speed hills
        (bx + 100, y + 25, bz + 180),
        (bx + 80, y + 10, bz + 160),
        (bx + 60, y + 20, bz + 140),
        (bx + 40, y + 8, bz + 120),

        # Second lift hill (shorter - 110 feet)
        (bx + 30, y + 20, bz + 100),
        (bx + 25, y + 50, bz + 80),
        (bx + 20, y + 80, bz + 60),
        (bx + 15, y + 110, bz + 40),

        # Second drop into the helix
        (bx + 10, y + 60, bz + 60),
        (bx, y + 30, bz + 80),
        (bx - 10, y + 15, bz + 100),

        # THE LEGENDARY HELIX TUNNEL
        # Banked descending spiral
        (bx - 20, y + 12, bz + 110),
        (bx - 30, y + 10, bz + 100),
        (bx - 35, y + 8, bz + 85),
        (bx - 30, y + 6, bz + 70),
        (bx - 20, y + 4, bz + 65),
        (bx - 10, y + 3, bz + 70),
        (bx - 5, y + 2, bz + 85),

        # Final brake run back to station
        (bx - 5, y + 2, bz + 60),
        (bx, y + 1, bz + 40),
        (bx, y + 1, bz + 25),
    ]

    # First lift hill is segments 1-4, second is segments 19-22
    chain_lift_segments = {1, 2, 3, 4, 19, 20, 21, 22}
    # Brake run at the end
    brake_segments = {33, 34, 35}

    coaster.build_track(
        control_points,
        ground_y=y,
        chain_lift_segments=chain_lift_segments,
        brake_segments=brake_segments,
        spline_resolution=6
    )

    # Helix tunnel structure
    writer.comment("=== Beast Helix Tunnel ===")
    _build_helix_tunnel(writer, bx - 20, y, bz + 85)

    pack.register_writer(writer)


def _build_helix_tunnel(writer, cx, y, cz):
    """Build the iconic helix tunnel at the end of The Beast."""
    import math

    # Tunnel enclosure around the helix
    for angle in range(0, 360, 5):
        rad = math.radians(angle)
        for r in range(18, 22):
            tx = cx + int(r * math.cos(rad))
            tz = cz + int(r * math.sin(rad))
            # Tunnel walls
            writer.fill(tx, y, tz, tx, y + 8, tz, BLOCKS["dark_oak_log"])

    # Tunnel roof
    for angle in range(0, 360, 3):
        rad = math.radians(angle)
        for r in range(0, 22):
            tx = cx + int(r * math.cos(rad))
            tz = cz + int(r * math.sin(rad))
            writer.setblock(tx, y + 8, tz, BLOCKS["dark_oak_planks"])

    # Dim lighting inside
    for angle_deg in range(0, 360, 60):
        rad = math.radians(angle_deg)
        lx = cx + int(15 * math.cos(rad))
        lz = cz + int(15 * math.sin(rad))
        writer.setblock(lx, y + 6, lz, BLOCKS["soul_torch"])
