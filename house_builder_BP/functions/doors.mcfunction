## Doors - Front door, back door, interior doors

## === FRONT DOOR (dark oak, centered in porch area) ===
## Door opening
setblock ~4 ~1 ~6 air
setblock ~4 ~2 ~6 air
## Place dark oak door (facing south, toward player)
setblock ~4 ~1 ~6 dark_oak_door ["direction"=0,"upper_block_bit"=false,"open_bit"=false]
setblock ~4 ~2 ~6 dark_oak_door ["direction"=0,"upper_block_bit"=true,"open_bit"=false]

## === BACK DOOR (sliding glass door to deck) ===
## Opening already created by deck function
## Place glass panes as sliding door
setblock ~4 ~1 ~21 glass_pane
setblock ~4 ~2 ~21 glass_pane
setblock ~5 ~1 ~21 air
setblock ~5 ~2 ~21 air

## === GARAGE INTERIOR DOOR (connects garage to house) ===
setblock ~15 ~1 ~12 air
setblock ~15 ~2 ~12 air
setblock ~15 ~1 ~12 oak_door ["direction"=1,"upper_block_bit"=false,"open_bit"=false]
setblock ~15 ~2 ~12 oak_door ["direction"=1,"upper_block_bit"=true,"open_bit"=false]
