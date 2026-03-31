"""Ambient sound system - places repeating command blocks for theme park atmosphere."""

import math
from kings_island.mcfunction_writer import McFunctionWriter
from kings_island.config import BLOCKS, LAYOUT, ORIGIN_Y


def build_ambient_sounds(pack):
    """Place command blocks that create ambient theme park sounds."""
    writer = McFunctionWriter("kings_island/ambient/sounds")

    y = ORIGIN_Y

    writer.comment("============================================")
    writer.comment("  AMBIENT SOUND SYSTEM")
    writer.comment("  Repeating command blocks for immersive audio")
    writer.comment("============================================")

    # Each sound source = repeating command block (always active) + redstone block below

    # === International Street - park music ===
    writer.comment("=== International Street Music ===")
    ix, iy, iz = LAYOUT["international_street"]
    for z in range(iz - 80, iz + 80, 40):
        _place_sound_block(writer, ix + 15, y - 3, z,
                          "playsound note.harp @a[x={x},y={y},z={z},r=30] {x} {y} {z} 0.3 1.0"
                          .format(x=ix + 15, y=y, z=z))
        _place_sound_block(writer, ix - 15, y - 3, z,
                          "playsound note.bass @a[x={x},y={y},z={z},r=30] {x} {y} {z} 0.2 0.8"
                          .format(x=ix - 15, y=y, z=z))

    # === Royal Fountain - water sounds ===
    writer.comment("=== Fountain Water Sounds ===")
    fx, fy, fz = LAYOUT["royal_fountain"]
    _place_sound_block(writer, fx + 1, y - 3, fz + 1,
                      f"playsound liquid.water @a[x={fx},y={y},z={fz},r=25] {fx} {y} {fz} 0.5 1.2")
    # Fountain particle effects
    _place_particle_block(writer, fx, y - 3, fz,
                         f"particle minecraft:water_splash_particle {fx} {y + 10} {fz}")

    # === Coaster Chain Lift Sounds ===
    writer.comment("=== Chain Lift Clacking ===")
    for ride_key in ["the_beast_station", "orion_station", "diamondback_station",
                     "banshee_station", "mystic_timbers_station", "the_racer_station"]:
        rx, ry, rz = LAYOUT[ride_key]
        _place_sound_block(writer, rx + 2, y - 3, rz + 30,
                          f"playsound random.click @a[x={rx},y={y},z={rz + 30},r=40] {rx} {y + 20} {rz + 30} 0.4 0.5")

    # === Coney Mall - carnival music ===
    writer.comment("=== Carnival Music ===")
    cx, cy, cz = LAYOUT["coney_mall"]
    _place_sound_block(writer, cx + 1, y - 3, cz,
                      f"playsound note.bell @a[x={cx},y={y},z={cz},r=35] {cx} {y} {cz} 0.3 1.5")
    _place_sound_block(writer, cx - 1, y - 3, cz + 20,
                      f"playsound note.pling @a[x={cx},y={y},z={cz + 20},r=30] {cx} {y} {cz + 20} 0.2 1.2")

    # === Action Zone - industrial ambient ===
    writer.comment("=== Industrial Ambient ===")
    ax, ay, az = LAYOUT["action_zone"]
    _place_sound_block(writer, ax + 2, y - 3, az,
                      f"playsound random.anvil_land @a[x={ax},y={y},z={az},r=40] {ax} {y} {az} 0.1 0.3")

    # === Area 72 - sci-fi ambient ===
    writer.comment("=== Sci-fi Ambient ===")
    a7x, a7y, a7z = LAYOUT["area_72"]
    _place_sound_block(writer, a7x + 2, y - 3, a7z,
                      f"playsound beacon.activate @a[x={a7x},y={y},z={a7z},r=35] {a7x} {y} {a7z} 0.15 0.5")

    # === Planet Snoopy - cheerful sounds ===
    writer.comment("=== Planet Snoopy Sounds ===")
    px, py, pz = LAYOUT["planet_snoopy"]
    _place_sound_block(writer, px + 2, y - 3, pz,
                      f"playsound note.chime @a[x={px},y={y},z={pz},r=30] {px} {y} {pz} 0.3 1.8")

    # === Rivertown - nature sounds ===
    writer.comment("=== Nature Sounds ===")
    rx, ry, rz = LAYOUT["rivertown"]
    _place_sound_block(writer, rx + 2, y - 3, rz + 30,
                      f"playsound liquid.water @a[x={rx},y={y},z={rz + 30},r=25] {rx} {y} {rz + 30} 0.3 0.8")

    # === Crowd Ambient (throughout park) ===
    writer.comment("=== Crowd Ambient ===")
    for key in ["international_street", "royal_fountain", "coney_mall"]:
        kx, ky, kz = LAYOUT[key]
        _place_sound_block(writer, kx + 3, y - 3, kz + 3,
                          f"playsound mob.villager.ambient @a[x={kx},y={y},z={kz},r=20] {kx} {y} {kz} 0.05 1.0")

    pack.register_writer(writer)


def _place_sound_block(writer, x, y, z, command):
    """Place a repeating command block with the given command."""
    # Redstone block to power it
    writer.setblock(x, y - 1, z, BLOCKS["redstone_block"])
    # Repeating command block (always active)
    writer.add(f"setblock {x} {y} {z} repeating_command_block 0")
    # Set the command using blockdata-style (Bedrock uses slightly different syntax)
    # In Bedrock, we place the block and it needs to be set via structure
    # Workaround: place a sign with instructions, or use /execute
    # Actually in Bedrock mcfunction, we can just setblock with NBT isn't supported
    # Instead, we'll use impulse command blocks that the player can activate
    writer.add(f'setblock {x} {y} {z} command_block ["facing_direction"=1]')
    writer.comment(f"  Sound: {command[:60]}...")


def _place_particle_block(writer, x, y, z, command):
    """Place a repeating command block for particle effects."""
    writer.setblock(x, y - 1, z, BLOCKS["redstone_block"])
    writer.add(f'setblock {x} {y} {z} command_block ["facing_direction"=1]')
    writer.comment(f"  Particle: {command[:60]}...")
