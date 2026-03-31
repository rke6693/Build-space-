#!/usr/bin/env python3
"""Kings Island Theme Park - Minecraft Bedrock Behavior Pack Generator.

Generates a .mcpack file containing the complete Kings Island theme park
as mcfunction files for Minecraft Bedrock Edition (iPad compatible).

Usage:
    python3 generate_pack.py

Output:
    Kings_Island.mcpack - Import this file into Minecraft on iPad

Installation:
    1. Transfer Kings_Island.mcpack to your iPad
    2. Tap the file - Minecraft will auto-import it
    3. Create a new world:
       - World Type: Flat
       - Enable "Activate Cheats"
       - Under "Behavior Packs", activate "Kings Island Theme Park"
    4. In-game, run: /function kings_island/build_all
    5. Wait for the build to complete
    6. Explore and ride the coasters!

    TIP: For better performance, build section by section:
        /function kings_island/build_terrain
        /function kings_island/build_structures
        /function kings_island/build_rides
        /function kings_island/build_areas
        /function kings_island/build_ambient
"""

import os
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from kings_island.pack_builder import PackBuilder

# Terrain
from kings_island.terrain import generate_terrain

# Structures
from kings_island.structures.eiffel_tower import build_eiffel_tower
from kings_island.structures.royal_fountain import build_royal_fountain
from kings_island.structures.international_street import build_international_street

# Rides
from kings_island.rides.the_beast import build_the_beast
from kings_island.rides.orion import build_orion
from kings_island.rides.diamondback import build_diamondback
from kings_island.rides.banshee import build_banshee
from kings_island.rides.mystic_timbers import build_mystic_timbers
from kings_island.rides.the_racer import build_the_racer
from kings_island.rides.flat_rides import build_flat_rides

# Themed Areas
from kings_island.areas.rivertown import build_rivertown
from kings_island.areas.coney_mall import build_coney_mall
from kings_island.areas.action_zone import build_action_zone
from kings_island.areas.area_72 import build_area_72
from kings_island.areas.planet_snoopy import build_planet_snoopy

# Ambient
from kings_island.ambient.sounds import build_ambient_sounds
from kings_island.ambient.lighting import build_lighting
from kings_island.ambient.effects import build_effects


def main():
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Kings_Island.mcpack")
    pack = PackBuilder("kings_island_bp", output_path)

    print("=" * 60)
    print("  KINGS ISLAND THEME PARK")
    print("  Minecraft Bedrock Behavior Pack Generator")
    print("=" * 60)
    print()

    # Phase 1: Terrain
    print("[1/6] Generating terrain, paths, and water features...")
    generate_terrain(pack)

    # Phase 2: Iconic Structures
    print("[2/6] Building iconic structures...")
    print("  - Eiffel Tower (315 blocks tall)")
    build_eiffel_tower(pack)
    print("  - Royal Fountain")
    build_royal_fountain(pack)
    print("  - International Street")
    build_international_street(pack)

    # Phase 3: Roller Coasters
    print("[3/6] Building roller coasters...")
    print("  - The Beast (world's longest wooden coaster)")
    build_the_beast(pack)
    print("  - Orion (giga coaster, 300ft drop)")
    build_orion(pack)
    print("  - Diamondback (hyper coaster with splashdown)")
    build_diamondback(pack)
    print("  - Banshee (inverted coaster)")
    build_banshee(pack)
    print("  - Mystic Timbers (wooden coaster)")
    build_mystic_timbers(pack)
    print("  - The Racer (twin racing coaster)")
    build_the_racer(pack)
    print("  - Flat rides (Drop Tower, WindSeeker, Delirium, etc.)")
    build_flat_rides(pack)

    # Phase 4: Themed Areas
    print("[4/6] Building themed areas...")
    print("  - Rivertown")
    build_rivertown(pack)
    print("  - Coney Mall")
    build_coney_mall(pack)
    print("  - Action Zone")
    build_action_zone(pack)
    print("  - Area 72")
    build_area_72(pack)
    print("  - Planet Snoopy")
    build_planet_snoopy(pack)

    # Phase 5: Ambient
    print("[5/6] Adding ambient sounds, lighting, and effects...")
    build_ambient_sounds(pack)
    build_lighting(pack)
    build_effects(pack)

    # Phase 6: Package
    print("[6/6] Packaging behavior pack...")
    pack.write_master_function()
    output = pack.package()

    print()
    print("=" * 60)
    print(f"  BUILD COMPLETE!")
    print(f"  Output: {output}")
    print(f"  Total commands: {pack.total_commands:,}")
    print(f"  Total mcfunction files: {pack.total_files}")
    print(f"  File size: {os.path.getsize(output) / 1024:.1f} KB")
    print("=" * 60)
    print()
    print("INSTALLATION:")
    print("  1. Transfer Kings_Island.mcpack to your iPad")
    print("  2. Tap the file to import into Minecraft")
    print("  3. Create a FLAT world with cheats enabled")
    print("  4. Activate the behavior pack in world settings")
    print("  5. Run: /function kings_island/build_all")
    print()
    print("RIDE THE COASTERS:")
    print("  - Find a minecart at any ride station")
    print("  - Right-tap the minecart to get in")
    print("  - Enjoy the ride!")
    print()
    print("BUILD SECTION BY SECTION (for better performance):")
    print("  /function kings_island/build_terrain")
    print("  /function kings_island/build_structures")
    print("  /function kings_island/build_rides")
    print("  /function kings_island/build_areas")
    print("  /function kings_island/build_ambient")


if __name__ == "__main__":
    main()
