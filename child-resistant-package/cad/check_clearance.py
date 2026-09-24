"""Static interference checks for the latch cassette (OpenSCAD CGAL booleans).

    python3 check_clearance.py

Each case intersects two parts at a given slider travel. "clear" cases must
come out empty; "contact" cases must not (they are the intended engagements).
The pinion/rack mesh is not checked because the tooth forms are simplified.
"""

import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCAD = HERE / "tortoise_latch.scad"

SLIDER = "translate([0, 0, slide]) { slider_body(); translate([0, pressed ? press_travel : 0, 0]) thumb_button(); }"
FRAME = "union() { frame_shell(); frame_features(); }"  # bare braces would not group
CASES = []  # (description, expectation, defines, part A, part B)
for s in (0, 3, 6, 9, 12):
    CASES += [
        (f"slider vs frame, travel {s} mm, pad pressed", "clear",
         {"slide": s, "pressed": "true"}, SLIDER, FRAME),
        (f"slider vs armed carrier, travel {s} mm", "clear",
         {"slide": s, "pressed": "true"}, SLIDER, "carrier();"),
    ]
CASES += [
    ("carrier body vs frame, armed", "clear", {"tripped": "false"}, "carrier(rigid_only = true);", FRAME),
    ("carrier body vs frame, tripped", "clear", {"tripped": "true"}, "carrier(rigid_only = true);", FRAME),
    ("preload flexure vs frame, armed", "clear", {"tripped": "false"}, "carrier();", FRAME),
    ("lid tongue vs slider horn, travel 9 mm", "clear", {"slide": 9}, SLIDER, "lid_tongue();"),
    ("lid tongue vs frame (lid shut)", "clear", {}, "lid_tongue();", FRAME),
    ("pad not pressed, at home: ears sit in the home pocket", "clear", {"slide": 0}, SLIDER, FRAME),
    # intended contacts
    ("pad not pressed, travel 1 mm: ears hit the pocket (home detent)", "contact",
     {"slide": 1, "pressed": "false"}, SLIDER, FRAME),
    ("tripped pawl vs ratchet, travel 1.8 mm (blocks)", "contact",
     {"slide": 1.8, "tripped": "true"}, SLIDER, "carrier();"),
    ("horn vs barb, travel 11.2 mm (releases the lid)", "contact",
     {"slide": 11.2}, SLIDER, "lid_tongue();"),
    ("preload flexure vs post, tripped (flexure bends)", "contact",
     {"tripped": "true"}, "carrier();", FRAME),
    ("tripped pawl vs reset lug at home (cannot trip at home)", "contact",
     {"slide": 0, "tripped": "true"}, SLIDER, "carrier();"),
]


def intersection_bbox(defines: dict, a: str, b: str):
    """Bounding box [(xmin, ymin, zmin), (xmax, ymax, zmax)] of A & B, or None if empty."""
    body = "\n".join(f"{k} = {v};" for k, v in defines.items())
    src = f'include <{SCAD}>\npart = "none";\n{body}\nintersection() {{ {a} {b} }}\n'
    with tempfile.TemporaryDirectory() as d:
        scad, stl = Path(d) / "case.scad", Path(d) / "case.stl"
        scad.write_text(src)
        out = subprocess.run(["openscad", "-o", str(stl), str(scad)],
                             capture_output=True, text=True, timeout=600)
        log = out.stdout + out.stderr
        if "ERROR" in log:
            raise RuntimeError(log)
        if "top level object is empty" in log:
            return None
        pts = [tuple(map(float, ln.split()[1:4])) for ln in stl.read_text().splitlines()
               if ln.strip().startswith("vertex")]
        return [tuple(min(p[i] for p in pts) for i in range(3)),
                tuple(max(p[i] for p in pts) for i in range(3))]


def main() -> int:
    failures = 0
    for desc, expect, defines, a, b in CASES:
        bbox = intersection_bbox(defines, a, b)
        ok = (bbox is None) if expect == "clear" else (bbox is not None)
        failures += not ok
        print(f"{'PASS' if ok else 'FAIL'}  [{expect:7}] {desc}")
        if not ok and bbox:
            lo, hi = bbox
            print("        overlap x %.2f..%.2f  y %.2f..%.2f  z %.2f..%.2f"
                  % (lo[0], hi[0], lo[1], hi[1], lo[2], hi[2]))
    print(f"\n{len(CASES) - failures}/{len(CASES)} checks passed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
