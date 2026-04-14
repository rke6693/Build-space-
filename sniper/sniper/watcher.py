"""A `StreamWatcher` drives a single Whatnot livestream page.

Each watcher runs as its own asyncio task: it reads the auction card on a
tight poll loop, asks the strategy layer whether to bid, and fires a snipe
when the rules say so. Watchers are independent — one bad page can't take
down the rest of the bot.

A watcher self-terminates if no auction card has been visible for
`discovery.idle_timeout_seconds`; the coordinator reaps it and (if
discovery is on) replaces it from the candidate list.
"""

from __future__ import annotations

import asyncio
import dataclasses
import time
from typing import Dict, Optional

from playwright.async_api import Page, TimeoutError as PWTimeout

from .config import Config
from .dom import AuctionSnapshot, read_auction
from .log import log
from .strategy import SnipeDecision, decide


@dataclasses.dataclass
class WatcherStats:
    snapshots: int = 0
    dollar_lots: int = 0
    snipes_attempted: int = 0
    snipes_clicked: int = 0
    last_snapshot_at: float = 0.0


class StreamWatcher:
    def __init__(self, page: Page, url: str, label: str, cfg: Config):
        self.page = page
        self.url = url
        # Keep label short — listings titles can be long and noisy.
        self.label = (label or url.rsplit("/", 1)[-1] or "stream")[:32]
        self.cfg = cfg
        self.stats = WatcherStats()
        self.fired_for: Dict[str, float] = {}
        self._stop = asyncio.Event()
        self._idle_since: Optional[float] = None

    def stop(self) -> None:
        self._stop.set()

    async def run(self) -> None:
        cfg = self.cfg
        try:
            await self.page.goto(self.url, wait_until="domcontentloaded")
        except Exception as e:
            log.warn(self.label, f"failed to open: {e}")
            return

        log.info(self.label, "watching")
        last_log = 0.0

        while not self._stop.is_set():
            loop_start = time.monotonic()

            try:
                snap = await read_auction(self.page, cfg.selectors)
            except Exception as e:
                log.warn(self.label, f"read error: {e}")
                snap = None

            if snap is None:
                # Track idle time so we self-terminate on dead streams.
                if self._idle_since is None:
                    self._idle_since = loop_start
                if (
                    loop_start - self._idle_since
                    > cfg.discovery.idle_timeout_seconds
                ):
                    log.info(self.label, "idle timeout — closing")
                    break
                if loop_start - last_log > 5:
                    log.dim(self.label, "no auction card")
                    last_log = loop_start
            else:
                self._idle_since = None
                self.stats.snapshots += 1
                self.stats.last_snapshot_at = loop_start
                if snap.is_dollar_auction(cfg.max_start_price):
                    self.stats.dollar_lots += 1

                decision = decide(snap, cfg, already_leading=False)
                if decision.should_bid or loop_start - last_log > 2.0:
                    self._log_snapshot(snap, decision)
                    last_log = loop_start

                if decision.should_bid:
                    fp = self._fingerprint(snap)
                    if fp not in self.fired_for:
                        self.fired_for[fp] = loop_start
                        await self._snipe(snap, decision)

            # Pace the loop without drifting.
            elapsed_ms = (time.monotonic() - loop_start) * 1000
            delay = max(0.0, cfg.poll_interval_ms - elapsed_ms) / 1000
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=delay)
            except asyncio.TimeoutError:
                pass

        try:
            await self.page.close()
        except Exception:
            pass
        log.info(self.label, "stopped")

    def _fingerprint(self, snap: AuctionSnapshot) -> str:
        # Lot id isn't exposed in DOM, so fingerprint by start price + a
        # ~minute bucket. Good enough to prevent double-firing on the same
        # lot, loose enough not to block the next lot in a stream.
        return f"{snap.start_price}:{int(snap.captured_at) // 60}"

    def _log_snapshot(self, snap: AuctionSnapshot, decision: SnipeDecision) -> None:
        msg = (
            f"start=${snap.start_price} bid=${snap.current_bid} "
            f"t={snap.time_left}s -> {decision.reason}"
        )
        if decision.should_bid:
            log.snipe(self.label, msg)
        else:
            log.dim(self.label, msg)

    async def _snipe(self, snap: AuctionSnapshot, decision: SnipeDecision) -> None:
        self.stats.snipes_attempted += 1
        cfg = self.cfg
        if cfg.dry_run:
            log.dryrun(self.label, f"would click bid: {decision.reason}")
            return
        try:
            btn = await self.page.query_selector(cfg.selectors.bid_button)
            if btn is None:
                log.warn(self.label, "bid button not found at snipe time")
                return
            await btn.click(no_wait_after=True)
            self.stats.snipes_clicked += 1
            log.snipe(self.label, f"BID CLICKED ${decision.next_bid:.2f}")

            if cfg.selectors.confirm_button:
                try:
                    confirm = await self.page.wait_for_selector(
                        cfg.selectors.confirm_button, timeout=500
                    )
                    if confirm:
                        await confirm.click(no_wait_after=True)
                        log.info(self.label, "confirmed")
                except PWTimeout:
                    pass  # No modal — fine.
        except Exception as e:
            log.warn(self.label, f"snipe click failed: {e}")
