"""Unit tests for the pure-logic pieces of the sniper.

These don't touch Playwright and can run in CI without a browser.
    $ python -m unittest sniper/tests/test_parsing.py
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sniper import (  # noqa: E402
    AuctionSnapshot,
    Config,
    Selectors,
    decide,
    parse_money,
    parse_time_left,
)


def make_cfg(**overrides):
    base = dict(
        dry_run=True,
        headless=True,
        user_data_dir=".profile",
        max_start_price=1.0,
        max_bid=5.0,
        min_bid_increment=1.0,
        snipe_window_open=1.8,
        snipe_window_close=0.4,
        poll_interval_ms=120,
        streams=[],
        selectors=Selectors(
            auction_root="root",
            current_bid="cb",
            start_price="sp",
            time_left="tl",
            bid_button="btn",
            confirm_button="",
        ),
    )
    base.update(overrides)
    return Config(**base)


def snap(start=1.0, cur=1.0, t=1.0):
    return AuctionSnapshot(
        current_bid=cur, start_price=start, time_left=t, captured_at=0.0
    )


class TestParsing(unittest.TestCase):
    def test_parse_money(self):
        self.assertEqual(parse_money("$1"), 1.0)
        self.assertEqual(parse_money("$12.50"), 12.50)
        self.assertEqual(parse_money("1,234.00"), 1234.00)
        self.assertEqual(parse_money("bid: $3"), 3.0)
        self.assertIsNone(parse_money(""))
        self.assertIsNone(parse_money("n/a"))

    def test_parse_time(self):
        self.assertEqual(parse_time_left("0:03"), 3)
        self.assertEqual(parse_time_left("1:23"), 83)
        self.assertEqual(parse_time_left("3s"), 3)
        self.assertEqual(parse_time_left("ended"), 0)
        self.assertIsNone(parse_time_left(""))
        self.assertIsNone(parse_time_left("--"))


class TestStrategy(unittest.TestCase):
    def test_skip_when_start_price_too_high(self):
        d = decide(snap(start=5.0, t=1.0), make_cfg(), False)
        self.assertFalse(d.should_bid)

    def test_skip_when_outside_window_early(self):
        d = decide(snap(t=5.0), make_cfg(), False)
        self.assertFalse(d.should_bid)
        self.assertIn("outside", d.reason)

    def test_skip_when_outside_window_late(self):
        d = decide(snap(t=0.1), make_cfg(), False)
        self.assertFalse(d.should_bid)

    def test_snipe_inside_window(self):
        d = decide(snap(start=1.0, cur=1.0, t=1.0), make_cfg(), False)
        self.assertTrue(d.should_bid)
        self.assertIn("SNIPE", d.reason)

    def test_respect_max_bid(self):
        d = decide(snap(start=1.0, cur=5.0, t=1.0), make_cfg(max_bid=5.0), False)
        self.assertFalse(d.should_bid)
        self.assertIn("max", d.reason)

    def test_skip_when_leading(self):
        d = decide(snap(t=1.0), make_cfg(), already_leading=True)
        self.assertFalse(d.should_bid)
        self.assertIn("already-leading", d.reason)


if __name__ == "__main__":
    unittest.main()
