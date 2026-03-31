## Back Deck - Small wooden deck with stairs (visible in rear photo)
## Located on the back-left of the house
## Deck area: X:2-7, Z:22-24, Y:0-1

## --- DECK PLATFORM ---
fill ~2 ~0 ~22 ~7 ~0 ~24 oak_planks

## --- DECK SUPPORT POSTS ---
setblock ~2 ~-1 ~22 oak_fence
setblock ~2 ~-1 ~24 oak_fence
setblock ~7 ~-1 ~22 oak_fence
setblock ~7 ~-1 ~24 oak_fence

## --- DECK RAILING (oak fence) ---
## Back railing
fill ~2 ~1 ~24 ~7 ~1 ~24 oak_fence
## Left railing
fill ~2 ~1 ~22 ~2 ~1 ~24 oak_fence
## Right railing
fill ~7 ~1 ~22 ~7 ~1 ~24 oak_fence

## --- DECK STAIRS (going down from deck to ground, facing away from house) ---
setblock ~4 ~0 ~25 oak_stairs ["weirdo_direction"=3]
setblock ~5 ~0 ~25 oak_stairs ["weirdo_direction"=3]
setblock ~4 ~-1 ~26 oak_stairs ["weirdo_direction"=3]
setblock ~5 ~-1 ~26 oak_stairs ["weirdo_direction"=3]

## --- STAIR RAILING ---
fill ~3 ~1 ~22 ~3 ~1 ~26 oak_fence
fill ~6 ~1 ~22 ~6 ~1 ~26 oak_fence

## --- DECK ENTRY (opening in house wall for back door) ---
setblock ~4 ~1 ~21 air
setblock ~4 ~2 ~21 air
setblock ~5 ~1 ~21 air
setblock ~5 ~2 ~21 air
