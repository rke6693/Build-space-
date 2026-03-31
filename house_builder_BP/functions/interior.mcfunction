## Interior Layout - Rooms, stairs, and furnishings
## Main house interior: X:2-14, Z:7-20

## ============================================
## FIRST FLOOR INTERIOR
## ============================================

## --- STAIRCASE (center of house, going up) ---
## Staircase location: X:8-9, Z:11-16
## Stair wall
fill ~7 ~1 ~11 ~7 ~5 ~16 white_concrete
fill ~10 ~1 ~11 ~10 ~5 ~16 white_concrete

## Stairs going up (oak stairs facing north/+Z)
setblock ~8 ~1 ~11 oak_stairs ["weirdo_direction"=3]
setblock ~9 ~1 ~11 oak_stairs ["weirdo_direction"=3]
setblock ~8 ~2 ~12 oak_stairs ["weirdo_direction"=3]
setblock ~9 ~2 ~12 oak_stairs ["weirdo_direction"=3]
setblock ~8 ~3 ~13 oak_stairs ["weirdo_direction"=3]
setblock ~9 ~3 ~13 oak_stairs ["weirdo_direction"=3]
setblock ~8 ~4 ~14 oak_stairs ["weirdo_direction"=3]
setblock ~9 ~4 ~14 oak_stairs ["weirdo_direction"=3]
## Landing
fill ~8 ~5 ~15 ~9 ~5 ~16 oak_planks

## Remove ceiling above stairwell for access
fill ~8 ~5 ~11 ~9 ~5 ~14 air

## --- LIVING ROOM DIVIDER WALL ---
fill ~7 ~1 ~10 ~14 ~4 ~10 white_concrete
## Doorway in divider
fill ~11 ~1 ~10 ~12 ~3 ~10 air

## --- KITCHEN AREA (back right) ---
## Kitchen counter (smooth stone along back wall)
fill ~11 ~1 ~19 ~14 ~1 ~20 smooth_stone
## Kitchen island
fill ~11 ~1 ~16 ~13 ~1 ~16 smooth_stone

## --- ENTRY FOYER ---
## Nothing blocking - open to living room

## ============================================
## SECOND FLOOR INTERIOR
## ============================================

## --- HALLWAY (center) ---
## Hallway walls
fill ~7 ~6 ~10 ~7 ~9 ~18 white_concrete
fill ~10 ~6 ~10 ~10 ~9 ~18 white_concrete
## Hallway floor (already oak planks from ceiling)
## Doorways to rooms
fill ~7 ~6 ~12 ~7 ~8 ~12 air
fill ~10 ~6 ~12 ~10 ~8 ~12 air
fill ~7 ~6 ~16 ~7 ~8 ~16 air
fill ~10 ~6 ~16 ~10 ~8 ~16 air

## --- BEDROOM WALLS ---
## Front-left bedroom wall
fill ~2 ~6 ~10 ~7 ~9 ~10 white_concrete
fill ~4 ~6 ~10 ~5 ~8 ~10 air

## Front-right bedroom wall
fill ~10 ~6 ~10 ~14 ~9 ~10 white_concrete
fill ~12 ~6 ~10 ~13 ~8 ~10 air

## Back bedroom divider
fill ~7 ~6 ~18 ~10 ~9 ~18 white_concrete
fill ~8 ~6 ~18 ~9 ~8 ~18 air

## --- BATHROOM (small room upstairs) ---
fill ~2 ~6 ~14 ~6 ~9 ~14 white_concrete
fill ~4 ~6 ~14 ~5 ~8 ~14 air

## ============================================
## LIGHTING (throughout interior)
## ============================================
## First floor lights
setblock ~4 ~4 ~9 sea_lantern
setblock ~11 ~4 ~9 sea_lantern
setblock ~4 ~4 ~17 sea_lantern
setblock ~11 ~4 ~17 sea_lantern

## Second floor lights
setblock ~4 ~9 ~8 sea_lantern
setblock ~12 ~9 ~8 sea_lantern
setblock ~4 ~9 ~17 sea_lantern
setblock ~12 ~9 ~17 sea_lantern

## Garage light
setblock ~20 ~5 ~11 sea_lantern

## Stairwell light
setblock ~8 ~9 ~13 sea_lantern
