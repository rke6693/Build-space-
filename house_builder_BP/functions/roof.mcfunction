## Roof - Dark shingle style using dark oak stairs and slabs
## Main house roof: gable style, ridge runs X direction at center Z
## Main house: X:1-15, Z:6-21, roof starts at Y:11

## === MAIN HOUSE ROOF ===
## Ridge center at Z=13-14 (middle of 6-21)
## Front slope (Z:6 toward Z:13) going up
## Back slope (Z:21 toward Z:14) going up

## --- Front slope (south-facing, stairs face south) ---
## Layer 1 (Y:11) - overhang
fill ~0 ~11 ~5 ~16 ~11 ~5 dark_oak_slab ["minecraft:vertical_half"="bottom"]
fill ~0 ~11 ~6 ~16 ~11 ~8 dark_oak_stairs ["weirdo_direction"=3]
## Layer 2 (Y:12)
fill ~0 ~12 ~9 ~16 ~12 ~10 dark_oak_stairs ["weirdo_direction"=3]
## Layer 3 (Y:13)
fill ~1 ~13 ~11 ~15 ~13 ~11 dark_oak_stairs ["weirdo_direction"=3]
## Layer 4 (Y:14)
fill ~2 ~14 ~12 ~14 ~14 ~12 dark_oak_stairs ["weirdo_direction"=3]
## Ridge (Y:15)
fill ~3 ~15 ~13 ~13 ~15 ~13 dark_oak_slab ["minecraft:vertical_half"="bottom"]

## --- Back slope (north-facing, stairs face north) ---
## Layer 1 (Y:11) - overhang
fill ~0 ~11 ~22 ~16 ~11 ~22 dark_oak_slab ["minecraft:vertical_half"="bottom"]
fill ~0 ~11 ~19 ~16 ~11 ~21 dark_oak_stairs ["weirdo_direction"=2]
## Layer 2 (Y:12)
fill ~0 ~12 ~17 ~16 ~12 ~18 dark_oak_stairs ["weirdo_direction"=2]
## Layer 3 (Y:13)
fill ~1 ~13 ~16 ~15 ~13 ~16 dark_oak_stairs ["weirdo_direction"=2]
## Layer 4 (Y:14)
fill ~2 ~14 ~15 ~14 ~14 ~15 dark_oak_stairs ["weirdo_direction"=2]
## Ridge cap
fill ~3 ~15 ~14 ~13 ~15 ~14 dark_oak_slab ["minecraft:vertical_half"="bottom"]

## --- Left gable wall (triangular end at X:1) ---
fill ~1 ~11 ~8 ~1 ~11 ~19 smooth_sandstone
fill ~1 ~12 ~10 ~1 ~12 ~17 smooth_sandstone
fill ~1 ~13 ~11 ~1 ~13 ~16 smooth_sandstone
fill ~1 ~14 ~12 ~1 ~14 ~15 smooth_sandstone
setblock ~1 ~15 ~13 smooth_sandstone
setblock ~1 ~15 ~14 smooth_sandstone

## --- Right gable wall (at X:15, partial - connects to garage roof area) ---
fill ~15 ~11 ~8 ~15 ~11 ~19 smooth_sandstone
fill ~15 ~12 ~10 ~15 ~12 ~17 smooth_sandstone
fill ~15 ~13 ~11 ~15 ~13 ~16 smooth_sandstone
fill ~15 ~14 ~12 ~15 ~14 ~15 smooth_sandstone
setblock ~15 ~15 ~13 smooth_sandstone
setblock ~15 ~15 ~14 smooth_sandstone

## --- Front gable (cross-gable over front center, brown board-and-batten) ---
## Triangular gable face at Z:6, X:5-11
fill ~5 ~11 ~6 ~11 ~11 ~6 spruce_planks
fill ~6 ~12 ~6 ~10 ~12 ~6 spruce_planks
fill ~7 ~13 ~6 ~9 ~13 ~6 spruce_planks
setblock ~8 ~14 ~6 spruce_planks

## Front gable roof (small cross-gable)
## Left slope
fill ~4 ~11 ~5 ~4 ~11 ~9 dark_oak_stairs ["weirdo_direction"=0]
fill ~5 ~12 ~5 ~5 ~12 ~9 dark_oak_stairs ["weirdo_direction"=0]
fill ~6 ~13 ~5 ~6 ~13 ~9 dark_oak_stairs ["weirdo_direction"=0]
fill ~7 ~14 ~5 ~7 ~14 ~9 dark_oak_stairs ["weirdo_direction"=0]
## Right slope
fill ~12 ~11 ~5 ~12 ~11 ~9 dark_oak_stairs ["weirdo_direction"=1]
fill ~11 ~12 ~5 ~11 ~12 ~9 dark_oak_stairs ["weirdo_direction"=1]
fill ~10 ~13 ~5 ~10 ~13 ~9 dark_oak_stairs ["weirdo_direction"=1]
fill ~9 ~14 ~5 ~9 ~14 ~9 dark_oak_stairs ["weirdo_direction"=1]
## Ridge
fill ~8 ~14 ~5 ~8 ~14 ~9 dark_oak_slab ["minecraft:vertical_half"="bottom"]

## === GARAGE ROOF ===
## Lower garage roof, ridge runs X direction
## Garage: X:16-25, Z:6-17, roof at Y:7

## Front slope
fill ~15 ~7 ~5 ~26 ~7 ~5 dark_oak_slab ["minecraft:vertical_half"="bottom"]
fill ~15 ~7 ~6 ~26 ~7 ~8 dark_oak_stairs ["weirdo_direction"=3]
fill ~15 ~8 ~9 ~26 ~8 ~10 dark_oak_stairs ["weirdo_direction"=3]
## Ridge
fill ~16 ~9 ~11 ~25 ~9 ~11 dark_oak_slab ["minecraft:vertical_half"="bottom"]

## Back slope
fill ~15 ~7 ~18 ~26 ~7 ~18 dark_oak_slab ["minecraft:vertical_half"="bottom"]
fill ~15 ~7 ~15 ~26 ~7 ~17 dark_oak_stairs ["weirdo_direction"=2]
fill ~15 ~8 ~13 ~26 ~8 ~14 dark_oak_stairs ["weirdo_direction"=2]
## Ridge cap
fill ~16 ~9 ~12 ~25 ~9 ~12 dark_oak_slab ["minecraft:vertical_half"="bottom"]

## Garage gable end (right side at X:25)
fill ~25 ~7 ~8 ~25 ~7 ~15 smooth_sandstone
fill ~25 ~8 ~10 ~25 ~8 ~13 smooth_sandstone
setblock ~25 ~9 ~11 smooth_sandstone
setblock ~25 ~9 ~12 smooth_sandstone
