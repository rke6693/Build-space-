## THE BEAST - World's longest wooden roller coaster
## Rideable minecart coaster through dense forest
## Location: X:-30 to 60, Z:250-340
## Features: Two lift hills, underground tunnel, banked helix

## === STATION BUILDING ===
fill ~-10 ~0 ~255 ~0 ~5 ~260 spruce_planks
fill ~-9 ~5 ~255 ~-1 ~5 ~260 spruce_slab ["minecraft:vertical_half"="bottom"]
## Station platform
fill ~-8 ~1 ~256 ~-2 ~1 ~259 oak_planks
## Queue entrance
setblock ~-8 ~1 ~255 oak_fence_gate ["direction"=0]
## Sign
setblock ~-5 ~4 ~255 wall_sign ["facing_direction"=3]
## Station roof
fill ~-10 ~6 ~254 ~0 ~6 ~261 dark_oak_slab ["minecraft:vertical_half"="bottom"]

## === MINECART SPAWNER (hop in to ride!) ===
setblock ~-5 ~2 ~258 golden_rail ["rail_direction"=0,"rail_data_bit"=true]
setblock ~-5 ~1 ~258 redstone_block

## === LIFT HILL 1 (Z:258 heading east, climbing to Y:30) ===
## Track base heading out of station
setblock ~-4 ~2 ~258 golden_rail ["rail_direction"=0,"rail_data_bit"=true]
setblock ~-3 ~2 ~258 rail ["rail_direction"=0]
setblock ~-2 ~2 ~258 golden_rail ["rail_direction"=0,"rail_data_bit"=true]

## Start climbing - supported wooden structure
## Y:2 to Y:30, heading +X direction
## Support structure (wooden trestle)
fill ~0 ~0 ~257 ~28 ~0 ~259 spruce_planks
fill ~0 ~0 ~257 ~0 ~2 ~259 spruce_log
fill ~4 ~0 ~257 ~4 ~6 ~259 spruce_log
fill ~8 ~0 ~257 ~8 ~10 ~259 spruce_log
fill ~12 ~0 ~257 ~12 ~14 ~259 spruce_log
fill ~16 ~0 ~257 ~16 ~18 ~259 spruce_log
fill ~20 ~0 ~257 ~20 ~22 ~259 spruce_log
fill ~24 ~0 ~257 ~24 ~26 ~259 spruce_log
fill ~28 ~0 ~257 ~28 ~30 ~259 spruce_log

## Cross braces
fill ~2 ~2 ~258 ~6 ~2 ~258 spruce_fence
fill ~6 ~6 ~258 ~10 ~6 ~258 spruce_fence
fill ~10 ~10 ~258 ~14 ~10 ~258 spruce_fence
fill ~14 ~14 ~258 ~18 ~14 ~258 spruce_fence
fill ~18 ~18 ~258 ~22 ~18 ~258 spruce_fence
fill ~22 ~22 ~258 ~26 ~22 ~258 spruce_fence

## Lift hill track (powered rails going uphill)
## Each block goes up 1 and forward 1
setblock ~0 ~3 ~258 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~0 ~2 ~258 redstone_block
setblock ~1 ~4 ~258 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~1 ~3 ~258 redstone_block
setblock ~2 ~5 ~258 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~2 ~4 ~258 redstone_block
setblock ~3 ~6 ~258 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~3 ~5 ~258 redstone_block
setblock ~4 ~7 ~258 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~4 ~6 ~258 redstone_block
setblock ~5 ~8 ~258 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~5 ~7 ~258 redstone_block
setblock ~6 ~9 ~258 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~6 ~8 ~258 redstone_block
setblock ~7 ~10 ~258 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~7 ~9 ~258 redstone_block
setblock ~8 ~11 ~258 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~8 ~10 ~258 redstone_block
setblock ~9 ~12 ~258 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~9 ~11 ~258 redstone_block
setblock ~10 ~13 ~258 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~10 ~12 ~258 redstone_block
setblock ~11 ~14 ~258 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~11 ~13 ~258 redstone_block
setblock ~12 ~15 ~258 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~12 ~14 ~258 redstone_block
setblock ~13 ~16 ~258 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~13 ~15 ~258 redstone_block
setblock ~14 ~17 ~258 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~14 ~16 ~258 redstone_block
setblock ~15 ~18 ~258 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~15 ~17 ~258 redstone_block
setblock ~16 ~19 ~258 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~16 ~18 ~258 redstone_block
setblock ~17 ~20 ~258 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~17 ~19 ~258 redstone_block
setblock ~18 ~21 ~258 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~18 ~20 ~258 redstone_block
setblock ~19 ~22 ~258 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~19 ~21 ~258 redstone_block
setblock ~20 ~23 ~258 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~20 ~22 ~258 redstone_block
setblock ~21 ~24 ~258 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~21 ~23 ~258 redstone_block
setblock ~22 ~25 ~258 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~22 ~24 ~258 redstone_block
setblock ~23 ~26 ~258 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~23 ~25 ~258 redstone_block
setblock ~24 ~27 ~258 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~24 ~26 ~258 redstone_block
setblock ~25 ~28 ~258 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~25 ~27 ~258 redstone_block
setblock ~26 ~29 ~258 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~26 ~28 ~258 redstone_block
setblock ~27 ~30 ~258 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~27 ~29 ~258 redstone_block
setblock ~28 ~31 ~258 rail ["rail_direction"=0]
setblock ~28 ~30 ~258 spruce_planks

## === FIRST DROP (Y:31 down to Y:2, turning north) ===
## Top of hill - flat section
setblock ~29 ~31 ~258 rail ["rail_direction"=0]
setblock ~29 ~30 ~258 spruce_planks
setblock ~30 ~31 ~258 rail ["rail_direction"=7]
setblock ~30 ~30 ~258 spruce_planks

## Turn north and DROP
setblock ~30 ~31 ~259 rail ["rail_direction"=1]
setblock ~30 ~30 ~259 spruce_planks
setblock ~30 ~30 ~260 rail ["rail_direction"=5]
setblock ~30 ~29 ~260 spruce_planks
setblock ~30 ~29 ~261 rail ["rail_direction"=5]
setblock ~30 ~28 ~261 spruce_planks
setblock ~30 ~28 ~262 rail ["rail_direction"=5]
setblock ~30 ~27 ~262 spruce_planks
setblock ~30 ~27 ~263 rail ["rail_direction"=5]
setblock ~30 ~26 ~263 spruce_planks
setblock ~30 ~26 ~264 rail ["rail_direction"=5]
setblock ~30 ~25 ~264 spruce_planks
setblock ~30 ~25 ~265 rail ["rail_direction"=5]
setblock ~30 ~24 ~265 spruce_planks
setblock ~30 ~24 ~266 rail ["rail_direction"=5]
setblock ~30 ~23 ~266 spruce_planks
setblock ~30 ~23 ~267 rail ["rail_direction"=5]
setblock ~30 ~22 ~267 spruce_planks
setblock ~30 ~22 ~268 rail ["rail_direction"=5]
setblock ~30 ~21 ~268 spruce_planks
setblock ~30 ~21 ~269 rail ["rail_direction"=5]
setblock ~30 ~20 ~269 spruce_planks
setblock ~30 ~20 ~270 rail ["rail_direction"=5]
setblock ~30 ~19 ~270 spruce_planks
setblock ~30 ~19 ~271 rail ["rail_direction"=5]
setblock ~30 ~18 ~271 spruce_planks
setblock ~30 ~18 ~272 rail ["rail_direction"=5]
setblock ~30 ~17 ~272 spruce_planks
setblock ~30 ~17 ~273 rail ["rail_direction"=5]
setblock ~30 ~16 ~273 spruce_planks
setblock ~30 ~16 ~274 rail ["rail_direction"=5]
setblock ~30 ~15 ~274 spruce_planks
setblock ~30 ~15 ~275 rail ["rail_direction"=5]
setblock ~30 ~14 ~275 spruce_planks
setblock ~30 ~14 ~276 rail ["rail_direction"=5]
setblock ~30 ~13 ~276 spruce_planks
setblock ~30 ~13 ~277 rail ["rail_direction"=1]
setblock ~30 ~12 ~277 spruce_planks

## === VALLEY RUN (low section through forest) ===
## Flat/gentle track through woods at Y:12
fill ~30 ~12 ~278 ~30 ~12 ~300 spruce_planks
fill ~30 ~13 ~278 ~30 ~13 ~290 golden_rail ["rail_direction"=1,"rail_data_bit"=true]
fill ~30 ~12 ~278 ~30 ~12 ~290 redstone_block
fill ~30 ~13 ~291 ~30 ~13 ~300 rail ["rail_direction"=1]

## Forest around the track (dense trees)
fill ~27 ~0 ~260 ~27 ~5 ~260 spruce_log
fill ~25 ~4 ~258 ~29 ~7 ~262 spruce_leaves
fill ~33 ~0 ~265 ~33 ~5 ~265 spruce_log
fill ~31 ~4 ~263 ~35 ~7 ~267 spruce_leaves
fill ~27 ~0 ~275 ~27 ~6 ~275 spruce_log
fill ~25 ~5 ~273 ~29 ~8 ~277 spruce_leaves
fill ~33 ~0 ~280 ~33 ~6 ~280 spruce_log
fill ~31 ~5 ~278 ~35 ~8 ~282 spruce_leaves
fill ~27 ~0 ~290 ~27 ~5 ~290 spruce_log
fill ~25 ~4 ~288 ~29 ~7 ~292 spruce_leaves
fill ~33 ~0 ~295 ~33 ~5 ~295 spruce_log
fill ~31 ~4 ~293 ~35 ~7 ~297 spruce_leaves

## === UNDERGROUND TUNNEL ===
## Tunnel entrance
fill ~29 ~12 ~300 ~31 ~15 ~300 spruce_planks
fill ~30 ~13 ~300 ~30 ~14 ~300 air
## Tunnel section (underground)
fill ~29 ~11 ~301 ~31 ~15 ~320 stone
fill ~30 ~12 ~301 ~30 ~14 ~320 air
fill ~30 ~12 ~301 ~30 ~12 ~320 spruce_planks
fill ~30 ~13 ~301 ~30 ~13 ~320 golden_rail ["rail_direction"=1,"rail_data_bit"=true]
fill ~30 ~12 ~301 ~30 ~12 ~320 redstone_block
## Tunnel exit
fill ~29 ~12 ~321 ~31 ~15 ~321 spruce_planks
fill ~30 ~13 ~321 ~30 ~14 ~321 air

## === TURN AND SECOND LIFT HILL ===
## Turn west
setblock ~30 ~13 ~321 rail ["rail_direction"=9]
setblock ~30 ~12 ~321 spruce_planks
## Track heading west (-X)
fill ~10 ~12 ~321 ~29 ~12 ~321 spruce_planks
fill ~10 ~13 ~321 ~29 ~13 ~321 golden_rail ["rail_direction"=0,"rail_data_bit"=true]
fill ~10 ~12 ~321 ~29 ~12 ~321 redstone_block

## Second lift hill (climbing back up, heading west)
## Supports
fill ~8 ~0 ~320 ~8 ~14 ~322 spruce_log
fill ~4 ~0 ~320 ~4 ~18 ~322 spruce_log
fill ~0 ~0 ~320 ~0 ~22 ~322 spruce_log

setblock ~9 ~14 ~321 golden_rail ["rail_direction"=3,"rail_data_bit"=true]
setblock ~9 ~13 ~321 redstone_block
setblock ~8 ~15 ~321 golden_rail ["rail_direction"=3,"rail_data_bit"=true]
setblock ~8 ~14 ~321 redstone_block
setblock ~7 ~16 ~321 golden_rail ["rail_direction"=3,"rail_data_bit"=true]
setblock ~7 ~15 ~321 redstone_block
setblock ~6 ~17 ~321 golden_rail ["rail_direction"=3,"rail_data_bit"=true]
setblock ~6 ~16 ~321 redstone_block
setblock ~5 ~18 ~321 golden_rail ["rail_direction"=3,"rail_data_bit"=true]
setblock ~5 ~17 ~321 redstone_block
setblock ~4 ~19 ~321 golden_rail ["rail_direction"=3,"rail_data_bit"=true]
setblock ~4 ~18 ~321 redstone_block
setblock ~3 ~20 ~321 golden_rail ["rail_direction"=3,"rail_data_bit"=true]
setblock ~3 ~19 ~321 redstone_block
setblock ~2 ~21 ~321 golden_rail ["rail_direction"=3,"rail_data_bit"=true]
setblock ~2 ~20 ~321 redstone_block
setblock ~1 ~22 ~321 golden_rail ["rail_direction"=3,"rail_data_bit"=true]
setblock ~1 ~21 ~321 redstone_block
setblock ~0 ~23 ~321 rail ["rail_direction"=0]
setblock ~0 ~22 ~321 spruce_planks

## === SECOND DROP AND HELIX ===
## Turn south and drop
setblock ~-1 ~23 ~321 rail ["rail_direction"=6]
setblock ~-1 ~22 ~321 spruce_planks
setblock ~-1 ~23 ~320 rail ["rail_direction"=4]
setblock ~-1 ~22 ~320 spruce_planks
setblock ~-1 ~22 ~319 rail ["rail_direction"=4]
setblock ~-1 ~21 ~319 spruce_planks
setblock ~-1 ~21 ~318 rail ["rail_direction"=4]
setblock ~-1 ~20 ~318 spruce_planks
setblock ~-1 ~20 ~317 rail ["rail_direction"=4]
setblock ~-1 ~19 ~317 spruce_planks
setblock ~-1 ~19 ~316 rail ["rail_direction"=4]
setblock ~-1 ~18 ~316 spruce_planks
setblock ~-1 ~18 ~315 rail ["rail_direction"=4]
setblock ~-1 ~17 ~315 spruce_planks
setblock ~-1 ~17 ~314 rail ["rail_direction"=4]
setblock ~-1 ~16 ~314 spruce_planks
setblock ~-1 ~16 ~313 rail ["rail_direction"=4]
setblock ~-1 ~15 ~313 spruce_planks

## Helix (spiraling circle at low level)
## Banked turn going around in a circle
setblock ~-1 ~15 ~312 rail ["rail_direction"=1]
setblock ~-1 ~14 ~312 spruce_planks
setblock ~-1 ~14 ~311 rail ["rail_direction"=8]
setblock ~-1 ~13 ~311 spruce_planks
setblock ~-2 ~14 ~311 rail ["rail_direction"=0]
setblock ~-2 ~13 ~311 spruce_planks
setblock ~-3 ~14 ~311 rail ["rail_direction"=9]
setblock ~-3 ~13 ~311 spruce_planks
setblock ~-3 ~14 ~312 rail ["rail_direction"=1]
setblock ~-3 ~13 ~312 spruce_planks
setblock ~-3 ~13 ~313 rail ["rail_direction"=4]
setblock ~-3 ~12 ~313 spruce_planks
setblock ~-3 ~12 ~314 rail ["rail_direction"=7]
setblock ~-3 ~11 ~314 spruce_planks
setblock ~-2 ~12 ~314 rail ["rail_direction"=0]
setblock ~-2 ~11 ~314 spruce_planks
setblock ~-1 ~12 ~314 rail ["rail_direction"=6]
setblock ~-1 ~11 ~314 spruce_planks
setblock ~-1 ~12 ~313 golden_rail ["rail_direction"=1,"rail_data_bit"=true]
setblock ~-1 ~11 ~313 redstone_block

## === RETURN TO STATION (brake run) ===
## Head back west to station area
setblock ~-1 ~12 ~312 rail ["rail_direction"=8]
setblock ~-1 ~11 ~312 spruce_planks

## Long flat brake run back to station
fill ~-2 ~11 ~258 ~-2 ~11 ~312 spruce_planks
fill ~-2 ~12 ~259 ~-2 ~12 ~311 golden_rail ["rail_direction"=1,"rail_data_bit"=true]
fill ~-2 ~11 ~259 ~-2 ~11 ~311 redstone_block

setblock ~-2 ~12 ~312 rail ["rail_direction"=9]
setblock ~-2 ~11 ~312 spruce_planks

## Connect to station
setblock ~-2 ~12 ~258 rail ["rail_direction"=6]
setblock ~-2 ~11 ~258 spruce_planks
setblock ~-3 ~12 ~258 golden_rail ["rail_direction"=0,"rail_data_bit"=true]
setblock ~-3 ~11 ~258 redstone_block
setblock ~-4 ~12 ~258 golden_rail ["rail_direction"=0,"rail_data_bit"=true]
setblock ~-4 ~11 ~258 redstone_block

## Station return track (lower level)
fill ~-5 ~1 ~258 ~-5 ~1 ~258 spruce_planks
setblock ~-5 ~2 ~258 activator_rail ["rail_direction"=0,"rail_data_bit"=true]

## === BEAST ENTRANCE SIGN ===
fill ~-12 ~0 ~253 ~2 ~7 ~253 spruce_planks
fill ~-11 ~1 ~253 ~1 ~6 ~253 dark_oak_planks
setblock ~-5 ~4 ~252 wall_sign ["facing_direction"=3]

## Wooden fence queue line
fill ~-10 ~1 ~254 ~-6 ~1 ~254 spruce_fence
fill ~-2 ~1 ~254 ~2 ~1 ~254 spruce_fence

say The Beast complete! Find the minecart at the station to ride!
