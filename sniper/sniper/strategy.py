"""Snipe decision logic — pure function, no I/O.

Keeping this as a single function makes it trivial to unit-test the snipe
rules and trivial to reason about why the bot did or didn't bid on a lot.
"""

from __future__ import annotations

import dataclasses

from .config import Config
from .dom import AuctionSnapshot


@dataclasses.dataclass
class SnipeDecision:
    should_bid: bool
    reason: str
    next_bid: float = 0.0


def decide(snap: AuctionSnapshot, cfg: Config, already_leading: bool) -> SnipeDecision:
    """Should the bot click 'Bid' on this snapshot?"""
    if snap.time_left is None:
        return SnipeDecision(False, "no-time")
    if not snap.is_dollar_auction(cfg.max_start_price):
        return SnipeDecision(False, f"start>${cfg.max_start_price:g}")
    if already_leading:
        return SnipeDecision(False, "already-leading")

    next_bid = (snap.current_bid or 0) + cfg.min_bid_increment
    if next_bid > cfg.max_bid:
        return SnipeDecision(False, f"next ${next_bid:.2f} > max ${cfg.max_bid:.2f}")

    if not (cfg.snipe_window_close <= snap.time_left <= cfg.snipe_window_open):
        return SnipeDecision(False, f"t={snap.time_left:.2f}s outside snipe window")

    return SnipeDecision(
        True, f"SNIPE @ ${next_bid:.2f} (t={snap.time_left:.2f}s)", next_bid
    )
