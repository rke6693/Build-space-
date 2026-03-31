"""Banshee - World's longest inverted roller coaster.

Real stats:
- 4,124 feet of track
- 167 foot first drop
- Top speed 68 mph
- 7 inversions
- Since Bedrock has no inverted minecarts, this is a decorative track
  with a regular rail ride alongside it.
"""

import math
from kings_island.mcfunction_writer import McFunctionWriter
from kings_island.coaster_engine import CoasterBuilder
from kings_island.config import BLOCKS, LAYOUT, ORIGIN_Y


def build_banshee(pack):
    """Build Banshee inverted coaster - decorative track + rideable companion rail."""
    writer = McFunctionWriter("kings_island/rides/banshee")

    bx, by, bz = LAYOUT["banshee_station"]
    y = ORIGIN_Y

    writer.comment("============================================")
    writer.comment("  BANSHEE")
    writer.comment("  World's Longest Inverted Coaster")
    writer.comment("  Decorative inverted track + rideable rail")
    writer.comment("============================================")

    # Build the rideable companion track slightly offset
    coaster = CoasterBuilder(writer, "Banshee", style="steel")
    coaster.build_station(bx, y, bz, length=22, width=10, direction="x")

    control_points = [
        # Station exit
        (bx + 22, y + 1, bz),

        # Lift hill - 167 feet
        (bx + 35, y + 10, bz),
        (bx + 50, y + 40, bz),
        (bx + 65, y + 80, bz),
        (bx + 80, y + 120, bz),
        (bx + 95, y + 167, bz),

        # First drop - diving down
        (bx + 110, y + 120, bz + 5),
        (bx + 120, y + 60, bz + 10),
        (bx + 130, y + 20, bz + 15),

        # Dive loop (inversion simulated as a low swoop)
        (bx + 140, y + 40, bz + 25),
        (bx + 145, y + 60, bz + 35),
        (bx + 140, y + 40, bz + 45),
        (bx + 130, y + 20, bz + 50),

        # Zero-g roll (corkscrew)
        (bx + 115, y + 30, bz + 55),
        (bx + 100, y + 25, bz + 50),

        # Batwing element
        (bx + 85, y + 40, bz + 40),
        (bx + 75, y + 50, bz + 30),
        (bx + 70, y + 40, bz + 20),
        (bx + 75, y + 25, bz + 10),

        # Outside loop
        (bx + 85, y + 35, bz),
        (bx + 95, y + 20, bz - 10),

        # Spiral
        (bx + 90, y + 30, bz - 25),
        (bx + 75, y + 25, bz - 30),
        (bx + 60, y + 15, bz - 25),

        # Inline twist
        (bx + 50, y + 20, bz - 15),
        (bx + 40, y + 10, bz - 10),

        # Brake run
        (bx + 35, y + 5, bz - 5),
        (bx + 25, y + 2, bz),
        (bx + 22, y + 1, bz),
    ]

    chain_lift_segments = {1, 2, 3, 4, 5}
    brake_segments = {26, 27, 28}

    track_points = coaster.build_track(
        control_points,
        ground_y=y,
        chain_lift_segments=chain_lift_segments,
        brake_segments=brake_segments,
        spline_resolution=6
    )

    # Build decorative inverted track above the ride track
    writer.comment("=== Decorative Inverted Track ===")
    if track_points:
        for i, (tx, ty, tz) in enumerate(track_points):
            if i % 2 == 0:
                # Overhead rail structure (cyan concrete representing the inverted track)
                writer.setblock(tx, ty + 6, tz, BLOCKS["cyan_concrete"])
                writer.setblock(tx - 1, ty + 6, tz, BLOCKS["cyan_concrete"])
                writer.setblock(tx + 1, ty + 6, tz, BLOCKS["cyan_concrete"])
                # Vertical hangers
                writer.setblock(tx, ty + 5, tz, BLOCKS["iron_bars"])
                writer.setblock(tx, ty + 4, tz, BLOCKS["iron_bars"])

    # Banshee entrance - gothic/spooky theme
    writer.comment("=== Banshee Entrance ===")
    # Gothic archway
    writer.fill(bx - 5, y + 1, bz - 8, bx - 3, y + 12, bz - 6, BLOCKS["gray_concrete"])
    writer.fill(bx + 3, y + 1, bz - 8, bx + 5, y + 12, bz - 6, BLOCKS["gray_concrete"])
    writer.fill(bx - 5, y + 10, bz - 8, bx + 5, y + 12, bz - 6, BLOCKS["gray_concrete"])
    # Pointed arch
    writer.fill(bx - 2, y + 12, bz - 8, bx + 2, y + 12, bz - 6, BLOCKS["gray_concrete"])
    writer.fill(bx - 1, y + 13, bz - 8, bx + 1, y + 13, bz - 6, BLOCKS["gray_concrete"])
    writer.setblock(bx, y + 14, bz - 7, BLOCKS["gray_concrete"])
    # Spooky lighting
    writer.setblock(bx - 4, y + 8, bz - 9, BLOCKS["soul_torch"])
    writer.setblock(bx + 4, y + 8, bz - 9, BLOCKS["soul_torch"])
    # Fog effect area (cobwebs to simulate)
    for fx in range(bx - 3, bx + 4, 2):
        writer.setblock(fx, y + 1, bz - 9, "minecraft:cobweb")

    pack.register_writer(writer)
