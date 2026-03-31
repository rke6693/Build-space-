## Garage Structure - Attached 2-car garage
## Garage: X:16-25, Z:6-17, Y:1-6

## --- OUTER WALLS (cream siding) ---
## Front wall
fill ~16 ~1 ~6 ~25 ~6 ~6 smooth_sandstone
## Back wall
fill ~16 ~1 ~17 ~25 ~6 ~17 smooth_sandstone
## Right wall
fill ~25 ~1 ~6 ~25 ~6 ~17 smooth_sandstone
## Left wall shared with main house (partial - above connection)
fill ~16 ~1 ~17 ~16 ~6 ~21 smooth_sandstone

## --- INTERIOR AIR ---
fill ~17 ~1 ~7 ~24 ~5 ~16 air

## --- GARAGE FLOOR (concrete) ---
fill ~17 ~0 ~7 ~24 ~0 ~16 smooth_stone

## --- CEILING ---
fill ~16 ~6 ~6 ~25 ~6 ~17 oak_planks

## --- GARAGE DOOR (front face, large opening with quartz panels) ---
## Two-car garage door opening
fill ~17 ~1 ~6 ~23 ~4 ~6 air
## Garage door panels (smooth quartz to simulate white sectional door)
fill ~17 ~1 ~6 ~23 ~4 ~6 smooth_quartz
## Horizontal lines in garage door (iron bars simulate panel divisions)
fill ~17 ~2 ~6 ~23 ~2 ~6 iron_bars
fill ~17 ~4 ~6 ~23 ~4 ~6 quartz_block

## --- GARAGE DOOR FRAME (white trim) ---
setblock ~16 ~1 ~6 quartz_block
setblock ~16 ~2 ~6 quartz_block
setblock ~16 ~3 ~6 quartz_block
setblock ~16 ~4 ~6 quartz_block
setblock ~16 ~5 ~6 quartz_block
setblock ~24 ~1 ~6 quartz_block
setblock ~24 ~2 ~6 quartz_block
setblock ~24 ~3 ~6 quartz_block
setblock ~24 ~4 ~6 quartz_block
setblock ~24 ~5 ~6 quartz_block
fill ~16 ~5 ~6 ~24 ~5 ~6 quartz_block

## --- WHITE TRIM ---
fill ~16 ~6 ~6 ~25 ~6 ~6 quartz_block
fill ~25 ~6 ~6 ~25 ~6 ~17 quartz_block
fill ~16 ~6 ~17 ~25 ~6 ~17 quartz_block

## --- "AVAILABLE NOW" SIGN (dark banner as accent) ---
setblock ~19 ~5 ~5 standing_banner 0
setblock ~20 ~5 ~5 standing_banner 0
setblock ~21 ~5 ~5 standing_banner 0
