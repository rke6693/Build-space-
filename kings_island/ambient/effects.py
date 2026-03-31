"""Special effects - particle systems, welcome messages, and immersive details."""

from kings_island.mcfunction_writer import McFunctionWriter
from kings_island.config import BLOCKS, LAYOUT, ORIGIN_Y


def build_effects(pack):
    """Build special effects and welcome system."""
    writer = McFunctionWriter("kings_island/ambient/effects")

    y = ORIGIN_Y

    writer.comment("============================================")
    writer.comment("  SPECIAL EFFECTS & IMMERSION")
    writer.comment("============================================")

    # === Welcome Message System ===
    writer.comment("=== Welcome Teleport & Message ===")
    ex, ey, ez = LAYOUT["main_entrance"]

    # Teleport player to entrance
    writer.add(f"tp @a {ex} {ey + 1} {ez - 5} 0 0")

    # Welcome title
    writer.title("@a", "\\u00a76\\u00a7lKINGS ISLAND", "title")
    writer.title("@a", "\\u00a7eMason, Ohio - Est. 1972", "subtitle")

    # Set time to day
    writer.add("time set day")
    writer.add("weather clear")

    # Give player a map (helpful for navigation)
    writer.add("gamemode adventure @a")
    writer.add("gamerule commandBlockOutput false")

    # === Ride Entry Messages ===
    writer.comment("=== Ride Signs ===")

    rides = [
        ("the_beast_station", "THE BEAST", "World's Longest Wooden Coaster - 7,359ft"),
        ("orion_station", "ORION", "Giga Coaster - 300ft Drop, 91mph"),
        ("diamondback_station", "DIAMONDBACK", "Hyper Coaster - 230ft Drop, Splashdown!"),
        ("banshee_station", "BANSHEE", "World's Longest Inverted Coaster"),
        ("mystic_timbers_station", "MYSTIC TIMBERS", "What's in the shed?"),
        ("the_racer_station", "THE RACER", "Classic Twin Racing Coaster"),
    ]

    for key, name, desc in rides:
        rx, ry, rz = LAYOUT[key]
        # Place sign blocks (gold markers with ride name)
        writer.fill(rx - 3, y + 5, rz - 2, rx + 3, y + 5, rz - 2, BLOCKS["yellow_concrete"])
        writer.fill(rx - 3, y + 6, rz - 2, rx + 3, y + 6, rz - 2, BLOCKS["yellow_concrete"])

    # === Campfire smoke effects at Rivertown ===
    writer.comment("=== Campfire Effects ===")
    rx, ry, rz = LAYOUT["rivertown"]
    for dx, dz in [(rx - 25, rz + 5), (rx - 25, rz + 25), (rx + 25, rz + 15)]:
        writer.setblock(dx, y + 1, dz, BLOCKS["campfire"])

    # === Torch lighting along ride queues ===
    writer.comment("=== Queue Torches ===")
    for ride_key in ["the_beast_station", "mystic_timbers_station"]:
        rx, ry, rz = LAYOUT[ride_key]
        for dz in range(-12, 0, 3):
            writer.setblock(rx - 4, y + 2, rz + dz, BLOCKS["torch"])
            writer.setblock(rx + 4, y + 2, rz + dz, BLOCKS["torch"])

    # === Soul torches for Banshee (spooky) ===
    writer.comment("=== Banshee Spooky Torches ===")
    bx, by, bz = LAYOUT["banshee_station"]
    for dz in range(-15, 0, 4):
        writer.setblock(bx - 5, y + 2, bz + dz, BLOCKS["soul_torch"])
        writer.setblock(bx + 5, y + 2, bz + dz, BLOCKS["soul_torch"])

    # === Information Kiosks ===
    writer.comment("=== Info Kiosks ===")
    fx, fy, fz = LAYOUT["royal_fountain"]
    for angle_deg in [45, 135, 225, 315]:
        import math
        rad = math.radians(angle_deg)
        kx = fx + int(25 * math.cos(rad))
        kz = fz + int(25 * math.sin(rad))
        writer.fill(kx, y + 1, kz, kx + 1, y + 3, kz + 1, BLOCKS["white_concrete"])
        writer.setblock(kx, y + 3, kz, BLOCKS["glowstone"])

    pack.register_writer(writer)
