"""Unit tests for sniper.strategy.decide()."""

import unittest

from sniper.config import Config, Discovery, Selectors
from sniper.dom import AuctionSnapshot
from sniper.strategy import decide


def make_cfg(**overrides) -> Config:
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
            livestream_link="a",
            livestream_title="h2",
        ),
        discovery=Discovery(
            enabled=False,
            listing_urls=[],
            max_streams=5,
            refresh_interval_seconds=30.0,
            idle_timeout_seconds=60.0,
            title_keywords=[],
            title_blocklist=[],
        ),
    )
    base.update(overrides)
    return Config(**base)


def snap(start=1.0, cur=1.0, t=1.0) -> AuctionSnapshot:
    return AuctionSnapshot(
        current_bid=cur, start_price=start, time_left=t, captured_at=0.0
    )


class TestStrategy(unittest.TestCase):
    def test_skip_when_start_price_too_high(self):
        d = decide(snap(start=5.0, t=1.0), make_cfg(), False)
        self.assertFalse(d.should_bid)
        self.assertIn("start", d.reason)

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
        self.assertEqual(d.next_bid, 2.0)

    def test_respect_max_bid(self):
        d = decide(snap(start=1.0, cur=5.0, t=1.0), make_cfg(max_bid=5.0), False)
        self.assertFalse(d.should_bid)
        self.assertIn("max", d.reason)

    def test_skip_when_leading(self):
        d = decide(snap(t=1.0), make_cfg(), already_leading=True)
        self.assertFalse(d.should_bid)
        self.assertIn("already-leading", d.reason)

    def test_no_time_data(self):
        s = AuctionSnapshot(current_bid=1.0, start_price=1.0, time_left=None, captured_at=0.0)
        d = decide(s, make_cfg(), False)
        self.assertFalse(d.should_bid)
        self.assertEqual(d.reason, "no-time")


if __name__ == "__main__":
    unittest.main()
