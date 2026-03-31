## Driveway and Walkway - Concrete surfaces
## Driveway leads from street to garage door
## Walkway leads from driveway to front porch

## === DRIVEWAY (in front of garage) ===
## Main driveway pad: X:16-24, Z:0-5
fill ~16 ~-1 ~0 ~24 ~-1 ~5 light_gray_concrete

## Driveway expansion/flare at street
fill ~15 ~-1 ~0 ~25 ~-1 ~0 light_gray_concrete

## Driveway control joints (darker lines like in the photo)
## Horizontal joints
fill ~16 ~-1 ~2 ~24 ~-1 ~2 gray_concrete
fill ~16 ~-1 ~4 ~24 ~-1 ~4 gray_concrete

## Center line joint
fill ~20 ~-1 ~0 ~20 ~-1 ~5 gray_concrete

## === FRONT WALKWAY (from driveway to porch) ===
fill ~8 ~-1 ~0 ~11 ~-1 ~2 light_gray_concrete

## Walkway to porch connection
fill ~8 ~-1 ~2 ~8 ~-1 ~3 light_gray_concrete
fill ~7 ~-1 ~3 ~7 ~-1 ~3 light_gray_concrete

## === TIRE TRACKS (subtle detail from photo - use slightly different concrete) ===
fill ~17 ~-1 ~0 ~18 ~-1 ~4 gray_concrete
fill ~22 ~-1 ~0 ~23 ~-1 ~4 gray_concrete

## === STREET CURB ===
fill ~0 ~-1 ~-1 ~29 ~-1 ~-1 stone
fill ~0 ~0 ~-1 ~29 ~0 ~-1 stone_brick_wall
