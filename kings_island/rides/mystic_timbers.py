"""Mystic Timbers - GCI wooden coaster through the woods.

Real stats:
- 3,265 feet of track
- 109 foot first drop
- Top speed 53 mph
- Themed to a haunted lumber mill
- Famous "What's in the shed?" ending
"""

from kings_island.mcfunction_writer import McFunctionWriter
from kings_island.coaster_engine import CoasterBuilder
from kings_island.config import BLOCKS, LAYOUT, ORIGIN_Y
from kings_island.geometry import tree


def build_mystic_timbers(pack):
    """Build Mystic Timbers wooden coaster - rideable!"""
    writer = McFunctionWriter("kings_island/rides/mystic_timbers")

    mx, my, mz = LAYOUT["mystic_timbers_station"]
    y = ORIGIN_Y

    writer.comment("============================================")
    writer.comment("  MYSTIC TIMBERS")
    writer.comment("  GCI Wooden Coaster")
    writer.comment("  'What's in the shed?'")
    writer.comment("  Rideable minecart coaster!")
    writer.comment("============================================")

    coaster = CoasterBuilder(writer, "Mystic Timbers", style="wood")

    # Station (themed as a lumber mill)
    coaster.build_station(mx, y, mz, length=20, width=10, direction="z")

    # Mystic Timbers - compact twisting layout through forest
    control_points = [
        # Station exit
        (mx, y + 1, mz + 20),

        # Lift hill - 109 feet
        (mx, y + 10, mz + 30),
        (mx, y + 30, mz + 40),
        (mx, y + 60, mz + 55),
        (mx, y + 90, mz + 70),
        (mx, y + 109, mz + 85),

        # First drop
        (mx + 5, y + 70, mz + 100),
        (mx + 10, y + 30, mz + 115),
        (mx + 15, y + 10, mz + 130),

        # Speed hill
        (mx + 20, y + 50, mz + 150),
        (mx + 25, y + 15, mz + 170),

        # S-curve through trees
        (mx + 35, y + 20, mz + 185),
        (mx + 45, y + 25, mz + 190),
        (mx + 55, y + 15, mz + 180),

        # Double down
        (mx + 60, y + 30, mz + 165),
        (mx + 55, y + 10, mz + 150),

        # Twisted turnaround
        (mx + 45, y + 20, mz + 135),
        (mx + 35, y + 15, mz + 125),
        (mx + 25, y + 25, mz + 120),

        # Return run with bunny hops
        (mx + 20, y + 35, mz + 110),
        (mx + 15, y + 10, mz + 95),
        (mx + 10, y + 25, mz + 80),
        (mx + 5, y + 8, mz + 65),

        # Final turn into "The Shed"
        (mx - 5, y + 12, mz + 50),
        (mx - 10, y + 5, mz + 40),

        # Brake run into the shed
        (mx - 5, y + 2, mz + 30),
        (mx, y + 1, mz + 20),
    ]

    chain_lift_segments = {1, 2, 3, 4, 5}
    brake_segments = {25, 26}

    coaster.build_track(
        control_points,
        ground_y=y,
        chain_lift_segments=chain_lift_segments,
        brake_segments=brake_segments,
        spline_resolution=6
    )

    # "The Shed" - iconic ending building
    writer.comment("=== The Shed ===")
    shed_x, shed_z = mx - 12, mz + 25
    writer.fill(shed_x, y, shed_z, shed_x + 15, y, shed_z + 15, BLOCKS["spruce_planks"])
    writer.fill(shed_x, y + 1, shed_z, shed_x, y + 8, shed_z + 15, BLOCKS["spruce_log"])
    writer.fill(shed_x + 15, y + 1, shed_z, shed_x + 15, y + 8, shed_z + 15, BLOCKS["spruce_log"])
    writer.fill(shed_x, y + 1, shed_z, shed_x + 15, y + 8, shed_z, BLOCKS["spruce_log"])
    writer.fill(shed_x, y + 1, shed_z + 15, shed_x + 15, y + 8, shed_z + 15, BLOCKS["spruce_log"])
    # Clear interior
    writer.fill(shed_x + 1, y + 1, shed_z + 1, shed_x + 14, y + 7, shed_z + 14, BLOCKS["air"])
    # Peaked roof
    for dy in range(5):
        shrink = dy
        writer.fill(shed_x - 1 + shrink, y + 8 + dy, shed_z - 1,
                   shed_x + 16 - shrink, y + 8 + dy, shed_z + 16, BLOCKS["dark_oak_planks"])
    # Spooky interior
    writer.setblock(shed_x + 7, y + 6, shed_z + 7, BLOCKS["redstone_lamp"])
    writer.setblock(shed_x + 3, y + 1, shed_z + 3, BLOCKS["soul_torch"])
    writer.setblock(shed_x + 12, y + 1, shed_z + 3, BLOCKS["soul_torch"])
    # Barrel props
    for bx_off in [2, 5, 10, 13]:
        writer.setblock(shed_x + bx_off, y + 1, shed_z + 12, BLOCKS["barrel"])

    # Lumber mill entrance theming
    writer.comment("=== Lumber Mill Entrance ===")
    writer.fill(mx - 8, y + 1, mz - 5, mx - 6, y + 6, mz - 3, BLOCKS["spruce_log"])
    writer.fill(mx + 6, y + 1, mz - 5, mx + 8, y + 6, mz - 3, BLOCKS["spruce_log"])
    writer.fill(mx - 8, y + 5, mz - 5, mx + 8, y + 6, mz - 3, BLOCKS["spruce_planks"])

    # Trees around the ride
    writer.comment("=== Surrounding Forest ===")
    import random
    rng = random.Random(789)
    for _ in range(30):
        tx = mx + rng.randint(-20, 70)
        tz = mz + rng.randint(10, 200)
        tree(writer, tx, y + 1, tz,
             trunk_height=rng.randint(5, 8),
             leaf_radius=rng.randint(2, 4),
             trunk_block=BLOCKS["spruce_log"],
             leaf_block=BLOCKS["spruce_leaves"])

    pack.register_writer(writer)
