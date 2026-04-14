"""Reads the live-auction card out of a Whatnot livestream page."""

from __future__ import annotations

import dataclasses
import time
from typing import Optional

from playwright.async_api import ElementHandle, Page

from .config import Selectors
from .parsing import parse_money, parse_time_left


@dataclasses.dataclass
class AuctionSnapshot:
    current_bid: Optional[float]
    start_price: Optional[float]
    time_left: Optional[float]
    captured_at: float

    def is_live(self) -> bool:
        return self.time_left is not None and self.time_left > 0

    def is_dollar_auction(self, ceiling: float) -> bool:
        return self.start_price is not None and self.start_price <= ceiling


async def read_auction(page: Page, sel: Selectors) -> Optional[AuctionSnapshot]:
    """Read the current auction card from `page`. Returns None if no card is visible."""
    root = await page.query_selector(sel.auction_root)
    if root is None:
        return None

    async def _text(selector: str) -> str:
        el: Optional[ElementHandle] = await root.query_selector(selector)
        if el is None:
            return ""
        try:
            return (await el.inner_text()).strip()
        except Exception:
            return ""

    return AuctionSnapshot(
        current_bid=parse_money(await _text(sel.current_bid)),
        start_price=parse_money(await _text(sel.start_price)),
        time_left=parse_time_left(await _text(sel.time_left)),
        captured_at=time.monotonic(),
    )
