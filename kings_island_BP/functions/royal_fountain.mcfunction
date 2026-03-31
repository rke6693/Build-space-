## Royal Fountain - Iconic water fountain at the base of the Eiffel Tower
## Centered at X:0, Z:115

## === OUTER POOL (octagonal shape) ===
## Main circular pool basin
fill ~-10 ~-1 ~105 ~10 ~-1 ~115 smooth_stone
fill ~-8 ~-1 ~103 ~8 ~-1 ~117 smooth_stone
fill ~-6 ~-1 ~102 ~6 ~-1 ~118 smooth_stone

## Pool walls (raised edge)
fill ~-10 ~0 ~105 ~-10 ~0 ~115 smooth_stone_slab ["minecraft:vertical_half"="bottom"]
fill ~10 ~0 ~105 ~10 ~0 ~115 smooth_stone_slab ["minecraft:vertical_half"="bottom"]
fill ~-8 ~0 ~103 ~8 ~0 ~103 smooth_stone_slab ["minecraft:vertical_half"="bottom"]
fill ~-8 ~0 ~117 ~8 ~0 ~117 smooth_stone_slab ["minecraft:vertical_half"="bottom"]
fill ~-10 ~0 ~105 ~-8 ~0 ~103 smooth_stone_slab ["minecraft:vertical_half"="bottom"]
fill ~10 ~0 ~105 ~8 ~0 ~103 smooth_stone_slab ["minecraft:vertical_half"="bottom"]
fill ~-10 ~0 ~115 ~-8 ~0 ~117 smooth_stone_slab ["minecraft:vertical_half"="bottom"]
fill ~10 ~0 ~115 ~8 ~0 ~117 smooth_stone_slab ["minecraft:vertical_half"="bottom"]

## Water fill
fill ~-9 ~-1 ~104 ~9 ~-1 ~116 water
fill ~-7 ~-1 ~102 ~7 ~-1 ~118 water

## === INNER FOUNTAIN RING ===
fill ~-4 ~0 ~107 ~4 ~0 ~113 quartz_block
fill ~-3 ~0 ~106 ~3 ~0 ~114 quartz_block
## Inner pool
fill ~-3 ~-1 ~107 ~3 ~-1 ~113 water
fill ~-2 ~-1 ~106 ~2 ~-1 ~114 water

## === CENTER FOUNTAIN JET (water column) ===
## Center pedestal
fill ~-1 ~0 ~109 ~1 ~2 ~111 quartz_pillar ["pillar_axis"="y"]
## Water jets (water source blocks stacked for height)
setblock ~0 ~3 ~110 water
setblock ~0 ~4 ~110 water
setblock ~0 ~5 ~110 water
## Side jets
setblock ~-3 ~1 ~110 water
setblock ~3 ~1 ~110 water
setblock ~0 ~1 ~107 water
setblock ~0 ~1 ~113 water

## === DECORATIVE ELEMENTS ===
## Corner light pillars
fill ~-8 ~0 ~104 ~-8 ~2 ~104 quartz_pillar ["pillar_axis"="y"]
setblock ~-8 ~3 ~104 sea_lantern
fill ~8 ~0 ~104 ~8 ~2 ~104 quartz_pillar ["pillar_axis"="y"]
setblock ~8 ~3 ~104 sea_lantern
fill ~-8 ~0 ~116 ~-8 ~2 ~116 quartz_pillar ["pillar_axis"="y"]
setblock ~-8 ~3 ~116 sea_lantern
fill ~8 ~0 ~116 ~8 ~2 ~116 quartz_pillar ["pillar_axis"="y"]
setblock ~8 ~3 ~116 sea_lantern

## Benches around fountain
setblock ~-12 ~1 ~110 stone_brick_stairs ["weirdo_direction"=0]
setblock ~12 ~1 ~110 stone_brick_stairs ["weirdo_direction"=1]
setblock ~0 ~1 ~100 stone_brick_stairs ["weirdo_direction"=3]
setblock ~0 ~1 ~120 stone_brick_stairs ["weirdo_direction"=2]

say Royal Fountain complete with kinetic water!
