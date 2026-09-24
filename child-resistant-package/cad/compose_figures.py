"""Post-process OpenSCAD renders for the docs.

    python3 compose_figures.py RAW_DIR

Trims the background off the renders in ../docs/img and assembles the four
governor section renders in RAW_DIR into one labelled figure. The section
renders are orthographic and fill the cassette's bounding box once trimmed,
so labels can be placed in model coordinates (mm).
"""

import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

IMG = Path(__file__).resolve().parent.parent / "docs" / "img"
# Cassette section extent: frame +/-20 mm plus the 0.8 mm snap bumps, Z 0..52.
EXTENT = (-20.8, 20.8, 0.0, 52.0)
INK, MUTED = "#1f2937", "#6b7280"


def trim(img: Image.Image, pad: int = 0) -> Image.Image:
    a = np.asarray(img.convert("RGB")).astype(int)
    bg = a[0, 0]
    mask = (abs(a - bg).sum(axis=2) > 24)
    ys, xs = np.nonzero(mask)
    box = (max(xs.min() - pad, 0), max(ys.min() - pad, 0),
           min(xs.max() + 1 + pad, a.shape[1]), min(ys.max() + 1 + pad, a.shape[0]))
    return img.crop(box)


STATES = [
    ("home", "1  At rest: armed",
     "Carrier held by its preload flexure;\nreset lug keeps the pawl clear."),
    ("sliding", "2  Gentle push: travelling",
     "Damper torque stays below the\ntrip torque; pawl rides clear."),
    ("tripped", "3  Hard push: tripped",
     "Reaction torque swings the carrier\nover the detent; pawl blocks the\nratchet until the slider goes home."),
    ("open", "4  Full stroke: released",
     "Horn cams the barb off the ledge;\nlid pops. Closing the lid re-latches it."),
]

LABELS = [  # text, arrow tip (x, z) in mm, side
    ("memory detent", (-15.0, 38.3), "L"),
    ("damper carrier", (-16.4, 31.0), "L"),
    ("rack + pinion", (-9.6, 27.0), "L"),
    ("pawl finger", (-7.4, 21.9), "L"),
    ("preload flexure", (-15.3, 18.5), "L"),
    ("ratchet", (-6.3, 13.0), "L"),
    ("lid tongue + barb", (1.0, 43.2), "R"),
    ("return spring", (2.2, 34.0), "R"),
    ("reset lug", (-6.3, 21.6), "R"),
    ("slider", (3.0, 12.0), "R"),
]
LABEL_X = {"L": -23.5, "R": 23.5}
HOME_XLIM = (-44, 40)
PANEL_XLIM = (-22, 22)


def governor_figure(raw: Path) -> None:
    ratios = [(HOME_XLIM[1] - HOME_XLIM[0]) / (PANEL_XLIM[1] - PANEL_XLIM[0]), 1, 1, 1]
    fig, axes = plt.subplots(1, 4, figsize=(16, 5.6), gridspec_kw={"width_ratios": ratios})
    for ax, (name, title, caption) in zip(axes, STATES):
        img = trim(Image.open(raw / f"gov_{name}.png"))
        ax.imshow(img, extent=EXTENT, interpolation="lanczos")
        ax.set_xlim(*(HOME_XLIM if name == "home" else PANEL_XLIM))
        ax.set_ylim(-9, 55)
        ax.set_axis_off()
        ax.text(0, 54, title, ha="center", fontsize=11, fontweight="bold", color=INK)
        ax.text(0, -2, caption, va="top", ha="center", fontsize=8.5, color=MUTED)
    home = axes[0]
    rows = {"L": 0, "R": 0}
    for text, tip, side in LABELS:
        z = 44 - rows[side] * 6.5
        rows[side] += 1
        x = LABEL_X[side]
        home.annotate(text, xy=tip, xytext=(x + (-1 if side == "L" else 1) * 0.5, z),
                      fontsize=8.5, color=INK, ha="right" if side == "L" else "left", va="center",
                      arrowprops={"arrowstyle": "-", "color": INK, "lw": 0.6, "shrinkA": 2, "shrinkB": 0,
                                  "connectionstyle": "angle,angleA=0,angleB=70,rad=0"})
        home.plot(*tip, "o", ms=2.5, color=INK)
    axes[2].add_patch(plt.Circle((-6.3, 21.2), 2.4, fill=False, color="#dc2626", lw=1.6))
    axes[3].add_patch(plt.Circle((0, 44), 3.2, fill=False, color="#16a34a", lw=1.6))
    fig.subplots_adjust(left=0.005, right=0.995, top=0.97, bottom=0.02, wspace=0.04)
    fig.savefig(IMG / "cad_governor_states.png", dpi=150)
    plt.close(fig)
    print("wrote", IMG / "cad_governor_states.png")


def main() -> None:
    raw = Path(sys.argv[1])
    for name in ("cad_assembly_closed", "cad_assembly_open", "cad_exploded", "cad_cassette"):
        p = IMG / f"{name}.png"
        if p.exists():
            trim(Image.open(p), pad=24).save(p)
            print("trimmed", p)
    governor_figure(raw)


if __name__ == "__main__":
    main()
