"""International Street - the grand boulevard from the entrance to the Royal Fountain.

Features European-style building facades, shops, and restaurants on both sides.
"""

import math
from kings_island.mcfunction_writer import McFunctionWriter
from kings_island.config import BLOCKS, LAYOUT, ORIGIN_Y
from kings_island.geometry import building_shell, peaked_roof


def build_international_street(pack):
    """Build International Street with all its buildings and details."""
    writer = McFunctionWriter("kings_island/structures/intl_street")

    y = ORIGIN_Y
    fx, fy, fz = LAYOUT["royal_fountain"]
    ez = LAYOUT["main_entrance"][2]

    writer.comment("============================================")
    writer.comment("  INTERNATIONAL STREET")
    writer.comment("  Grand boulevard to Royal Fountain")
    writer.comment("============================================")

    # Street runs from z=ez+12 to z=fz-15 (roughly z=-188 to z=-15)
    street_start = ez + 12
    street_end = fz - 15

    # === WEST SIDE BUILDINGS ===
    writer.comment("=== West Side Buildings ===")
    _build_west_side(writer, y, street_start, street_end)

    # === EAST SIDE BUILDINGS ===
    writer.comment("=== East Side Buildings ===")
    _build_east_side(writer, y, street_start, street_end)

    # === STREET DETAILS ===
    writer.comment("=== Street Details ===")
    _build_street_details(writer, y, street_start, street_end)

    pack.register_writer(writer)


def _build_european_building(writer, x, y, z, width, depth, height,
                              wall_block, roof_block, name="Building",
                              has_awning=True, awning_color=None,
                              window_style="regular"):
    """Build a detailed European-style building facade."""
    writer.comment(f"  {name}")

    x2 = x + width
    z2 = z + depth
    y_top = y + height

    # Foundation
    writer.fill(x, y, z, x2, y, z2, BLOCKS["cobble"])

    # Main walls
    writer.fill(x, y + 1, z, x, y_top, z2, wall_block)
    writer.fill(x2, y + 1, z, x2, y_top, z2, wall_block)
    writer.fill(x, y + 1, z, x2, y_top, z, wall_block)
    writer.fill(x, y + 1, z2, x2, y_top, z2, wall_block)

    # Clear interior
    if width > 2 and depth > 2:
        writer.fill(x + 1, y + 1, z + 1, x2 - 1, y_top - 1, z2 - 1, BLOCKS["air"])
        # Interior floor
        writer.fill(x + 1, y, z + 1, x2 - 1, y, z2 - 1, BLOCKS["oak_planks"])

    # Windows
    if window_style == "regular":
        _add_windows_regular(writer, x, y, z, x2, z2, y_top, width, depth)
    elif window_style == "arched":
        _add_windows_arched(writer, x, y, z, x2, z2, y_top, width, depth)

    # Door
    writer.fill(x + width // 2, y + 1, z, x + width // 2, y + 3, z, BLOCKS["air"])
    writer.fill(x + width // 2 + 1, y + 1, z, x + width // 2 + 1, y + 3, z, BLOCKS["air"])

    # Peaked roof
    peaked_roof(writer, x - 1, z - 1, x2 + 1, z2 + 1, y_top, height // 3 + 2, roof_block)

    # Awning over ground floor
    if has_awning and awning_color:
        writer.fill(x, y + 4, z - 2, x2, y + 4, z - 1, awning_color)

    # Chimney
    chimney_x = x + width - 2
    writer.fill(chimney_x, y_top, z2 - 2, chimney_x + 1, y_top + height // 3 + 4, z2 - 1,
                BLOCKS["path_brick"])

    # Interior lighting
    writer.setblock(x + width // 2, y_top - 1, z + depth // 2, BLOCKS["glowstone"])

    return x2, y_top, z2


def _add_windows_regular(writer, x, y, z, x2, z2, y_top, width, depth):
    """Add regular rectangular windows."""
    # Front face (z side)
    for wx in range(x + 2, x2 - 1, 4):
        for wy_base in range(y + 2, y_top - 2, 4):
            writer.fill(wx, wy_base, z, wx + 1, wy_base + 2, z, BLOCKS["white_glass"])

    # Back face
    for wx in range(x + 2, x2 - 1, 4):
        for wy_base in range(y + 2, y_top - 2, 4):
            writer.fill(wx, wy_base, z2, wx + 1, wy_base + 2, z2, BLOCKS["white_glass"])

    # Side faces
    for wz in range(z + 2, z2 - 1, 4):
        for wy_base in range(y + 2, y_top - 2, 4):
            writer.setblock(x, wy_base, wz, BLOCKS["white_glass"])
            writer.setblock(x, wy_base + 1, wz, BLOCKS["white_glass"])
            writer.setblock(x2, wy_base, wz, BLOCKS["white_glass"])
            writer.setblock(x2, wy_base + 1, wz, BLOCKS["white_glass"])


def _add_windows_arched(writer, x, y, z, x2, z2, y_top, width, depth):
    """Add arched windows (taller, more decorative)."""
    for wx in range(x + 2, x2 - 1, 5):
        for wy_base in range(y + 2, y_top - 3, 5):
            # Tall window
            writer.fill(wx, wy_base, z, wx + 1, wy_base + 3, z, BLOCKS["white_glass"])
            # Arch top
            writer.setblock(wx, wy_base + 3, z, BLOCKS["white_glass"])
            writer.setblock(wx + 1, wy_base + 3, z, BLOCKS["white_glass"])

    for wx in range(x + 2, x2 - 1, 5):
        for wy_base in range(y + 2, y_top - 3, 5):
            writer.fill(wx, wy_base, z2, wx + 1, wy_base + 3, z2, BLOCKS["white_glass"])


def _build_west_side(writer, y, street_start, street_end):
    """Build buildings on the west side of International Street."""
    x_base = -15  # West side starts here, buildings extend west

    buildings = [
        {"name": "La Rosa's Pizzeria", "width": 20, "depth": 15, "height": 12,
         "wall": BLOCKS["red_concrete"], "roof": BLOCKS["roof_red"],
         "awning": BLOCKS["red_concrete"], "windows": "arched"},
        {"name": "International Restaurant", "width": 25, "depth": 18, "height": 14,
         "wall": BLOCKS["white_concrete"], "roof": BLOCKS["roof_brown"],
         "awning": BLOCKS["green_concrete"], "windows": "arched"},
        {"name": "Festhaus", "width": 30, "depth": 22, "height": 16,
         "wall": BLOCKS["white_concrete"], "roof": BLOCKS["roof_blue"],
         "awning": BLOCKS["blue_concrete"], "windows": "regular"},
        {"name": "Gift Shop West", "width": 18, "depth": 14, "height": 10,
         "wall": BLOCKS["yellow_concrete"], "roof": BLOCKS["roof_red"],
         "awning": BLOCKS["orange_concrete"], "windows": "regular"},
        {"name": "Sweet Spot Candy", "width": 16, "depth": 12, "height": 10,
         "wall": BLOCKS["pink_concrete"], "roof": BLOCKS["roof_brown"],
         "awning": BLOCKS["magenta_concrete"], "windows": "arched"},
    ]

    z_cursor = street_start + 5
    for bldg in buildings:
        if z_cursor + bldg["depth"] > street_end:
            break
        _build_european_building(
            writer,
            x_base - bldg["width"], y, z_cursor,
            bldg["width"], bldg["depth"], bldg["height"],
            bldg["wall"], bldg["roof"],
            name=bldg["name"],
            has_awning=True,
            awning_color=bldg["awning"],
            window_style=bldg["windows"]
        )
        z_cursor += bldg["depth"] + 5


def _build_east_side(writer, y, street_start, street_end):
    """Build buildings on the east side of International Street."""
    x_base = 15  # East side starts here, buildings extend east

    buildings = [
        {"name": "Graeter's Ice Cream", "width": 18, "depth": 14, "height": 10,
         "wall": BLOCKS["white_concrete"], "roof": BLOCKS["roof_red"],
         "awning": BLOCKS["red_concrete"], "windows": "regular"},
        {"name": "Skyline Chili", "width": 22, "depth": 16, "height": 12,
         "wall": BLOCKS["blue_concrete"], "roof": BLOCKS["roof_brown"],
         "awning": BLOCKS["yellow_concrete"], "windows": "arched"},
        {"name": "Kings Island Trading Post", "width": 28, "depth": 20, "height": 14,
         "wall": BLOCKS["brown_concrete"], "roof": BLOCKS["roof_red"],
         "awning": BLOCKS["orange_concrete"], "windows": "regular"},
        {"name": "Starbucks", "width": 16, "depth": 12, "height": 10,
         "wall": BLOCKS["green_concrete"], "roof": BLOCKS["roof_brown"],
         "awning": BLOCKS["green_concrete"], "windows": "arched"},
        {"name": "Photo Center", "width": 20, "depth": 15, "height": 11,
         "wall": BLOCKS["light_gray_concrete"], "roof": BLOCKS["roof_blue"],
         "awning": BLOCKS["cyan_concrete"], "windows": "regular"},
    ]

    z_cursor = street_start + 5
    for bldg in buildings:
        if z_cursor + bldg["depth"] > street_end:
            break
        _build_european_building(
            writer,
            x_base, y, z_cursor,
            bldg["width"], bldg["depth"], bldg["height"],
            bldg["wall"], bldg["roof"],
            name=bldg["name"],
            has_awning=True,
            awning_color=bldg["awning"],
            window_style=bldg["windows"]
        )
        z_cursor += bldg["depth"] + 5


def _build_street_details(writer, y, street_start, street_end):
    """Add lampposts, benches, planters, and other street furniture."""
    writer.comment("Lampposts")
    for z in range(street_start + 10, street_end - 10, 20):
        for x_offset in [-11, 11]:
            # Lamppost
            writer.fill(x_offset, y + 1, z, x_offset, y + 4, z, BLOCKS["iron_bars"])
            writer.setblock(x_offset, y + 5, z, BLOCKS["glowstone"])
            # Decorative top
            writer.setblock(x_offset - 1, y + 5, z, BLOCKS["iron_bars"])
            writer.setblock(x_offset + 1, y + 5, z, BLOCKS["iron_bars"])

    writer.comment("Benches")
    for z in range(street_start + 15, street_end - 15, 25):
        for x_offset in [-9, 9]:
            # Bench (oak stairs)
            writer.fill(x_offset, y + 1, z, x_offset, y + 1, z + 2, BLOCKS["oak_planks"])
            writer.fill(x_offset, y + 2, z, x_offset, y + 2, z + 2, BLOCKS["oak_planks"])

    writer.comment("Planters")
    for z in range(street_start + 8, street_end - 8, 15):
        for x_offset in [-8, 8]:
            # Stone planter box with flowers
            writer.fill(x_offset - 1, y + 1, z - 1, x_offset + 1, y + 2, z + 1, BLOCKS["path_accent"])
            writer.fill(x_offset, y + 1, z, x_offset, y + 1, z, BLOCKS["dirt"])
            writer.setblock(x_offset, y + 2, z, BLOCKS["dirt"])
            writer.setblock(x_offset, y + 3, z, BLOCKS["rose"])

    # Decorative banners along the street
    writer.comment("Banners")
    for z in range(street_start + 12, street_end - 12, 18):
        for x_offset in [-12, 12]:
            writer.fill(x_offset, y + 1, z, x_offset, y + 6, z, BLOCKS["iron_bars"])
            writer.setblock(x_offset, y + 6, z, BLOCKS["banner_red"])
