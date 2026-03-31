## ORION - Giga Coaster (B&M), 300ft tall, 91mph
## Location: Area 72, X:80-160, Z:200-300
## Steel blue track on white supports

## === STATION BUILDING (Area 72 themed - futuristic/military) ===
fill ~85 ~0 ~205 ~105 ~6 ~215 gray_concrete
fill ~86 ~6 ~206 ~104 ~6 ~214 cyan_concrete
## Corrugated roof
fill ~84 ~7 ~204 ~106 ~7 ~216 gray_concrete
## Station interior
fill ~87 ~1 ~207 ~103 ~5 ~213 air
## Platform
fill ~87 ~0 ~209 ~103 ~1 ~211 smooth_stone
## Windows (tinted)
fill ~85 ~2 ~207 ~85 ~4 ~210 cyan_stained_glass_pane
fill ~105 ~2 ~207 ~105 ~4 ~210 cyan_stained_glass_pane
## Military-style accents
fill ~85 ~5 ~205 ~105 ~5 ~205 orange_concrete
fill ~85 ~5 ~215 ~105 ~5 ~215 orange_concrete

## === MINECART SPAWNER ===
setblock ~95 ~2 ~210 golden_rail ["rail_direction"=0,"rail_data_bit"=true]
setblock ~95 ~1 ~210 redstone_block

## === LAUNCH/EXIT TRACK ===
fill ~96 ~1 ~210 ~104 ~1 ~210 smooth_stone
fill ~96 ~2 ~210 ~104 ~2 ~210 golden_rail ["rail_direction"=0,"rail_data_bit"=true]
fill ~96 ~1 ~210 ~104 ~1 ~210 redstone_block

## === LIFT HILL (300ft = ~50 blocks high) ===
## Steel support columns (white concrete, like B&M style)
fill ~106 ~0 ~210 ~106 ~4 ~210 white_concrete
fill ~110 ~0 ~210 ~110 ~10 ~210 white_concrete
fill ~114 ~0 ~210 ~114 ~16 ~210 white_concrete
fill ~118 ~0 ~210 ~118 ~22 ~210 white_concrete
fill ~122 ~0 ~210 ~122 ~28 ~210 white_concrete
fill ~126 ~0 ~210 ~126 ~34 ~210 white_concrete
fill ~130 ~0 ~210 ~130 ~40 ~210 white_concrete
fill ~134 ~0 ~210 ~134 ~46 ~210 white_concrete
fill ~138 ~0 ~210 ~138 ~50 ~210 white_concrete

## Cross bracing on supports
fill ~108 ~4 ~210 ~112 ~4 ~210 white_concrete
fill ~112 ~10 ~210 ~116 ~10 ~210 white_concrete
fill ~116 ~16 ~210 ~120 ~16 ~210 white_concrete
fill ~120 ~22 ~210 ~124 ~22 ~210 white_concrete
fill ~124 ~28 ~210 ~128 ~28 ~210 white_concrete
fill ~128 ~34 ~210 ~132 ~34 ~210 white_concrete
fill ~132 ~40 ~210 ~136 ~40 ~210 white_concrete

## Track - powered rail climbing up
setblock ~105 ~3 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~105 ~2 ~210 redstone_block
setblock ~106 ~4 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~106 ~3 ~210 redstone_block
setblock ~107 ~5 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~107 ~4 ~210 redstone_block
setblock ~108 ~6 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~108 ~5 ~210 redstone_block
setblock ~109 ~7 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~109 ~6 ~210 redstone_block
setblock ~110 ~8 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~110 ~7 ~210 redstone_block
setblock ~111 ~9 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~111 ~8 ~210 redstone_block
setblock ~112 ~10 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~112 ~9 ~210 redstone_block
setblock ~113 ~11 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~113 ~10 ~210 redstone_block
setblock ~114 ~12 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~114 ~11 ~210 redstone_block
setblock ~115 ~13 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~115 ~12 ~210 redstone_block
setblock ~116 ~14 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~116 ~13 ~210 redstone_block
setblock ~117 ~15 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~117 ~14 ~210 redstone_block
setblock ~118 ~16 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~118 ~15 ~210 redstone_block
setblock ~119 ~17 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~119 ~16 ~210 redstone_block
setblock ~120 ~18 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~120 ~17 ~210 redstone_block
setblock ~121 ~19 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~121 ~18 ~210 redstone_block
setblock ~122 ~20 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~122 ~19 ~210 redstone_block
setblock ~123 ~21 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~123 ~20 ~210 redstone_block
setblock ~124 ~22 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~124 ~21 ~210 redstone_block
setblock ~125 ~23 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~125 ~22 ~210 redstone_block
setblock ~126 ~24 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~126 ~23 ~210 redstone_block
setblock ~127 ~25 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~127 ~24 ~210 redstone_block
setblock ~128 ~26 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~128 ~25 ~210 redstone_block
setblock ~129 ~27 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~129 ~26 ~210 redstone_block
setblock ~130 ~28 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~130 ~27 ~210 redstone_block
## Continue climbing
setblock ~131 ~29 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~131 ~28 ~210 redstone_block
setblock ~132 ~30 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~132 ~29 ~210 redstone_block
setblock ~133 ~31 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~133 ~30 ~210 redstone_block
setblock ~134 ~32 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~134 ~31 ~210 redstone_block
setblock ~135 ~33 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~135 ~32 ~210 redstone_block
setblock ~136 ~34 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~136 ~33 ~210 redstone_block
setblock ~137 ~35 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~137 ~34 ~210 redstone_block
setblock ~138 ~36 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~138 ~35 ~210 redstone_block
setblock ~139 ~37 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~139 ~36 ~210 redstone_block
setblock ~140 ~38 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~140 ~37 ~210 redstone_block
setblock ~141 ~39 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~141 ~38 ~210 redstone_block
setblock ~142 ~40 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~142 ~39 ~210 redstone_block
setblock ~143 ~41 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~143 ~40 ~210 redstone_block
setblock ~144 ~42 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~144 ~41 ~210 redstone_block
setblock ~145 ~43 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~145 ~42 ~210 redstone_block
setblock ~146 ~44 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~146 ~43 ~210 redstone_block
setblock ~147 ~45 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~147 ~44 ~210 redstone_block
setblock ~148 ~46 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~148 ~45 ~210 redstone_block
setblock ~149 ~47 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~149 ~46 ~210 redstone_block
setblock ~150 ~48 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~150 ~47 ~210 redstone_block
setblock ~151 ~49 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~151 ~48 ~210 redstone_block
setblock ~152 ~50 ~210 golden_rail ["rail_direction"=2,"rail_data_bit"=true]
setblock ~152 ~49 ~210 redstone_block

## === TOP OF LIFT / PRE-DROP ===
setblock ~153 ~51 ~210 rail ["rail_direction"=0]
setblock ~153 ~50 ~210 white_concrete
setblock ~154 ~51 ~210 rail ["rail_direction"=7]
setblock ~154 ~50 ~210 white_concrete

## === FIRST DROP (300ft, ~50 blocks straight down, heading +Z) ===
setblock ~154 ~51 ~211 rail ["rail_direction"=1]
setblock ~154 ~50 ~211 white_concrete
setblock ~154 ~50 ~212 rail ["rail_direction"=5]
setblock ~154 ~49 ~212 white_concrete
setblock ~154 ~49 ~213 rail ["rail_direction"=5]
setblock ~154 ~48 ~213 white_concrete
setblock ~154 ~48 ~214 rail ["rail_direction"=5]
setblock ~154 ~47 ~214 white_concrete
setblock ~154 ~47 ~215 rail ["rail_direction"=5]
setblock ~154 ~46 ~215 white_concrete
setblock ~154 ~46 ~216 rail ["rail_direction"=5]
setblock ~154 ~45 ~216 white_concrete
setblock ~154 ~45 ~217 rail ["rail_direction"=5]
setblock ~154 ~44 ~217 white_concrete
setblock ~154 ~44 ~218 rail ["rail_direction"=5]
setblock ~154 ~43 ~218 white_concrete
setblock ~154 ~43 ~219 rail ["rail_direction"=5]
setblock ~154 ~42 ~219 white_concrete
setblock ~154 ~42 ~220 rail ["rail_direction"=5]
setblock ~154 ~41 ~220 white_concrete
setblock ~154 ~41 ~221 rail ["rail_direction"=5]
setblock ~154 ~40 ~221 white_concrete
setblock ~154 ~40 ~222 rail ["rail_direction"=5]
setblock ~154 ~39 ~222 white_concrete
setblock ~154 ~39 ~223 rail ["rail_direction"=5]
setblock ~154 ~38 ~223 white_concrete
setblock ~154 ~38 ~224 rail ["rail_direction"=5]
setblock ~154 ~37 ~224 white_concrete
setblock ~154 ~37 ~225 rail ["rail_direction"=5]
setblock ~154 ~36 ~225 white_concrete
setblock ~154 ~36 ~226 rail ["rail_direction"=5]
setblock ~154 ~35 ~226 white_concrete
setblock ~154 ~35 ~227 rail ["rail_direction"=5]
setblock ~154 ~34 ~227 white_concrete
setblock ~154 ~34 ~228 rail ["rail_direction"=5]
setblock ~154 ~33 ~228 white_concrete
setblock ~154 ~33 ~229 rail ["rail_direction"=5]
setblock ~154 ~32 ~229 white_concrete
setblock ~154 ~32 ~230 rail ["rail_direction"=5]
setblock ~154 ~31 ~230 white_concrete
setblock ~154 ~31 ~231 rail ["rail_direction"=5]
setblock ~154 ~30 ~231 white_concrete
setblock ~154 ~30 ~232 rail ["rail_direction"=5]
setblock ~154 ~29 ~232 white_concrete
setblock ~154 ~29 ~233 rail ["rail_direction"=5]
setblock ~154 ~28 ~233 white_concrete
setblock ~154 ~28 ~234 rail ["rail_direction"=5]
setblock ~154 ~27 ~234 white_concrete
setblock ~154 ~27 ~235 rail ["rail_direction"=1]
setblock ~154 ~26 ~235 white_concrete

## Valley run with speed boost
fill ~154 ~26 ~236 ~154 ~26 ~260 white_concrete
fill ~154 ~27 ~236 ~154 ~27 ~260 golden_rail ["rail_direction"=1,"rail_data_bit"=true]
fill ~154 ~26 ~236 ~154 ~26 ~260 redstone_block

## === SPEED HILL AND TURN ===
## Hill up
setblock ~154 ~28 ~261 golden_rail ["rail_direction"=5,"rail_data_bit"=true]
setblock ~154 ~27 ~261 redstone_block
setblock ~154 ~29 ~262 golden_rail ["rail_direction"=5,"rail_data_bit"=true]
setblock ~154 ~28 ~262 redstone_block
setblock ~154 ~30 ~263 golden_rail ["rail_direction"=5,"rail_data_bit"=true]
setblock ~154 ~29 ~263 redstone_block
setblock ~154 ~31 ~264 golden_rail ["rail_direction"=5,"rail_data_bit"=true]
setblock ~154 ~30 ~264 redstone_block
setblock ~154 ~32 ~265 rail ["rail_direction"=1]
setblock ~154 ~31 ~265 white_concrete

## Turn west
setblock ~154 ~32 ~266 rail ["rail_direction"=9]
setblock ~154 ~31 ~266 white_concrete

## Heading back west
fill ~120 ~31 ~266 ~153 ~31 ~266 white_concrete
fill ~120 ~32 ~266 ~153 ~32 ~266 golden_rail ["rail_direction"=0,"rail_data_bit"=true]
fill ~120 ~31 ~266 ~153 ~31 ~266 redstone_block

## Drop back down
setblock ~119 ~31 ~266 rail ["rail_direction"=3]
setblock ~119 ~30 ~266 white_concrete
setblock ~118 ~30 ~266 rail ["rail_direction"=3]
setblock ~118 ~29 ~266 white_concrete
setblock ~117 ~29 ~266 rail ["rail_direction"=3]
setblock ~117 ~28 ~266 white_concrete
setblock ~116 ~28 ~266 rail ["rail_direction"=3]
setblock ~116 ~27 ~266 white_concrete
setblock ~115 ~27 ~266 rail ["rail_direction"=3]
setblock ~115 ~26 ~266 white_concrete
setblock ~114 ~26 ~266 rail ["rail_direction"=3]
setblock ~114 ~25 ~266 white_concrete

## Turnaround heading south (-Z)
setblock ~113 ~26 ~266 rail ["rail_direction"=8]
setblock ~113 ~25 ~266 white_concrete

## Run south back toward station
fill ~113 ~25 ~220 ~113 ~25 ~265 white_concrete
fill ~113 ~26 ~220 ~113 ~26 ~265 golden_rail ["rail_direction"=1,"rail_data_bit"=true]
fill ~113 ~25 ~220 ~113 ~25 ~265 redstone_block

## Final turn west back to station
setblock ~113 ~26 ~219 rail ["rail_direction"=6]
setblock ~113 ~25 ~219 white_concrete
## Brake run
fill ~86 ~25 ~219 ~112 ~25 ~219 white_concrete
fill ~86 ~26 ~219 ~112 ~26 ~219 golden_rail ["rail_direction"=0,"rail_data_bit"=true]
fill ~86 ~25 ~219 ~112 ~25 ~219 redstone_block

## Drop down to station level
setblock ~85 ~25 ~219 rail ["rail_direction"=8]
setblock ~85 ~24 ~219 white_concrete
fill ~85 ~2 ~218 ~85 ~24 ~220 white_concrete
fill ~85 ~2 ~219 ~85 ~24 ~219 air
setblock ~85 ~3 ~219 activator_rail ["rail_direction"=1,"rail_data_bit"=true]

## === ORION ENTRANCE SIGN ===
fill ~88 ~0 ~203 ~102 ~8 ~203 gray_concrete
fill ~89 ~1 ~203 ~101 ~7 ~203 blue_concrete
fill ~90 ~2 ~202 ~100 ~6 ~202 cyan_stained_glass
setblock ~95 ~5 ~202 wall_sign ["facing_direction"=3]

say Orion giga coaster complete! 50-block lift hill with massive drop!
