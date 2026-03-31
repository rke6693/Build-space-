"""Kings Island Eiffel Tower - 1/3 scale replica of the Paris Eiffel Tower.

The real Kings Island tower is 315 feet (1/3 of the original 984 feet).
At 1 block = 1 foot, this is 315 blocks tall.
Base at y=4 to fit within build height (peak at y=319).
"""

import math
from kings_island.mcfunction_writer import McFunctionWriter
from kings_island.config import BLOCKS, LAYOUT, TOWER_BASE_Y


def build_eiffel_tower(pack):
    """Build the complete Eiffel Tower."""
    writer = McFunctionWriter("kings_island/structures/eiffel_tower")

    tx, ty, tz = LAYOUT["eiffel_tower"]
    base_y = TOWER_BASE_Y

    writer.comment("============================================")
    writer.comment("  KINGS ISLAND EIFFEL TOWER")
    writer.comment("  315 blocks tall - 1/3 scale Paris replica")
    writer.comment("============================================")

    # Tower dimensions at each level (approximate)
    # Base spread: ~50 blocks square (each leg corner)
    # First platform (100 blocks up): ~30 blocks square
    # Second platform (200 blocks up): ~16 blocks square
    # Top section: tapers to ~4 blocks
    # Observation deck at ~275 blocks

    total_height = 315
    base_spread = 50  # Half-width at base
    first_platform_y = base_y + 100
    second_platform_y = base_y + 200
    observation_y = base_y + 275
    top_y = base_y + total_height

    # Fill the pit below the tower base (underground portion)
    writer.comment("Tower Foundation")
    writer.fill(tx - base_spread - 5, base_y, tz - base_spread - 5,
                tx + base_spread + 5, 63, tz + base_spread + 5, BLOCKS["stone"])
    writer.fill(tx - base_spread - 3, 60, tz - base_spread - 3,
                tx + base_spread + 3, 63, tz + base_spread + 3, BLOCKS["path_main"])

    # === FOUR LEGS ===
    writer.comment("Tower Legs - Ground to First Platform")
    _build_legs(writer, tx, tz, base_y, first_platform_y, base_spread, 15)

    # === FIRST PLATFORM ===
    writer.comment("First Observation Platform")
    _build_platform(writer, tx, tz, first_platform_y, 18)

    # === LEGS - First to Second Platform ===
    writer.comment("Tower Legs - First to Second Platform")
    _build_legs(writer, tx, tz, first_platform_y, second_platform_y, 15, 8)

    # === SECOND PLATFORM ===
    writer.comment("Second Observation Platform")
    _build_platform(writer, tx, tz, second_platform_y, 10)

    # === UPPER SHAFT ===
    writer.comment("Upper Shaft")
    _build_upper_shaft(writer, tx, tz, second_platform_y, observation_y)

    # === OBSERVATION DECK ===
    writer.comment("Observation Deck")
    _build_observation_deck(writer, tx, tz, observation_y)

    # === ANTENNA/SPIRE ===
    writer.comment("Antenna Spire")
    _build_antenna(writer, tx, tz, observation_y + 8, top_y)

    # === LIGHTING ===
    writer.comment("Tower Lighting")
    _build_lighting(writer, tx, tz, base_y, top_y)

    # === ARCHES ===
    writer.comment("Decorative Arches")
    _build_arches(writer, tx, tz, base_y)

    pack.register_writer(writer)


def _build_legs(writer, cx, cz, y_bottom, y_top, spread_bottom, spread_top):
    """Build four tapered legs with lattice work."""
    height = y_top - y_bottom

    # Four leg positions (NE, NW, SE, SW)
    corners = [
        (1, 1),   # NE
        (-1, 1),  # NW
        (1, -1),  # SE
        (-1, -1), # SW
    ]

    for dx_sign, dz_sign in corners:
        for dy in range(0, height, 2):
            y = y_bottom + dy
            progress = dy / max(height, 1)

            # Interpolate spread
            spread = spread_bottom + (spread_top - spread_bottom) * progress
            leg_x = cx + int(dx_sign * spread)
            leg_z = cz + int(dz_sign * spread)

            # Main leg column (3x3 cross section that tapers)
            leg_width = max(1, int(3 * (1 - progress * 0.5)))
            half_lw = leg_width // 2

            for lx in range(-half_lw, half_lw + 1):
                for lz in range(-half_lw, half_lw + 1):
                    writer.setblock(leg_x + lx, y, leg_z + lz, BLOCKS["iron"])
                    if dy + 1 < height:
                        writer.setblock(leg_x + lx, y + 1, leg_z + lz, BLOCKS["iron"])

        # Cross-bracing between legs every 15 blocks
        for dy in range(0, height, 15):
            y = y_bottom + dy
            progress = dy / max(height, 1)
            spread = spread_bottom + (spread_top - spread_bottom) * progress
            leg_x = cx + int(dx_sign * spread)
            leg_z = cz + int(dz_sign * spread)

            # Horizontal braces to adjacent legs
            next_x = cx + int(-dx_sign * spread)
            next_z = cz + int(dz_sign * spread)

            # X-direction brace
            x_min, x_max = min(leg_x, next_x), max(leg_x, next_x)
            writer.fill(x_min, y, leg_z, x_max, y, leg_z, BLOCKS["iron_bars"])

            # Z-direction brace
            next_z2 = cz + int(-dz_sign * spread)
            z_min, z_max = min(leg_z, next_z2), max(leg_z, next_z2)
            writer.fill(leg_x, y, z_min, leg_x, y, z_max, BLOCKS["iron_bars"])

    # Diagonal cross-braces on each face
    for dy in range(0, height, 20):
        y = y_bottom + dy
        progress = dy / max(height, 1)
        spread = spread_bottom + (spread_top - spread_bottom) * progress
        next_progress = min((dy + 20) / max(height, 1), 1.0)
        next_spread = spread_bottom + (spread_top - spread_bottom) * next_progress

        # Draw X-pattern braces on each face
        for face in range(4):
            _draw_face_brace(writer, cx, cz, y, min(y + 20, y_top),
                           spread, next_spread, face)


def _draw_face_brace(writer, cx, cz, y_bottom, y_top, spread_bottom, spread_top, face):
    """Draw cross-bracing on one face of the tower."""
    from kings_island.geometry import bresenham_3d

    height = y_top - y_bottom
    if height <= 2:
        return

    # Face definitions: 0=north, 1=south, 2=east, 3=west
    if face == 0:  # North face (constant +z)
        x1 = cx - int(spread_bottom)
        x2 = cx + int(spread_bottom)
        z1 = cz + int(spread_bottom)
        x3 = cx - int(spread_top)
        x4 = cx + int(spread_top)
        z2 = cz + int(spread_top)
        # X brace
        points = bresenham_3d(x1, y_bottom, z1, x4, y_top, z2)
        for px, py, pz in points[::2]:
            writer.setblock(px, py, pz, BLOCKS["iron_bars"])
    elif face == 1:  # South face
        x1 = cx - int(spread_bottom)
        x2 = cx + int(spread_bottom)
        z1 = cz - int(spread_bottom)
        x3 = cx - int(spread_top)
        x4 = cx + int(spread_top)
        z2 = cz - int(spread_top)
        points = bresenham_3d(x1, y_bottom, z1, x4, y_top, z2)
        for px, py, pz in points[::2]:
            writer.setblock(px, py, pz, BLOCKS["iron_bars"])
    elif face == 2:  # East face
        z1 = cz - int(spread_bottom)
        z2 = cz + int(spread_bottom)
        x1 = cx + int(spread_bottom)
        z3 = cz - int(spread_top)
        z4 = cz + int(spread_top)
        x2 = cx + int(spread_top)
        points = bresenham_3d(x1, y_bottom, z1, x2, y_top, z4)
        for px, py, pz in points[::2]:
            writer.setblock(px, py, pz, BLOCKS["iron_bars"])
    else:  # West face
        z1 = cz - int(spread_bottom)
        z2 = cz + int(spread_bottom)
        x1 = cx - int(spread_bottom)
        z3 = cz - int(spread_top)
        z4 = cz + int(spread_top)
        x2 = cx - int(spread_top)
        points = bresenham_3d(x1, y_bottom, z1, x2, y_top, z4)
        for px, py, pz in points[::2]:
            writer.setblock(px, py, pz, BLOCKS["iron_bars"])


def _build_platform(writer, cx, cz, y, size):
    """Build an observation platform at the given height."""
    half = size

    # Platform floor
    writer.fill(cx - half, y, cz - half, cx + half, y, cz + half, BLOCKS["iron"])

    # Railing
    writer.fill(cx - half, y + 1, cz - half, cx + half, y + 1, cz - half, BLOCKS["iron_bars"])
    writer.fill(cx - half, y + 1, cz + half, cx + half, y + 1, cz + half, BLOCKS["iron_bars"])
    writer.fill(cx - half, y + 1, cz - half, cx - half, y + 1, cz + half, BLOCKS["iron_bars"])
    writer.fill(cx + half, y + 1, cz - half, cx + half, y + 1, cz + half, BLOCKS["iron_bars"])

    # Floor lights
    for dx in range(-half + 2, half, 4):
        for dz in range(-half + 2, half, 4):
            writer.setblock(cx + dx, y, cz + dz, BLOCKS["sea_lantern"])

    # Decorative columns at corners
    for dx_s in [-1, 1]:
        for dz_s in [-1, 1]:
            writer.fill(cx + dx_s * half, y + 1, cz + dz_s * half,
                       cx + dx_s * half, y + 4, cz + dz_s * half, BLOCKS["iron"])


def _build_upper_shaft(writer, cx, cz, y_bottom, y_top):
    """Build the tapering upper shaft from second platform to observation deck."""
    height = y_top - y_bottom

    for dy in range(height):
        y = y_bottom + dy
        progress = dy / max(height, 1)

        # Taper from 8 to 3
        width = int(8 - 5 * progress)
        half = max(width, 1)

        # Four corner posts
        for dx_s, dz_s in [(-1, -1), (-1, 1), (1, -1), (1, 1)]:
            writer.setblock(cx + dx_s * half, y, cz + dz_s * half, BLOCKS["iron"])

        # Cross members every 5 blocks
        if dy % 5 == 0:
            writer.fill(cx - half, y, cz - half, cx + half, y, cz - half, BLOCKS["iron_bars"])
            writer.fill(cx - half, y, cz + half, cx + half, y, cz + half, BLOCKS["iron_bars"])
            writer.fill(cx - half, y, cz - half, cx - half, y, cz + half, BLOCKS["iron_bars"])
            writer.fill(cx + half, y, cz - half, cx + half, y, cz + half, BLOCKS["iron_bars"])


def _build_observation_deck(writer, cx, cz, y):
    """Build the main observation deck - the iconic viewing platform."""
    size = 6

    # Main deck floor
    writer.fill(cx - size, y, cz - size, cx + size, y, cz + size, BLOCKS["iron"])

    # Glass enclosure walls
    writer.fill(cx - size, y + 1, cz - size, cx + size, y + 3, cz - size, BLOCKS["glass"])
    writer.fill(cx - size, y + 1, cz + size, cx + size, y + 3, cz + size, BLOCKS["glass"])
    writer.fill(cx - size, y + 1, cz - size, cx - size, y + 3, cz + size, BLOCKS["glass"])
    writer.fill(cx + size, y + 1, cz - size, cx + size, y + 3, cz + size, BLOCKS["glass"])

    # Ceiling
    writer.fill(cx - size, y + 4, cz - size, cx + size, y + 4, cz + size, BLOCKS["iron"])

    # Interior lighting
    writer.fill(cx - 2, y, cz - 2, cx + 2, y, cz + 2, BLOCKS["sea_lantern"])

    # Iron frame pillars at corners
    for dx_s in [-1, 1]:
        for dz_s in [-1, 1]:
            writer.fill(cx + dx_s * size, y + 1, cz + dz_s * size,
                       cx + dx_s * size, y + 4, cz + dz_s * size, BLOCKS["iron"])

    # Roof cap with decorative top
    writer.fill(cx - size + 1, y + 5, cz - size + 1,
                cx + size - 1, y + 5, cz + size - 1, BLOCKS["iron"])
    writer.fill(cx - 3, y + 6, cz - 3, cx + 3, y + 6, cz + 3, BLOCKS["iron"])
    writer.fill(cx - 1, y + 7, cz - 1, cx + 1, y + 7, cz + 1, BLOCKS["iron"])


def _build_antenna(writer, cx, cz, y_bottom, y_top):
    """Build the antenna spire at the very top."""
    for y in range(y_bottom, min(y_top, 319)):
        writer.setblock(cx, y, cz, BLOCKS["iron"])
    # Red light at top
    writer.setblock(cx, min(y_top, 319), cz, BLOCKS["redstone_lamp"])


def _build_lighting(writer, cx, cz, base_y, top_y):
    """Add lighting throughout the tower."""
    # Lights along each leg
    for dy in range(0, top_y - base_y, 10):
        y = base_y + dy
        progress = dy / max(top_y - base_y, 1)
        spread = int(50 * (1 - progress * 0.85))
        if spread > 2:
            for dx_s, dz_s in [(-1, -1), (-1, 1), (1, -1), (1, 1)]:
                writer.setblock(cx + dx_s * spread, y, cz + dz_s * spread, BLOCKS["glowstone"])

    # Spotlights at base pointing up
    for dx_s, dz_s in [(-1, -1), (-1, 1), (1, -1), (1, 1)]:
        writer.setblock(cx + dx_s * 25, base_y, cz + dz_s * 25, BLOCKS["sea_lantern"])


def _build_arches(writer, cx, cz, base_y):
    """Build the iconic arches at the base of the tower."""
    # Grand arch on each face of the tower base
    arch_y = base_y + 20
    spread = 50

    # North face arch
    for dx in range(-spread, spread + 1):
        # Parabolic arch shape
        norm = abs(dx) / spread
        arch_height = int(30 * (1 - norm * norm))
        if arch_height > 0:
            writer.setblock(cx + dx, base_y + arch_height, cz + spread, BLOCKS["iron"])
            writer.setblock(cx + dx, base_y + arch_height, cz - spread, BLOCKS["iron"])

    # East/West face arches
    for dz in range(-spread, spread + 1):
        norm = abs(dz) / spread
        arch_height = int(30 * (1 - norm * norm))
        if arch_height > 0:
            writer.setblock(cx + spread, base_y + arch_height, cz + dz, BLOCKS["iron"])
            writer.setblock(cx - spread, base_y + arch_height, cz + dz, BLOCKS["iron"])
