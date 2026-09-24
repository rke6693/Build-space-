#!/usr/bin/env bash
# Render documentation images and export printable STLs.
#   ./render.sh          # PNGs into ../docs/img
#   ./render.sh stl      # STLs into ./stl
# Needs OpenSCAD 2021.01+; on a headless machine it runs under xvfb-run if present.
set -euo pipefail
cd "$(dirname "$0")"
SCAD=tortoise_latch.scad
IMG=../docs/img
RUN=(openscad)
if [[ -z "${DISPLAY:-}" ]] && command -v xvfb-run >/dev/null; then RUN=(xvfb-run -a openscad); fi

png() { # path size camera [defines...]
  local out=$1 size=$2 cam=$3; shift 3
  "${RUN[@]}" -o "$out" --imgsize="$size" --camera="$cam" --viewall --autocenter \
    --colorscheme=Tomorrow "$@" "$SCAD" 2>/dev/null
  echo "rendered $out"
}

if [[ "${1:-}" == "stl" ]]; then
  mkdir -p stl
  for p in frame back_cover slider carrier tub lid; do
    openscad -D "part=\"$p\"" -o "stl/$p.stl" "$SCAD" 2>/dev/null
    echo "exported stl/$p.stl"
  done
  exit 0
fi

mkdir -p "$IMG"
ISO=170,-230,150,0,20,40
FRONT=0,-300,26,0,0,26
png $IMG/cad_assembly_closed.png 1200,900 "$ISO" -D 'part="assembly"'
png $IMG/cad_assembly_open.png 1200,900 "$ISO" -D 'part="assembly"' -D lid_angle=70 -D slide=12
png $IMG/cad_exploded.png 1600,900 40,-320,170,-40,0,40 -D 'part="exploded"'
png $IMG/cad_cassette.png 1000,1000 120,-160,110,0,10,26 -D 'part="cassette"'
RAW=$(mktemp -d)
trap 'rm -rf "$RAW"' EXIT
for st in "home 0 false" "sliding 6 false" "tripped 1.4 true" "open 12 false"; do
  set -- $st
  png "$RAW/gov_$1.png" 800,1000 "$FRONT" --projection=ortho -D 'part="governor"' -D slide=$2 -D tripped=$3
done
python3 compose_figures.py "$RAW"
