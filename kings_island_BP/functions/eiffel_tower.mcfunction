## Eiffel Tower - 1/3 scale replica, ~85 blocks tall
## Centered at X:0, Z:130

## === BASE LEGS (4 legs, angled inward) ===
## Each leg starts 12 blocks from center and tapers in

## --- Southwest Leg (X:-12, Z:118) to (X:-3, Z:127) ---
fill ~-12 ~0 ~118 ~-10 ~5 ~120 iron_block
fill ~-11 ~6 ~119 ~-9 ~12 ~121 iron_block
fill ~-10 ~13 ~120 ~-8 ~20 ~123 iron_block
fill ~-9 ~21 ~122 ~-7 ~28 ~125 iron_block
fill ~-8 ~29 ~124 ~-5 ~35 ~127 iron_block

## --- Southeast Leg (X:10, Z:118) to (X:3, Z:127) ---
fill ~10 ~0 ~118 ~12 ~5 ~120 iron_block
fill ~9 ~6 ~119 ~11 ~12 ~121 iron_block
fill ~8 ~13 ~120 ~10 ~20 ~123 iron_block
fill ~7 ~21 ~122 ~9 ~28 ~125 iron_block
fill ~5 ~29 ~124 ~8 ~35 ~127 iron_block

## --- Northwest Leg (X:-12, Z:140) to (X:-3, Z:133) ---
fill ~-12 ~0 ~140 ~-10 ~5 ~142 iron_block
fill ~-11 ~6 ~139 ~-9 ~12 ~141 iron_block
fill ~-10 ~13 ~137 ~-8 ~20 ~140 iron_block
fill ~-9 ~21 ~135 ~-7 ~28 ~138 iron_block
fill ~-8 ~29 ~133 ~-5 ~35 ~135 iron_block

## --- Northeast Leg (X:10, Z:140) to (X:3, Z:133) ---
fill ~10 ~0 ~140 ~12 ~5 ~142 iron_block
fill ~9 ~6 ~139 ~11 ~12 ~141 iron_block
fill ~8 ~13 ~137 ~10 ~20 ~140 iron_block
fill ~7 ~21 ~135 ~9 ~28 ~138 iron_block
fill ~5 ~29 ~133 ~8 ~35 ~135 iron_block

## === FIRST OBSERVATION DECK (Y:35) ===
fill ~-8 ~35 ~124 ~8 ~35 ~136 iron_block
fill ~-7 ~36 ~125 ~7 ~36 ~135 smooth_stone
## Railing
fill ~-8 ~37 ~124 ~8 ~37 ~124 iron_bars
fill ~-8 ~37 ~136 ~8 ~37 ~136 iron_bars
fill ~-8 ~37 ~124 ~-8 ~37 ~136 iron_bars
fill ~8 ~37 ~124 ~8 ~37 ~136 iron_bars
## Interior air
fill ~-6 ~36 ~126 ~6 ~36 ~134 air

## === MIDDLE SHAFT (Y:36-55) ===
## Four posts continuing upward, narrowing
fill ~-5 ~36 ~126 ~-4 ~55 ~127 iron_block
fill ~4 ~36 ~126 ~5 ~55 ~127 iron_block
fill ~-5 ~36 ~133 ~-4 ~55 ~134 iron_block
fill ~4 ~36 ~133 ~5 ~55 ~134 iron_block

## Cross bracing (iron bars)
fill ~-3 ~40 ~127 ~3 ~40 ~127 iron_bars
fill ~-3 ~40 ~133 ~3 ~40 ~133 iron_bars
fill ~-4 ~40 ~128 ~-4 ~40 ~132 iron_bars
fill ~4 ~40 ~128 ~4 ~40 ~132 iron_bars

fill ~-3 ~48 ~127 ~3 ~48 ~127 iron_bars
fill ~-3 ~48 ~133 ~3 ~48 ~133 iron_bars
fill ~-4 ~48 ~128 ~-4 ~48 ~132 iron_bars
fill ~4 ~48 ~128 ~4 ~48 ~132 iron_bars

## === SECOND OBSERVATION DECK (Y:55) ===
fill ~-6 ~55 ~125 ~6 ~55 ~135 iron_block
fill ~-5 ~56 ~126 ~5 ~56 ~134 smooth_stone
## Railing
fill ~-6 ~57 ~125 ~6 ~57 ~125 iron_bars
fill ~-6 ~57 ~135 ~6 ~57 ~135 iron_bars
fill ~-6 ~57 ~125 ~-6 ~57 ~135 iron_bars
fill ~6 ~57 ~125 ~6 ~57 ~135 iron_bars

## === UPPER SHAFT (Y:56-80) ===
fill ~-3 ~56 ~128 ~-2 ~80 ~129 iron_block
fill ~2 ~56 ~128 ~3 ~80 ~129 iron_block
fill ~-3 ~56 ~131 ~-2 ~80 ~132 iron_block
fill ~2 ~56 ~131 ~3 ~80 ~132 iron_block

## Cross bracing
fill ~-1 ~65 ~129 ~1 ~65 ~129 iron_bars
fill ~-1 ~65 ~131 ~1 ~65 ~131 iron_bars
fill ~-2 ~65 ~130 ~2 ~65 ~130 iron_bars

fill ~-1 ~75 ~129 ~1 ~75 ~129 iron_bars
fill ~-1 ~75 ~131 ~1 ~75 ~131 iron_bars
fill ~-2 ~75 ~130 ~2 ~75 ~130 iron_bars

## === TOP OBSERVATION DECK (Y:80) ===
fill ~-4 ~80 ~127 ~4 ~80 ~133 iron_block
fill ~-3 ~81 ~128 ~3 ~81 ~132 smooth_stone
## Railing
fill ~-4 ~82 ~127 ~4 ~82 ~127 iron_bars
fill ~-4 ~82 ~133 ~4 ~82 ~133 iron_bars
fill ~-4 ~82 ~127 ~-4 ~82 ~133 iron_bars
fill ~4 ~82 ~127 ~4 ~82 ~133 iron_bars

## === ANTENNA SPIRE (Y:81-90) ===
fill ~-1 ~81 ~130 ~1 ~90 ~130 iron_bars
fill ~0 ~81 ~129 ~0 ~90 ~131 iron_bars
setblock ~0 ~91 ~130 redstone_lamp
setblock ~0 ~92 ~130 lightning_rod

## === TOWER LIGHTING ===
setblock ~-7 ~36 ~125 sea_lantern
setblock ~7 ~36 ~125 sea_lantern
setblock ~-7 ~36 ~135 sea_lantern
setblock ~7 ~36 ~135 sea_lantern
setblock ~-5 ~56 ~126 sea_lantern
setblock ~5 ~56 ~126 sea_lantern
setblock ~-5 ~56 ~134 sea_lantern
setblock ~5 ~56 ~134 sea_lantern
setblock ~-3 ~81 ~128 sea_lantern
setblock ~3 ~81 ~128 sea_lantern
setblock ~-3 ~81 ~132 sea_lantern
setblock ~3 ~81 ~132 sea_lantern

## === ELEVATOR SHAFT (center, climbable ladders) ===
fill ~0 ~1 ~130 ~0 ~80 ~130 ladder ["facing_direction"=3]
fill ~0 ~0 ~129 ~0 ~80 ~129 iron_block

say Eiffel Tower complete! Climb the ladder at the center to reach observation decks.
