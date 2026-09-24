"""Quasi-static model of the TortoiseLatch slow-push governor.

The slider is pushed by the user's thumb against a return spring, Coulomb
friction and a one-way rotary damper (via rack and pinion). The damper's
reaction torque rotates a spring-preloaded carrier; when the damper force
exceeds ``f_trip`` the carrier snaps over a detent into the TRIPPED state and
its pawl blocks the slider at the next ratchet tooth. The carrier is only
re-armed by the reset lug when the slider returns fully home.

Slider mass is ~4 g against ~700 N*s/m of damping, so the inertial time
constant is a few microseconds. The model is therefore first-order: velocity
follows algebraically from the force balance at every step.

All quantities are SI (N, m, s) unless a name says otherwise.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Callable

import numpy as np


@dataclass(frozen=True)
class Params:
    stroke: float = 12.0e-3          # full slider travel
    unlock_at: float = 11.2e-3       # wedge lifts the lid hook off its ledge here
    b: float = 700.0                 # damping, opening direction (N*s/m, rack-equivalent)
    b_return: float = 25.0           # residual drag when the one-way clutch free-wheels
    spring_f0: float = 1.5           # return-spring force at home
    spring_k: float = 50.0           # return-spring rate (N/m)
    friction: float = 0.8            # Coulomb friction in the slider track
    f_trip: float = 6.0              # damper force that trips the governor (= T_trip / r_pinion)
    tau_gov: float = 4.0e-3          # carrier response time (low-pass on damper force)
    press_release: float = 5.0       # press-in force that clears the home detent
    pitch: float = 0.8e-3            # ratchet tooth pitch
    home_tol: float = 0.3e-3         # reset lug holds the carrier disarmed below this
    r_pinion: float = 3.0e-3         # pinion pitch radius (module 0.5, z = 12)

    @property
    def v_trip(self) -> float:
        """Opening speed at which the governor trips."""
        return self.f_trip / self.b

    @property
    def push_window(self) -> tuple[float, float]:
        """Constant thumb force range that opens the latch without tripping.

        Lower edge: enough to reach the top of the stroke.
        Upper edge: trips at home, where the spring force is lowest.
        Friction cancels out of the width: width = f_trip - spring_k * stroke.
        """
        lo = self.spring_f0 + self.spring_k * self.unlock_at + self.friction
        hi = self.spring_f0 + self.friction + self.f_trip
        return lo, hi

    def time_to_open(self, force: float, n: int = 400) -> float:
        """Stroke time under a constant thumb force; inf if it stalls or trips."""
        lo, hi = self.push_window
        if not lo < force < hi:
            return float("inf")
        x = np.linspace(0.0, self.unlock_at, n)
        net = force - self.spring_f0 - self.spring_k * x - self.friction
        return float(np.trapezoid(self.b / net, x))


# Latch states reported in Result.state
HOME, TRAVEL, TRIPPED, OPEN = 0, 1, 2, 3
STATE_NAMES = {HOME: "home", TRAVEL: "travel", TRIPPED: "tripped", OPEN: "open"}


@dataclass
class Result:
    t: np.ndarray            # (steps,)
    x: np.ndarray            # (steps, n) slider position
    force: np.ndarray        # (steps, n) thumb force
    state: np.ndarray        # (steps, n) latch state
    opened: np.ndarray       # (n,) bool
    t_open: np.ndarray       # (n,) time of opening, nan if never
    trips: np.ndarray        # (n,) number of governor trips
    max_x: np.ndarray        # (n,) furthest travel reached


ForceFn = Callable[[float], np.ndarray]


def simulate(
    force_fn: ForceFn,
    params: Params | list[Params] = Params(),
    press_fn: ForceFn | None = None,
    t_end: float = 15.0,
    dt: float = 5e-4,
    record: bool = True,
) -> Result:
    """Integrate one or many latch units in parallel.

    ``force_fn(t)`` returns the thumb force along the stroke for every unit
    (array of shape (n,) or a scalar). ``press_fn(t)`` returns the inward
    press force on the pad; by default the press-in is assumed to be solved
    (a conservative assumption when modelling children).
    ``params`` may be a list to simulate a population of toleranced units.
    """
    plist = params if isinstance(params, list) else None
    f0 = np.atleast_1d(force_fn(0.0)).astype(float)
    n = len(plist) if plist else f0.size

    def col(name: str) -> np.ndarray:
        if plist:
            return np.array([getattr(p, name) for p in plist])
        return np.full(n, getattr(params, name))

    stroke, unlock_at = col("stroke"), col("unlock_at")
    b, b_ret = col("b"), col("b_return")
    s0, sk, fr = col("spring_f0"), col("spring_k"), col("friction")
    f_trip, tau = col("f_trip"), col("tau_gov")
    press_rel, pitch, home_tol = col("press_release"), col("pitch"), col("home_tol")
    alpha = 1.0 - np.exp(-dt / tau)

    steps = int(round(t_end / dt)) + 1
    t = np.arange(steps) * dt
    x = np.zeros(n)
    f_filt = np.zeros(n)
    tripped = np.zeros(n, bool)
    opened = np.zeros(n, bool)
    block_x = np.full(n, np.inf)
    t_open = np.full(n, np.nan)
    trips = np.zeros(n, int)
    max_x = np.zeros(n)

    xs = np.zeros((steps, n)) if record else np.zeros((0, n))
    fs = np.zeros((steps, n)) if record else np.zeros((0, n))
    st = np.zeros((steps, n), np.int8) if record else np.zeros((0, n), np.int8)

    for i in range(steps):
        ti = t[i]
        F = np.broadcast_to(np.maximum(np.asarray(force_fn(ti), float), 0.0), (n,))
        P = np.full(n, 6.0) if press_fn is None else np.broadcast_to(press_fn(ti), (n,))
        live = ~opened

        drive = F - s0 - sk * x
        fwd = drive > fr
        back = drive < -fr
        v = np.where(fwd, (drive - fr) / b, np.where(back, (drive + fr) / b_ret, 0.0))

        at_home = x <= home_tol
        held_by_detent = at_home & (P < press_rel) & (v > 0)
        blocked = tripped & (x >= block_x - 1e-12) & (v > 0)
        v = np.where(held_by_detent | blocked | ~live, 0.0, v)

        f_damp = np.where(v > 0, b * v, 0.0)
        f_filt += alpha * (f_damp - f_filt)
        new_trip = live & ~tripped & ~at_home & (v > 0) & (f_filt >= f_trip)
        block_x = np.where(new_trip, (np.floor(x / pitch) + 1) * pitch, block_x)
        tripped |= new_trip
        trips += new_trip

        x_new = x + v * dt
        x_new = np.where(tripped, np.minimum(x_new, block_x), x_new)
        x_new = np.clip(x_new, 0.0, stroke)
        returning_home = (x_new <= home_tol) & (v < 0)
        x_new = np.where(returning_home, 0.0, x_new)
        # Reset lug re-arms the carrier whenever the slider is home.
        reset = x_new <= home_tol
        tripped &= ~reset
        block_x = np.where(reset, np.inf, block_x)

        just_opened = live & ~tripped & (x_new >= unlock_at)
        t_open = np.where(just_opened, ti, t_open)
        opened |= just_opened
        x = x_new
        max_x = np.maximum(max_x, x)

        if record:
            xs[i], fs[i] = x, F
            st[i] = np.where(opened, OPEN, np.where(tripped, TRIPPED,
                             np.where(x <= home_tol, HOME, TRAVEL)))
        if opened.all():
            if record:
                xs[i + 1:], fs[i + 1:], st[i + 1:] = x, F, OPEN
            break

    return Result(t, xs, fs, st, opened, t_open, trips, max_x)


# --------------------------------------------------------------------------
# Input profiles
# --------------------------------------------------------------------------

def ramp_hold(level: float, ramp: float = 0.3, start: float = 0.0) -> ForceFn:
    """Force that ramps linearly to ``level`` and holds."""
    def f(t: float) -> np.ndarray:
        return np.asarray(level * np.clip((t - start) / ramp, 0.0, 1.0))
    return f


class OUNoise:
    """Unit-variance Ornstein-Uhlenbeck noise, generated step by step.

    Calls must come in non-decreasing time order (as ``simulate`` makes them);
    the process is advanced by as many ``dt`` steps as have elapsed.
    """

    def __init__(self, n: int, dt: float, tau: float, rng: np.random.Generator):
        self.a = np.exp(-dt / tau)
        self.kick = np.sqrt(1 - self.a * self.a)
        self.dt, self.rng = dt, rng
        self.k = 0
        self.value = rng.standard_normal(n)

    def at(self, t: float) -> np.ndarray:
        target = int(round(t / self.dt))
        while self.k < target:
            self.value = self.a * self.value + self.kick * self.rng.standard_normal(self.value.size)
            self.k += 1
        return self.value


def noisy_push(mean: np.ndarray, cv: np.ndarray, dt: float, rng: np.random.Generator,
               tau: float = 0.3, ramp: float = 0.3) -> ForceFn:
    """Sustained push with slow force wander: mean * (1 + cv * OU noise)."""
    mean, cv = np.asarray(mean, float), np.asarray(cv, float)
    noise = OUNoise(max(mean.size, cv.size), dt, tau, rng)

    def f(t: float) -> np.ndarray:
        return mean * min(t / ramp, 1.0) * (1.0 + cv * noise.at(t))
    return f


def pulses(level: float, on: float, period: float, rest: float = 0.0) -> ForceFn:
    """Repeated square pushes of ``level`` lasting ``on`` every ``period``."""
    def f(t: float) -> np.ndarray:
        return np.asarray(level if (t % period) < on else rest)
    return f


def with_params(**changes: float) -> Params:
    return replace(Params(), **changes)
