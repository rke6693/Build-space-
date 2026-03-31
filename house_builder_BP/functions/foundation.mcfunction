## Foundation - Stone base under the entire house
## Main house footprint: X:1-15, Z:6-21
## Garage footprint: X:16-25, Z:6-17

## Main house foundation slab
fill ~1 ~-1 ~6 ~15 ~0 ~21 stone_bricks
fill ~1 ~-2 ~6 ~15 ~-2 ~21 stone

## Garage foundation slab
fill ~16 ~-1 ~6 ~25 ~0 ~17 stone_bricks
fill ~16 ~-2 ~6 ~25 ~-2 ~17 stone

## Visible foundation band (tan/brown at base, like the photo)
## Front of main house
fill ~1 ~0 ~6 ~15 ~0 ~6 smooth_sandstone
## Front of garage
fill ~16 ~0 ~6 ~25 ~0 ~6 smooth_sandstone
## Left side
fill ~1 ~0 ~6 ~1 ~0 ~21 smooth_sandstone
## Right side
fill ~25 ~0 ~6 ~25 ~0 ~17 smooth_sandstone
## Back of main house
fill ~1 ~0 ~21 ~15 ~0 ~21 smooth_sandstone
## Back of garage
fill ~25 ~0 ~17 ~16 ~0 ~17 smooth_sandstone

## Basement windows on back (visible in rear photo)
setblock ~5 ~0 ~21 glass_pane
setblock ~11 ~0 ~21 glass_pane
