## Clear and flatten the entire park area
## Park footprint: ~400 x 350 blocks

## Clear air space in chunks (fill limit is 32768 blocks per command)
## Section 1: X -120 to 0
fill ~-120 ~-3 ~-10 ~0 ~120 ~170 air
fill ~-120 ~-3 ~170 ~0 ~120 ~350 air

## Section 2: X 0 to 120
fill ~0 ~-3 ~-10 ~120 ~120 ~170 air
fill ~0 ~-3 ~170 ~120 ~120 ~350 air

## Section 3: X 120 to 170
fill ~120 ~-3 ~-10 ~170 ~120 ~170 air
fill ~120 ~-3 ~170 ~170 ~120 ~350 air

## Flatten ground - grass base
fill ~-120 ~-3 ~-10 ~170 ~-1 ~350 dirt
fill ~-120 ~-1 ~-10 ~170 ~-1 ~350 grass_block

say Park area cleared and flattened.
