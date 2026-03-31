## International Street - The iconic park entrance boulevard
## X: -12 to 12, Z: 5 to 120

## === ENTRANCE GATE / TOLL PLAZA ===
## Main archway
fill ~-8 ~0 ~5 ~-6 ~8 ~7 stone_bricks
fill ~6 ~0 ~5 ~8 ~8 ~7 stone_bricks
fill ~-6 ~6 ~5 ~6 ~8 ~5 stone_bricks
## Gate arch opening
fill ~-5 ~0 ~5 ~5 ~5 ~5 air
## Decorative top
fill ~-8 ~8 ~5 ~8 ~9 ~7 stone_brick_slab ["minecraft:vertical_half"="bottom"]
## "KINGS ISLAND" sign wall
fill ~-6 ~6 ~5 ~6 ~7 ~5 white_concrete
## Turnstiles (iron bars)
setblock ~-4 ~1 ~5 iron_bars
setblock ~-2 ~1 ~5 iron_bars
setblock ~0 ~1 ~5 iron_bars
setblock ~2 ~1 ~5 iron_bars
setblock ~4 ~1 ~5 iron_bars

## === LEFT SIDE BUILDINGS (European-style facades) ===
## Building 1 - Gift shop
fill ~-15 ~0 ~15 ~-13 ~6 ~30 bricks
fill ~-13 ~0 ~15 ~-13 ~6 ~30 white_concrete
fill ~-15 ~6 ~15 ~-13 ~6 ~30 stone_brick_slab ["minecraft:vertical_half"="bottom"]
## Roof
fill ~-16 ~7 ~14 ~-12 ~7 ~31 spruce_stairs ["weirdo_direction"=1]
## Windows
fill ~-13 ~2 ~18 ~-13 ~3 ~19 glass_pane
fill ~-13 ~2 ~23 ~-13 ~3 ~24 glass_pane
fill ~-13 ~2 ~27 ~-13 ~3 ~28 glass_pane
## Door
setblock ~-13 ~1 ~20 dark_oak_door ["direction"=1,"upper_block_bit"=false]
setblock ~-13 ~2 ~20 dark_oak_door ["direction"=1,"upper_block_bit"=true]

## Building 2 - Restaurant
fill ~-15 ~0 ~35 ~-13 ~7 ~55 bricks
fill ~-13 ~0 ~35 ~-13 ~7 ~55 white_concrete
fill ~-15 ~7 ~35 ~-13 ~8 ~55 spruce_slab ["minecraft:vertical_half"="bottom"]
## Awnings (colored wool)
fill ~-12 ~4 ~38 ~-12 ~4 ~42 red_wool
fill ~-12 ~4 ~46 ~-12 ~4 ~50 blue_wool
## Windows
fill ~-13 ~2 ~38 ~-13 ~3 ~39 glass_pane
fill ~-13 ~2 ~42 ~-13 ~3 ~43 glass_pane
fill ~-13 ~2 ~46 ~-13 ~3 ~47 glass_pane
fill ~-13 ~2 ~50 ~-13 ~3 ~51 glass_pane
fill ~-13 ~5 ~38 ~-13 ~6 ~39 glass_pane
fill ~-13 ~5 ~42 ~-13 ~6 ~43 glass_pane
fill ~-13 ~5 ~46 ~-13 ~6 ~47 glass_pane

## Building 3 - Sweet shop
fill ~-15 ~0 ~60 ~-13 ~6 ~80 white_concrete
fill ~-15 ~6 ~60 ~-13 ~7 ~80 bricks
fill ~-16 ~8 ~59 ~-12 ~8 ~81 dark_oak_slab ["minecraft:vertical_half"="bottom"]
fill ~-13 ~2 ~63 ~-13 ~3 ~64 glass_pane
fill ~-13 ~2 ~68 ~-13 ~3 ~69 glass_pane
fill ~-13 ~2 ~73 ~-13 ~3 ~74 glass_pane
setblock ~-13 ~1 ~70 dark_oak_door ["direction"=1,"upper_block_bit"=false]
setblock ~-13 ~2 ~70 dark_oak_door ["direction"=1,"upper_block_bit"=true]

## === RIGHT SIDE BUILDINGS (mirror, European-style) ===
## Building 4 - Merchandise
fill ~13 ~0 ~15 ~15 ~6 ~30 bricks
fill ~13 ~0 ~15 ~13 ~6 ~30 white_concrete
fill ~13 ~6 ~15 ~15 ~6 ~30 stone_brick_slab ["minecraft:vertical_half"="bottom"]
fill ~12 ~7 ~14 ~16 ~7 ~31 spruce_stairs ["weirdo_direction"=0]
fill ~13 ~2 ~18 ~13 ~3 ~19 glass_pane
fill ~13 ~2 ~23 ~13 ~3 ~24 glass_pane
fill ~13 ~2 ~27 ~13 ~3 ~28 glass_pane
setblock ~13 ~1 ~20 dark_oak_door ["direction"=3,"upper_block_bit"=false]
setblock ~13 ~2 ~20 dark_oak_door ["direction"=3,"upper_block_bit"=true]

## Building 5 - LaRosa's Pizza
fill ~13 ~0 ~35 ~15 ~7 ~55 bricks
fill ~13 ~0 ~35 ~13 ~7 ~55 white_concrete
fill ~13 ~7 ~35 ~15 ~8 ~55 spruce_slab ["minecraft:vertical_half"="bottom"]
fill ~12 ~4 ~38 ~12 ~4 ~42 green_wool
fill ~12 ~4 ~46 ~12 ~4 ~50 red_wool
fill ~13 ~2 ~38 ~13 ~3 ~39 glass_pane
fill ~13 ~2 ~42 ~13 ~3 ~43 glass_pane
fill ~13 ~2 ~46 ~13 ~3 ~47 glass_pane
fill ~13 ~2 ~50 ~13 ~3 ~51 glass_pane

## Building 6 - Skyline Chili
fill ~13 ~0 ~60 ~15 ~6 ~80 white_concrete
fill ~13 ~6 ~60 ~15 ~7 ~80 bricks
fill ~12 ~8 ~59 ~16 ~8 ~81 dark_oak_slab ["minecraft:vertical_half"="bottom"]
fill ~13 ~2 ~63 ~13 ~3 ~64 glass_pane
fill ~13 ~2 ~68 ~13 ~3 ~69 glass_pane
fill ~13 ~2 ~73 ~13 ~3 ~74 glass_pane

## === FLOWER BEDS (center median) ===
fill ~-3 ~0 ~15 ~3 ~0 ~110 grass_block
fill ~-2 ~1 ~16 ~2 ~1 ~25 red_tulip
fill ~-2 ~1 ~30 ~2 ~1 ~40 orange_tulip
fill ~-2 ~1 ~45 ~2 ~1 ~55 pink_tulip
fill ~-2 ~1 ~60 ~2 ~1 ~70 allium
fill ~-2 ~1 ~75 ~2 ~1 ~85 cornflower
fill ~-2 ~1 ~90 ~2 ~1 ~100 blue_orchid

## === TREES lining the street ===
## Left side trees
fill ~-12 ~0 ~20 ~-12 ~4 ~20 oak_log
fill ~-14 ~4 ~18 ~-10 ~6 ~22 oak_leaves
fill ~-12 ~0 ~40 ~-12 ~4 ~40 oak_log
fill ~-14 ~4 ~38 ~-10 ~6 ~42 oak_leaves
fill ~-12 ~0 ~60 ~-12 ~4 ~60 oak_log
fill ~-14 ~4 ~58 ~-10 ~6 ~62 oak_leaves
fill ~-12 ~0 ~80 ~-12 ~4 ~80 oak_log
fill ~-14 ~4 ~78 ~-10 ~6 ~82 oak_leaves
## Right side trees
fill ~12 ~0 ~20 ~12 ~4 ~20 oak_log
fill ~10 ~4 ~18 ~14 ~6 ~22 oak_leaves
fill ~12 ~0 ~40 ~12 ~4 ~40 oak_log
fill ~10 ~4 ~38 ~14 ~6 ~42 oak_leaves
fill ~12 ~0 ~60 ~12 ~4 ~60 oak_log
fill ~10 ~4 ~58 ~14 ~6 ~62 oak_leaves
fill ~12 ~0 ~80 ~12 ~4 ~80 oak_log
fill ~10 ~4 ~78 ~14 ~6 ~82 oak_leaves

## === LAMP POSTS ===
fill ~-8 ~0 ~25 ~-8 ~3 ~25 iron_bars
setblock ~-8 ~4 ~25 sea_lantern
fill ~8 ~0 ~25 ~8 ~3 ~25 iron_bars
setblock ~8 ~4 ~25 sea_lantern
fill ~-8 ~0 ~50 ~-8 ~3 ~50 iron_bars
setblock ~-8 ~4 ~50 sea_lantern
fill ~8 ~0 ~50 ~8 ~3 ~50 iron_bars
setblock ~8 ~4 ~50 sea_lantern
fill ~-8 ~0 ~75 ~-8 ~3 ~75 iron_bars
setblock ~-8 ~4 ~75 sea_lantern
fill ~8 ~0 ~75 ~8 ~3 ~75 iron_bars
setblock ~8 ~4 ~75 sea_lantern
fill ~-8 ~0 ~100 ~-8 ~3 ~100 iron_bars
setblock ~-8 ~4 ~100 sea_lantern
fill ~8 ~0 ~100 ~8 ~3 ~100 iron_bars
setblock ~8 ~4 ~100 sea_lantern

## === BENCHES (along the street) ===
setblock ~-5 ~1 ~30 oak_stairs ["weirdo_direction"=0]
setblock ~5 ~1 ~30 oak_stairs ["weirdo_direction"=1]
setblock ~-5 ~1 ~55 oak_stairs ["weirdo_direction"=0]
setblock ~5 ~1 ~55 oak_stairs ["weirdo_direction"=1]
setblock ~-5 ~1 ~80 oak_stairs ["weirdo_direction"=0]
setblock ~5 ~1 ~80 oak_stairs ["weirdo_direction"=1]

say International Street complete.
