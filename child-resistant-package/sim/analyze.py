"""Generate the figures and summary numbers quoted in the design document.

    python3 analyze.py            # writes ../docs/img/*.png and ../docs/summary.json

Requires numpy and matplotlib.
"""

from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib.colors import LinearSegmentedColormap  # noqa: E402

from governor import (  # noqa: E402
    HOME, OPEN, TRAVEL, TRIPPED, Params, noisy_push, pulses, ramp_hold, simulate,
)

OUT = Path(__file__).resolve().parent.parent / "docs"
IMG = OUT / "img"

INK, MUTED, GRID = "#1f2937", "#6b7280", "#e5e7eb"
STATE_COLOR = {HOME: "#9ca3af", TRAVEL: "#2563eb", TRIPPED: "#dc2626", OPEN: "#16a34a"}

plt.rcParams.update({
    "font.size": 9, "axes.edgecolor": MUTED, "axes.labelcolor": INK,
    "xtick.color": MUTED, "ytick.color": MUTED, "axes.titleweight": "bold",
    "axes.titlesize": 9.5, "axes.spines.top": False, "figure.dpi": 150,
})


# --------------------------------------------------------------------------
# 1. Canonical scenarios
# --------------------------------------------------------------------------

def tremor(mean: float, amp: float, hz: float = 5.0):
    return lambda t: np.asarray(mean * min(t / 0.3, 1.0) + amp * np.sin(2 * np.pi * hz * t))


SCENARIOS = [
    ("Adult, as instructed: gentle 5.5 N push", ramp_hold(5.5)),
    ("Adult, habitual firm push: 12 N", ramp_hold(12.0, ramp=0.15)),
    ("Child: repeated 30 N jabs", pulses(30.0, on=0.15, period=0.8)),
    ("Child: pushes harder as it resists (4 N + 3 N/s)", lambda t: np.asarray(4.0 + 3.0 * t)),
    ("Child: 'inching' (12 N taps, never lets go fully)", pulses(12.0, on=0.1, period=0.5, rest=1.2)),
    ("Adult with 5 Hz tremor: 5.5 N ± 2 N", tremor(5.5, 2.0)),
]


def run_scenarios(p: Params) -> list[dict]:
    fig, axes = plt.subplots(3, 2, figsize=(9.5, 7.2), sharex=True)
    rows = []
    for ax, (title, fn) in zip(axes.flat, SCENARIOS):
        r = simulate(fn, p, t_end=6.0)
        x, f, s = r.x[:, 0] * 1e3, r.force[:, 0], r.state[:, 0]
        axf = ax.twinx()
        axf.plot(r.t, f, color=MUTED, lw=0.8, alpha=0.8)
        axf.set_ylim(0, max(35, f.max() * 1.1))
        axf.set_ylabel("thumb force (N)", color=MUTED, fontsize=8)
        axf.spines["top"].set_visible(False)
        # position coloured by latch state
        for code, color in STATE_COLOR.items():
            ax.plot(r.t, np.where(s == code, x, np.nan), color=color, lw=2.0)
        ax.axhline(p.unlock_at * 1e3, color=STATE_COLOR[OPEN], ls=":", lw=0.8)
        ax.set_ylim(-0.5, 13)
        ax.set_ylabel("slider travel (mm)")
        ax.grid(axis="y", color=GRID, lw=0.6)
        ax.set_zorder(axf.get_zorder() + 1)
        ax.patch.set_visible(False)
        ok = bool(r.opened[0])
        verdict = (f"OPENS at {r.t_open[0]:.1f} s" if ok
                   else f"stays LOCKED — {r.trips[0]} trip(s), max travel {r.max_x[0]*1e3:.1f} mm")
        ax.set_title(f"{title}\n{verdict}", loc="left",
                     color=STATE_COLOR[OPEN] if ok else STATE_COLOR[TRIPPED])
        rows.append({"scenario": title, "opened": ok,
                     "t_open_s": None if not ok else round(float(r.t_open[0]), 2),
                     "trips": int(r.trips[0]), "max_travel_mm": round(float(r.max_x[0] * 1e3), 2)})
    for ax in axes[-1]:
        ax.set_xlabel("time (s)")
    handles = [plt.Line2D([], [], color=c, lw=2) for c in STATE_COLOR.values()]
    fig.legend(handles + [plt.Line2D([], [], color=MUTED, lw=0.8)],
               ["home", "travelling", "tripped (blocked)", "open", "thumb force"],
               loc="lower center", ncol=5, frameon=False)
    fig.tight_layout(rect=(0, 0.04, 1, 1))
    fig.savefig(IMG / "sim_scenarios.png")
    plt.close(fig)
    return rows


# --------------------------------------------------------------------------
# 2. Success map: who gets through a single sustained attempt?
# --------------------------------------------------------------------------

def success_map(p: Params, rng: np.random.Generator, reps: int = 120) -> dict:
    means = np.arange(1.0, 16.01, 0.5)
    cvs = np.arange(0.0, 0.601, 0.05)
    mu, cv = np.meshgrid(means, cvs, indexing="xy")
    mu_all = np.repeat(mu.ravel(), reps)
    cv_all = np.repeat(cv.ravel(), reps)
    dt = 2e-3
    r = simulate(noisy_push(mu_all, cv_all, dt, rng), p, t_end=12.0, dt=dt, record=False)
    prob = r.opened.reshape(-1, reps).mean(axis=1).reshape(mu.shape)

    cmap = LinearSegmentedColormap.from_list("gate", ["#fee2e2", "#fef9c3", "#bbf7d0", "#16a34a"])
    fig, ax = plt.subplots(figsize=(7.2, 4.0))
    im = ax.pcolormesh(means, cvs * 100, prob, cmap=cmap, vmin=0, vmax=1, shading="nearest")
    cs = ax.contour(means, cvs * 100, prob, levels=[0.1, 0.5, 0.9], colors=INK, linewidths=0.8)
    ax.clabel(cs, fmt=lambda v: f"{v:.0%}", fontsize=8)
    lo, hi = p.push_window
    for edge in (lo, hi):
        ax.axvline(edge, color=INK, ls=":", lw=0.8)
    ax.text((lo + hi) / 2, 61, "constant-force window", ha="center", va="top", fontsize=8, color=INK,
            bbox={"facecolor": "white", "edgecolor": "none", "alpha": 0.85, "pad": 1.5})
    ax.set_xlabel("mean thumb force (N)")
    ax.set_ylabel("force variability, CV (%)")
    ax.set_title("Probability that one sustained push opens the latch (press-in already solved)",
                 loc="left")
    fig.colorbar(im, ax=ax, label="P(open within 12 s)", format=lambda v, _: f"{v:.0%}")
    fig.tight_layout()
    fig.savefig(IMG / "sim_success_map.png")
    plt.close(fig)

    def at(m: float, c: float) -> float:
        i = int(np.argmin(abs(cvs - c)))
        j = int(np.argmin(abs(means - m)))
        return round(float(prob[i, j]), 3)

    return {
        "p_open_5.5N_cv10": at(5.5, 0.10),
        "p_open_5.5N_cv30": at(5.5, 0.30),
        "p_open_5.5N_cv50": at(5.5, 0.50),
        "p_open_10N_cv10": at(10.0, 0.10),
        "p_open_4N_cv10": at(4.0, 0.10),
    }


# --------------------------------------------------------------------------
# 3. Manufacturing tolerance and temperature
# --------------------------------------------------------------------------

def viscosity_factor(temp_c: np.ndarray) -> np.ndarray:
    """Silicone-oil damper torque vs temperature, normalised to 23 C (approx.)."""
    return np.exp(-0.018 * (temp_c - 23.0))


def tolerance_study(p: Params, rng: np.random.Generator, n: int = 3000) -> dict:
    temp = rng.uniform(5.0, 40.0, n)
    units = [
        replace(
            p,
            b=p.b * float(rng.lognormal(0.0, 0.10)) * float(viscosity_factor(t)),
            f_trip=p.f_trip * float(rng.normal(1.0, 0.06)),
            spring_f0=p.spring_f0 * float(rng.normal(1.0, 0.075)),
            spring_k=p.spring_k * float(rng.normal(1.0, 0.10)),
            friction=p.friction * float(rng.uniform(0.5, 1.5)),
        )
        for t in temp
    ]
    lo = np.array([u.push_window[0] for u in units])
    hi = np.array([u.push_window[1] for u in units])
    t55 = np.array([u.time_to_open(5.5) for u in units])
    returns_home = np.array([u.spring_f0 > u.friction for u in units])

    fig, (a1, a2) = plt.subplots(1, 2, figsize=(9.5, 3.4))
    bins = np.linspace(1.5, 10.5, 91)
    a1.hist(lo, bins, color="#93c5fd", label="minimum force to reach the top")
    a1.hist(hi, bins, color="#fca5a5", label="force that trips the governor")
    a1.axvspan(4.5, 6.5, color="#bbf7d0", alpha=0.6, lw=0, label="instructed 'gentle push' band")
    a1.set_xlabel("thumb force (N)")
    a1.set_ylabel(f"units (of {n})")
    a1.set_title("Operating window across toleranced units, 5–40 °C", loc="left")
    a1.legend(frameon=False, fontsize=7.5, loc="upper left")
    finite = np.isfinite(t55)
    a2.scatter(temp[finite], t55[finite], s=3, alpha=0.35, color="#2563eb", lw=0)
    a2.set_xlabel("ambient temperature (°C)")
    a2.set_ylabel("stroke time at 5.5 N (s)")
    a2.set_title("Damper viscosity sets the pace, not the gate", loc="left")
    a2.grid(color=GRID, lw=0.6)
    fig.tight_layout()
    fig.savefig(IMG / "sim_tolerance.png")
    plt.close(fig)

    q = lambda a, k: round(float(np.percentile(a, k)), 2)  # noqa: E731
    return {
        "units": n,
        "window_low_N_p1_p50_p99": [q(lo, 1), q(lo, 50), q(lo, 99)],
        "window_high_N_p1_p50_p99": [q(hi, 1), q(hi, 50), q(hi, 99)],
        "share_opening_at_5.5N": round(float(finite.mean()), 4),
        "share_tripping_at_10N": round(float((hi < 10.0).mean()), 4),
        "stroke_time_at_5.5N_s_p1_p50_p99": [q(t55[finite], 1), q(t55[finite], 50), q(t55[finite], 99)],
        "share_return_spring_beats_friction": round(float(returns_home.mean()), 4),
    }


def main() -> None:
    IMG.mkdir(parents=True, exist_ok=True)
    p = Params()
    rng = np.random.default_rng(20260924)
    lo, hi = p.push_window
    summary = {
        "nominal": {
            "push_window_N": [round(lo, 2), round(hi, 2)],
            "trip_speed_mm_s": round(p.v_trip * 1e3, 2),
            "stroke_time_s": {f"{f:.1f}N": round(p.time_to_open(f), 2) for f in (4.0, 5.0, 5.5, 6.0, 7.0, 8.0)},
            "damper_torque_Ncm_at_20rpm": round(p.b * p.r_pinion ** 2 * (20 * 2 * np.pi / 60) * 100, 2),
            "trip_torque_Ncm": round(p.f_trip * p.r_pinion * 100, 2),
        },
        "scenarios": run_scenarios(p),
        "success_map": success_map(p, rng),
        "tolerance": tolerance_study(p, rng),
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
