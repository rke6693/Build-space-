"""Behavioural tests for the governor model.  Run: python3 -m unittest -v"""

import unittest
from dataclasses import replace

import numpy as np

from governor import OPEN, TRIPPED, Params, noisy_push, pulses, ramp_hold, simulate


class GovernorTest(unittest.TestCase):
    p = Params()

    def test_gentle_steady_push_opens(self):
        r = simulate(ramp_hold(5.5), self.p, t_end=8)
        self.assertTrue(r.opened[0])
        self.assertEqual(r.trips[0], 0)
        self.assertAlmostEqual(r.t_open[0], self.p.time_to_open(5.5) + 0.15, delta=0.3)

    def test_firm_push_trips_early(self):
        r = simulate(ramp_hold(12.0, ramp=0.15), self.p, t_end=5)
        self.assertFalse(r.opened[0])
        self.assertEqual(r.trips[0], 1)
        self.assertLessEqual(r.max_x[0], 2 * self.p.pitch)

    def test_trip_is_latched_until_full_release(self):
        # 12 N taps with a 1.2 N rest: friction holds the slider, so it never
        # gets home and the carrier stays tripped - no inching progress.
        r = simulate(pulses(12.0, on=0.1, period=0.5, rest=1.2), self.p, t_end=5)
        self.assertFalse(r.opened[0])
        self.assertEqual(r.trips[0], 1)
        self.assertTrue((r.state[-1] == TRIPPED).all())
        self.assertLessEqual(r.max_x[0], 2 * self.p.pitch)

    def test_full_release_resets_and_each_jab_trips_again(self):
        r = simulate(pulses(30.0, on=0.15, period=0.8), self.p, t_end=4)
        self.assertFalse(r.opened[0])
        self.assertEqual(r.trips[0], 5)  # one trip per jab: t = 0, 0.8, ..., 3.2
        self.assertLessEqual(r.max_x[0], 2 * self.p.pitch)

    def test_gentle_after_trip_and_release_opens(self):
        def f(t):
            if t < 0.3:
                return np.asarray(15.0)  # trip
            if t < 1.0:
                return np.asarray(0.0)   # let go -> slider returns home, re-arms
            return np.asarray(5.5)
        r = simulate(f, self.p, t_end=6)
        self.assertEqual(r.trips[0], 1)
        self.assertTrue(r.opened[0])

    def test_home_detent_needs_press_in(self):
        r = simulate(ramp_hold(5.5), self.p, press_fn=lambda t: np.asarray(2.0), t_end=5)
        self.assertEqual(r.max_x[0], 0.0)
        r = simulate(ramp_hold(5.5), self.p, press_fn=lambda t: np.asarray(6.0 if t < 0.5 else 0.0),
                     t_end=6)
        self.assertTrue(r.opened[0], "press-in is only needed to leave home")

    def test_window_width_is_independent_of_friction(self):
        widths = {round(replace(self.p, friction=f).push_window[1]
                        - replace(self.p, friction=f).push_window[0], 9) for f in (0.3, 0.8, 1.4)}
        self.assertEqual(len(widths), 1)

    def test_viscosity_changes_time_not_window(self):
        cold = replace(self.p, b=self.p.b * 1.5)
        self.assertEqual(cold.push_window, self.p.push_window)
        self.assertAlmostEqual(cold.time_to_open(5.5) / self.p.time_to_open(5.5), 1.5, places=6)

    def test_population_matches_constant_force_window(self):
        lo, hi = self.p.push_window
        forces = np.array([lo - 0.2, lo + 0.3, (lo + hi) / 2, hi - 0.3, hi + 0.3])
        r = simulate(lambda t: forces * min(t / 0.3, 1.0), self.p, t_end=30, dt=1e-3, record=False)
        self.assertEqual(r.opened.tolist(), [False, True, True, True, False])

    def test_unsteady_push_fails_more_often(self):
        rng = np.random.default_rng(0)
        n = 300
        mean = np.full(2 * n, 5.5)
        cv = np.r_[np.full(n, 0.1), np.full(n, 0.45)]
        r = simulate(noisy_push(mean, cv, 2e-3, rng), self.p, t_end=12, dt=2e-3, record=False)
        steady, shaky = r.opened[:n].mean(), r.opened[n:].mean()
        self.assertGreater(steady, 0.95)
        self.assertLess(shaky, 0.35)

    def test_open_is_terminal(self):
        r = simulate(ramp_hold(5.5), self.p, t_end=6)
        first = int(np.argmax(r.state[:, 0] == OPEN))
        self.assertTrue((r.state[first:, 0] == OPEN).all())


if __name__ == "__main__":
    unittest.main()
