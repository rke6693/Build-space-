## Finishing Details - Landscaping, lights, small accents

## === EXTERIOR LIGHT FIXTURES ===
## Front porch lanterns (already placed in porch.mcfunction)
## Garage exterior lights
setblock ~16 ~4 ~5 lantern
setblock ~24 ~4 ~5 lantern

## Back exterior light
setblock ~8 ~4 ~21 lantern

## === LANDSCAPING - BUSHES (leaf blocks as shrubs) ===
## Front of house bushes (between porch and garage)
setblock ~8 ~1 ~5 azalea_leaves
setblock ~9 ~1 ~5 azalea_leaves
setblock ~10 ~1 ~5 azalea_leaves
setblock ~13 ~1 ~5 azalea_leaves
setblock ~14 ~1 ~5 azalea_leaves

## Bush next to porch
setblock ~1 ~1 ~3 azalea_leaves
setblock ~1 ~1 ~4 azalea_leaves

## Right side of garage bush
setblock ~25 ~1 ~5 azalea_leaves
setblock ~26 ~1 ~5 azalea_leaves

## === LANDSCAPING - SMALL TREE (left side/back yard) ===
## Tree trunk
fill ~-2 ~0 ~15 ~-2 ~3 ~15 oak_log
## Tree canopy
fill ~-4 ~3 ~13 ~0 ~5 ~17 oak_leaves
fill ~-3 ~6 ~14 ~-1 ~6 ~16 oak_leaves

## Back yard tree (visible in rear photo)
fill ~-3 ~0 ~20 ~-3 ~4 ~20 oak_log
fill ~-5 ~4 ~18 ~-1 ~6 ~22 oak_leaves

## === HOUSE NUMBER (item frame with map or sign) ===
## Address plaque near front door
setblock ~3 ~3 ~5 wall_sign ["facing_direction"=3]

## === MAILBOX ===
setblock ~12 ~0 ~0 oak_fence
setblock ~12 ~1 ~0 oak_fence
setblock ~12 ~2 ~0 trapped_chest ["minecraft:cardinal_direction"="south"]

## === FLOWER BEDS (along front) ===
fill ~8 ~-1 ~5 ~14 ~-1 ~5 podzol
fill ~1 ~-1 ~2 ~1 ~-1 ~5 podzol

## === BACK YARD - GRASS GROUND ===
## Already grass from clear function, looks natural

## === RAIN GUTTERS (thin line at roofline - chains) ===
setblock ~0 ~10 ~6 chain
setblock ~0 ~9 ~6 chain
setblock ~0 ~8 ~6 chain
setblock ~0 ~7 ~6 chain

## === POWER LINE TOWER (visible in background of front photo) ===
## Small representation in the distance
fill ~-8 ~0 ~8 ~-8 ~12 ~8 iron_bars
fill ~-10 ~12 ~8 ~-6 ~12 ~8 iron_bars
fill ~-10 ~11 ~8 ~-6 ~11 ~8 iron_bars

## === NEIGHBOR HOUSES (partial, visible in photos) ===
## Left neighbor (partial view)
fill ~-6 ~0 ~6 ~-4 ~6 ~17 smooth_sandstone
fill ~-6 ~7 ~6 ~-4 ~9 ~17 smooth_sandstone
## Right neighbor (partial view)
fill ~30 ~0 ~8 ~32 ~6 ~16 smooth_sandstone
fill ~30 ~7 ~8 ~32 ~9 ~16 smooth_sandstone
