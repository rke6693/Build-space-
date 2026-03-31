## Windows - All windows on every side of the house
## Using glass_pane for realistic thin windows with white concrete trim

## ============================================
## FRONT FACE (Z:6) - First Floor
## ============================================
## Left window (main house, left of door)
fill ~2 ~2 ~6 ~3 ~3 ~6 glass_pane
## Right window (main house, right of porch area)
fill ~9 ~2 ~6 ~10 ~3 ~6 glass_pane
## Far right first floor window
fill ~12 ~2 ~6 ~13 ~3 ~6 glass_pane

## ============================================
## FRONT FACE (Z:6) - Second Floor
## ============================================
## Second floor left window
fill ~2 ~7 ~6 ~3 ~8 ~6 glass_pane
## Second floor center-left window (in brown gable area)
fill ~6 ~7 ~6 ~7 ~8 ~6 glass_pane
## Second floor center-right window (in brown gable area)
fill ~9 ~7 ~6 ~10 ~8 ~6 glass_pane
## Second floor far right window
fill ~12 ~7 ~6 ~13 ~8 ~6 glass_pane

## Window trim (white) for front gable windows
setblock ~5 ~7 ~6 quartz_block
setblock ~5 ~8 ~6 quartz_block
setblock ~8 ~7 ~6 quartz_block
setblock ~8 ~8 ~6 quartz_block
setblock ~11 ~7 ~6 quartz_block
setblock ~11 ~8 ~6 quartz_block
setblock ~5 ~9 ~6 quartz_block
setblock ~6 ~9 ~6 quartz_block
setblock ~7 ~9 ~6 quartz_block
setblock ~8 ~9 ~6 quartz_block
setblock ~9 ~9 ~6 quartz_block
setblock ~10 ~9 ~6 quartz_block
setblock ~11 ~9 ~6 quartz_block

## ============================================
## BACK FACE (Z:21) - First Floor
## ============================================
## Back sliding door area (handled by deck function)
## Back left window
fill ~7 ~2 ~21 ~8 ~3 ~21 glass_pane
## Back center window
fill ~10 ~2 ~21 ~11 ~3 ~21 glass_pane
## Back right window
fill ~13 ~2 ~21 ~14 ~3 ~21 glass_pane

## ============================================
## BACK FACE (Z:21) - Second Floor
## ============================================
## Back second floor left window pair
fill ~3 ~7 ~21 ~4 ~8 ~21 glass_pane
## Back second floor center-left
fill ~7 ~7 ~21 ~8 ~8 ~21 glass_pane
## Back second floor center
fill ~10 ~7 ~21 ~11 ~8 ~21 glass_pane
## Back second floor right
fill ~13 ~7 ~21 ~14 ~8 ~21 glass_pane

## ============================================
## LEFT FACE (X:1) - First Floor
## ============================================
fill ~1 ~2 ~9 ~1 ~3 ~10 glass_pane
fill ~1 ~2 ~14 ~1 ~3 ~15 glass_pane
fill ~1 ~2 ~18 ~1 ~3 ~19 glass_pane

## ============================================
## LEFT FACE (X:1) - Second Floor
## ============================================
fill ~1 ~7 ~9 ~1 ~8 ~10 glass_pane
fill ~1 ~7 ~14 ~1 ~8 ~15 glass_pane
fill ~1 ~7 ~18 ~1 ~8 ~19 glass_pane

## ============================================
## RIGHT FACE / GARAGE (X:25)
## ============================================
## Garage side windows
fill ~25 ~2 ~9 ~25 ~3 ~10 glass_pane
fill ~25 ~2 ~13 ~25 ~3 ~14 glass_pane

## ============================================
## GARAGE BACK (Z:17)
## ============================================
fill ~18 ~2 ~17 ~19 ~3 ~17 glass_pane
fill ~22 ~2 ~17 ~23 ~3 ~17 glass_pane
