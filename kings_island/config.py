"""Global configuration for Kings Island Minecraft build."""

import uuid

# Pack metadata
PACK_NAME = "Kings Island Theme Park"
PACK_DESCRIPTION = "To-scale replica of Kings Island, Mason OH - Rideable coasters & ambient sounds"
PACK_VERSION = [1, 0, 0]
MIN_ENGINE_VERSION = [1, 20, 0]
HEADER_UUID = str(uuid.uuid5(uuid.NAMESPACE_DNS, "kings-island-header"))
MODULE_UUID = str(uuid.uuid5(uuid.NAMESPACE_DNS, "kings-island-module"))

# Scale: 1 block = 1 foot
SCALE = 1

# Origin point - center of Royal Fountain
ORIGIN_X = 0
ORIGIN_Y = 64  # Standard Bedrock ground level
ORIGIN_Z = 0

# Eiffel Tower base is lowered to fit within build height
TOWER_BASE_Y = 4  # Allows tower to reach y=319

# Build limits
MAX_COMMANDS_PER_FILE = 8000  # Conservative for iPad performance
MAX_FILL_VOLUME = 32768  # Bedrock /fill limit
MAX_BUILD_HEIGHT = 320
MIN_BUILD_HEIGHT = -64

# Block palette
BLOCKS = {
    # Terrain
    "grass": "minecraft:grass_block",
    "dirt": "minecraft:dirt",
    "stone": "minecraft:stone",
    "water": "minecraft:water",
    "sand": "minecraft:sand",
    "gravel": "minecraft:gravel",

    # Paths and plazas
    "path_main": "minecraft:smooth_stone",
    "path_accent": "minecraft:stone_bricks",
    "path_brick": "minecraft:bricks",
    "plaza_red": "minecraft:red_concrete",
    "plaza_white": "minecraft:white_concrete",
    "plaza_gray": "minecraft:gray_concrete",
    "cobble": "minecraft:cobblestone",

    # Structural
    "iron": "minecraft:iron_block",
    "iron_bars": "minecraft:iron_bars",
    "oak_log": "minecraft:oak_log",
    "oak_planks": "minecraft:oak_planks",
    "spruce_log": "minecraft:spruce_log",
    "spruce_planks": "minecraft:spruce_planks",
    "dark_oak_log": "minecraft:dark_oak_log",
    "dark_oak_planks": "minecraft:dark_oak_planks",

    # Building materials
    "white_concrete": "minecraft:white_concrete",
    "light_gray_concrete": "minecraft:light_gray_concrete",
    "gray_concrete": "minecraft:gray_concrete",
    "red_concrete": "minecraft:red_concrete",
    "blue_concrete": "minecraft:blue_concrete",
    "cyan_concrete": "minecraft:cyan_concrete",
    "yellow_concrete": "minecraft:yellow_concrete",
    "orange_concrete": "minecraft:orange_concrete",
    "green_concrete": "minecraft:green_concrete",
    "purple_concrete": "minecraft:purple_concrete",
    "black_concrete": "minecraft:black_concrete",
    "brown_concrete": "minecraft:brown_concrete",
    "lime_concrete": "minecraft:lime_concrete",
    "magenta_concrete": "minecraft:magenta_concrete",
    "pink_concrete": "minecraft:pink_concrete",

    # Glass
    "glass": "minecraft:glass",
    "white_glass": "minecraft:white_stained_glass",
    "blue_glass": "minecraft:blue_stained_glass",
    "red_glass": "minecraft:red_stained_glass",

    # Decorative
    "glowstone": "minecraft:glowstone",
    "sea_lantern": "minecraft:sea_lantern",
    "lantern": "minecraft:lantern",
    "redstone_lamp": "minecraft:redstone_lamp",
    "flower_pot": "minecraft:flower_pot",

    # Rails
    "rail": "minecraft:rail",
    "powered_rail": "minecraft:powered_rail",
    "detector_rail": "minecraft:detector_rail",
    "activator_rail": "minecraft:activator_rail",
    "redstone_block": "minecraft:redstone_block",

    # Command blocks
    "repeating_cmd": "minecraft:repeating_command_block",
    "chain_cmd": "minecraft:chain_command_block",
    "impulse_cmd": "minecraft:command_block",

    # Coaster materials
    "wood_coaster": "minecraft:oak_fence",
    "steel_coaster": "minecraft:iron_bars",
    "coaster_track_wood": "minecraft:oak_planks",
    "coaster_track_steel": "minecraft:light_gray_concrete",
    "coaster_support": "minecraft:oak_log",
    "steel_support": "minecraft:iron_bars",

    # Nature
    "oak_leaves": "minecraft:oak_leaves",
    "spruce_leaves": "minecraft:spruce_leaves",
    "dark_oak_leaves": "minecraft:dark_oak_leaves",
    "grass_plant": "minecraft:short_grass",
    "fern": "minecraft:fern",
    "rose": "minecraft:poppy",
    "dandelion": "minecraft:dandelion",

    # Roofing
    "roof_red": "minecraft:red_terracotta",
    "roof_brown": "minecraft:brown_terracotta",
    "roof_blue": "minecraft:blue_terracotta",
    "copper": "minecraft:oxidized_copper",

    # Sci-fi (Area 72)
    "prismarine": "minecraft:prismarine",
    "end_stone": "minecraft:end_stone_bricks",
    "purpur": "minecraft:purpur_block",
    "obsidian": "minecraft:obsidian",

    # Misc
    "air": "minecraft:air",
    "barrier": "minecraft:barrier",
    "wool_white": "minecraft:white_wool",
    "wool_red": "minecraft:red_wool",
    "wool_blue": "minecraft:blue_wool",
    "banner_red": "minecraft:red_banner",
    "torch": "minecraft:torch",
    "soul_torch": "minecraft:soul_torch",
    "campfire": "minecraft:campfire",
    "hay": "minecraft:hay_block",
    "barrel": "minecraft:barrel",
    "bookshelf": "minecraft:bookshelf",
    "chest": "minecraft:chest",
}

# Park layout coordinates (relative to ORIGIN)
# These define the center points of major areas
LAYOUT = {
    "main_entrance": (0, ORIGIN_Y, -200),
    "international_street": (0, ORIGIN_Y, -100),
    "royal_fountain": (0, ORIGIN_Y, 0),
    "eiffel_tower": (0, TOWER_BASE_Y, 0),

    # Themed areas - arranged roughly as in the real park
    "coney_mall": (200, ORIGIN_Y, 50),
    "rivertown": (100, ORIGIN_Y, 200),
    "action_zone": (-200, ORIGIN_Y, 100),
    "area_72": (-150, ORIGIN_Y, 300),
    "planet_snoopy": (250, ORIGIN_Y, 200),

    # Major rides
    "the_beast_station": (150, ORIGIN_Y, 250),
    "orion_station": (-100, ORIGIN_Y, 350),
    "diamondback_station": (50, ORIGIN_Y, 200),
    "banshee_station": (-250, ORIGIN_Y, 150),
    "mystic_timbers_station": (200, ORIGIN_Y, 300),
    "the_racer_station": (200, ORIGIN_Y, 0),
    "drop_tower": (-200, ORIGIN_Y, 50),
    "windseeker": (-250, ORIGIN_Y, 50),
}
