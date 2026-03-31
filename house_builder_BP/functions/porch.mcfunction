## Front Porch - Covered entry with columns
## Porch area: X:1-7, Z:3-5, Y:0-5
## Based on photo: covered porch on left side of front, with white columns

## --- PORCH FLOOR (stone/concrete) ---
fill ~1 ~0 ~3 ~7 ~0 ~5 smooth_stone_slab ["minecraft:vertical_half"="bottom"]

## --- PORCH STEPS (front, 2 steps down) ---
fill ~2 ~0 ~2 ~6 ~0 ~2 stone_brick_stairs ["weirdo_direction"=3]
fill ~2 ~-1 ~1 ~6 ~-1 ~1 stone_brick_stairs ["weirdo_direction"=3]

## --- PORCH COLUMNS (white quartz pillars) ---
## Left front column
fill ~2 ~1 ~4 ~2 ~5 ~4 quartz_pillar ["pillar_axis"="y"]
## Right front column
fill ~6 ~1 ~4 ~6 ~5 ~4 quartz_pillar ["pillar_axis"="y"]
## Center column
fill ~4 ~1 ~4 ~4 ~5 ~4 quartz_pillar ["pillar_axis"="y"]

## --- PORCH CEILING / ROOF ---
fill ~1 ~5 ~3 ~7 ~5 ~6 oak_planks
## White soffit trim
fill ~1 ~5 ~3 ~7 ~5 ~3 quartz_block
fill ~1 ~5 ~3 ~1 ~5 ~6 quartz_block

## --- PORCH ROOF (extends from house wall) ---
fill ~0 ~6 ~3 ~8 ~6 ~6 dark_oak_slab ["minecraft:vertical_half"="bottom"]
fill ~0 ~6 ~2 ~8 ~6 ~2 dark_oak_stairs ["weirdo_direction"=3]

## --- LIGHT FIXTURES (lanterns on either side of door) ---
setblock ~3 ~4 ~5 lantern
setblock ~5 ~4 ~5 lantern

## --- PORCH RAILING (optional low wall) ---
## Small walls on porch sides
setblock ~1 ~1 ~3 stone_brick_wall
setblock ~1 ~1 ~4 stone_brick_wall
setblock ~7 ~1 ~3 stone_brick_wall
setblock ~7 ~1 ~4 stone_brick_wall
