"""Multi-stream coordinator.

Maintains a pool of `StreamWatcher` tasks and rebalances it on a
configurable interval:

  1. Reap any watchers whose tasks finished (idle timeout, page crash,
     stream ended).
  2. If discovery is on and we have free slots, scrape the live listings
     and spawn watchers for new candidates.
  3. Print a one-line stats summary every ~10 s so it's obvious the bot
     is alive and working.

The coordinator also owns the persistent browser context, the discovery
page (reused as the login page on first run), and the stop signal used
by Ctrl-C / SIGTERM handlers.
"""

from __future__ import annotations

import asyncio
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional

from playwright.async_api import (
    BrowserContext,
    Page,
    Playwright,
    async_playwright,
)

from .config import Config
from .discovery import discover_streams
from .log import log
from .watcher import StreamWatcher


class Coordinator:
    def __init__(self, cfg: Config, manual_streams: List[str]):
        self.cfg = cfg
        self.manual_streams = manual_streams
        self.watchers: Dict[str, StreamWatcher] = {}
        self.tasks: Dict[str, asyncio.Task] = {}
        self.ctx: Optional[BrowserContext] = None
        self.discovery_page: Optional[Page] = None
        self._stop = asyncio.Event()

    # ------------------------------------------------------------------
    # Public surface
    # ------------------------------------------------------------------

    def request_stop(self) -> None:
        """Ask the coordinator to wind down. Safe to call from a signal handler."""
        self._stop.set()

    async def run(self) -> None:
        seeded = (self.manual_streams or self.cfg.streams)
        if not seeded and not self.cfg.discovery.enabled:
            log.banner(
                "No streams configured and discovery disabled. Nothing to do.",
                color="red",
            )
            return

        async with async_playwright() as pw:
            self.ctx = await self._launch(pw)

            log.banner("Whatnot $1 sniper starting.")
            log.banner(
                "A browser tab will open at whatnot.com — log in if you "
                "haven't yet, then press Enter in this terminal.",
                color="yellow",
            )

            # Open ONE tab for login. We'll reuse it as the discovery page.
            self.discovery_page = await self.ctx.new_page()
            try:
                await self.discovery_page.goto(
                    "https://www.whatnot.com", wait_until="domcontentloaded"
                )
            except Exception:
                pass

            await self._wait_for_enter()

            # Seed manually-pinned streams.
            for url in seeded:
                await self._spawn_watcher(url, label="manual")

            try:
                await self._main_loop()
            finally:
                await self._shutdown()

    # ------------------------------------------------------------------
    # Loop internals
    # ------------------------------------------------------------------

    async def _launch(self, pw: Playwright) -> BrowserContext:
        profile = Path(self.cfg.user_data_dir).resolve()
        profile.mkdir(parents=True, exist_ok=True)
        return await pw.chromium.launch_persistent_context(
            user_data_dir=str(profile),
            headless=self.cfg.headless,
            viewport={"width": 1280, "height": 900},
            args=["--disable-blink-features=AutomationControlled"],
        )

    async def _main_loop(self) -> None:
        last_stats = 0.0
        while not self._stop.is_set():
            self._reap_dead()

            if self.cfg.discovery.enabled:
                await self._top_up_from_discovery()

            now = time.monotonic()
            if now - last_stats > 10:
                self._print_stats()
                last_stats = now

            try:
                await asyncio.wait_for(
                    self._stop.wait(),
                    timeout=self.cfg.discovery.refresh_interval_seconds,
                )
            except asyncio.TimeoutError:
                pass

    def _reap_dead(self) -> None:
        for url in list(self.tasks):
            task = self.tasks[url]
            if not task.done():
                continue
            label = self.watchers[url].label
            if not task.cancelled():
                exc = task.exception()
                if exc:
                    log.warn(label, f"watcher crashed: {exc}")
            del self.tasks[url]
            del self.watchers[url]

    async def _top_up_from_discovery(self) -> None:
        max_n = self.cfg.discovery.max_streams
        free = max_n - len(self.watchers)
        if free <= 0 or self.discovery_page is None:
            return

        try:
            candidates = await discover_streams(self.discovery_page, self.cfg)
        except Exception as e:
            log.warn("discovery", f"failed: {e}")
            return

        log.banner(
            f"discovery: {len(candidates)} candidate(s) | "
            f"{len(self.watchers)}/{max_n} watchers active",
            color="blue",
        )
        for c in candidates:
            if free <= 0:
                break
            if c.url in self.watchers:
                continue
            await self._spawn_watcher(c.url, label=c.title or c.slug)
            free -= 1

    async def _spawn_watcher(self, url: str, label: str) -> None:
        if not url or url in self.watchers or self.ctx is None:
            return
        try:
            page = await self.ctx.new_page()
        except Exception as e:
            log.warn("coordinator", f"new_page failed: {e}")
            return
        watcher = StreamWatcher(page, url, label, self.cfg)
        self.watchers[url] = watcher
        self.tasks[url] = asyncio.create_task(
            watcher.run(), name=f"watch:{watcher.label}"
        )

    def _print_stats(self) -> None:
        if not self.watchers:
            log.banner("(no active watchers)", color="dim")
            return
        snaps = sum(w.stats.snapshots for w in self.watchers.values())
        dollar = sum(w.stats.dollar_lots for w in self.watchers.values())
        att = sum(w.stats.snipes_attempted for w in self.watchers.values())
        clicked = sum(w.stats.snipes_clicked for w in self.watchers.values())
        log.banner(
            f"=== {len(self.watchers)} active | snapshots={snaps} "
            f"$lots={dollar} snipes={att} clicked={clicked} ===",
            color="blue",
        )

    async def _shutdown(self) -> None:
        log.banner("shutting down...", color="cyan")
        for w in self.watchers.values():
            w.stop()
        for task in list(self.tasks.values()):
            try:
                await asyncio.wait_for(task, timeout=2.0)
            except (asyncio.TimeoutError, Exception):
                task.cancel()
        try:
            if self.discovery_page:
                await self.discovery_page.close()
        except Exception:
            pass
        try:
            if self.ctx:
                await self.ctx.close()
        except Exception:
            pass

    async def _wait_for_enter(self) -> None:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, sys.stdin.readline)
