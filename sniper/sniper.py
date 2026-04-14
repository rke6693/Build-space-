#!/usr/bin/env python3
"""Whatnot $1 auction sniper bot.

Watches one or more Whatnot livestreams, detects auctions that started at
$1 (or whatever ceiling you configure), and fires a bid in the final
fraction of a second before the lot closes.

Design notes
------------
* Whatnot has no public bidding API, so we drive a real Chromium through
  Playwright with a persistent profile. You log in once; the profile stores
  the session cookies and the bot reuses them on every subsequent run.
* The snipe is a tight loop: every `poll_interval_ms` we re-read the DOM,
  parse the current bid, start price, and time remaining, and ask the
  strategy layer whether to bid. The actual click only fires inside a
  narrow window (`snipe_window_close` <= t <= `snipe_window_open`), which
  is the classic "wait until the last moment" sniper pattern.
* Everything that would mutate state (clicking bid, confirming a modal)
  is gated behind `dry_run`. Use dry-run first. Always.

This file is intentionally a single module so it can be audited in one
sitting.
"""

from __future__ import annotations

import argparse
import asyncio
import dataclasses
import os
import re
import signal
import sys
import time
from pathlib import Path
from typing import Optional

import yaml
from playwright.async_api import (
    Browser,
    BrowserContext,
    ElementHandle,
    Page,
    Playwright,
    TimeoutError as PWTimeout,
    async_playwright,
)
from rich.console import Console
from rich.table import Table

console = Console()

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------


@dataclasses.dataclass
class Selectors:
    auction_root: str
    current_bid: str
    start_price: str
    time_left: str
    bid_button: str
    confirm_button: str


@dataclasses.dataclass
class Config:
    dry_run: bool
    headless: bool
    user_data_dir: str
    max_start_price: float
    max_bid: float
    min_bid_increment: float
    snipe_window_open: float
    snipe_window_close: float
    poll_interval_ms: int
    streams: list[str]
    selectors: Selectors

    @classmethod
    def load(cls, path: Path) -> "Config":
        raw = yaml.safe_load(path.read_text())
        sel = Selectors(**raw["selectors"])
        return cls(
            dry_run=bool(raw.get("dry_run", True)),
            headless=bool(raw.get("headless", False)),
            user_data_dir=str(raw.get("user_data_dir", ".profile")),
            max_start_price=float(raw["max_start_price"]),
            max_bid=float(raw["max_bid"]),
            min_bid_increment=float(raw.get("min_bid_increment", 1.0)),
            snipe_window_open=float(raw["snipe_window_open"]),
            snipe_window_close=float(raw["snipe_window_close"]),
            poll_interval_ms=int(raw.get("poll_interval_ms", 120)),
            streams=list(raw.get("streams", [])),
            selectors=sel,
        )


# ---------------------------------------------------------------------------
# DOM parsing helpers
# ---------------------------------------------------------------------------

_MONEY_RE = re.compile(r"\$?\s*([0-9]+(?:\.[0-9]{1,2})?)")
# Matches "0:03", "3s", "03", "1:23".
_TIME_RE = re.compile(r"(?:(\d+):)?(\d{1,2})(?:s)?")


def parse_money(text: str) -> Optional[float]:
    if not text:
        return None
    m = _MONEY_RE.search(text.replace(",", ""))
    return float(m.group(1)) if m else None


def parse_time_left(text: str) -> Optional[float]:
    """Return seconds remaining, or None if we can't parse."""
    if not text:
        return None
    t = text.strip().lower()
    if t in {"ended", "closed", "sold"}:
        return 0.0
    m = _TIME_RE.search(t)
    if not m:
        return None
    mins = int(m.group(1) or 0)
    secs = int(m.group(2) or 0)
    return float(mins * 60 + secs)


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

    current_raw = await _text(sel.current_bid)
    start_raw = await _text(sel.start_price)
    time_raw = await _text(sel.time_left)

    return AuctionSnapshot(
        current_bid=parse_money(current_raw),
        start_price=parse_money(start_raw),
        time_left=parse_time_left(time_raw),
        captured_at=time.monotonic(),
    )


# ---------------------------------------------------------------------------
# Strategy
# ---------------------------------------------------------------------------


@dataclasses.dataclass
class SnipeDecision:
    should_bid: bool
    reason: str


def decide(snap: AuctionSnapshot, cfg: Config, already_leading: bool) -> SnipeDecision:
    if snap.time_left is None:
        return SnipeDecision(False, "no-time")
    if not snap.is_dollar_auction(cfg.max_start_price):
        return SnipeDecision(False, f"start>{cfg.max_start_price}")
    if already_leading:
        return SnipeDecision(False, "already-leading")

    # Check the next bid won't exceed our ceiling.
    next_bid = (snap.current_bid or 0) + cfg.min_bid_increment
    if next_bid > cfg.max_bid:
        return SnipeDecision(False, f"next_bid={next_bid:.2f}>max")

    # Snipe window.
    if not (cfg.snipe_window_close <= snap.time_left <= cfg.snipe_window_open):
        return SnipeDecision(False, f"t={snap.time_left:.2f}s outside window")

    return SnipeDecision(True, f"SNIPE @ ${next_bid:.2f} with t={snap.time_left:.2f}s")


# ---------------------------------------------------------------------------
# Bot
# ---------------------------------------------------------------------------


class Sniper:
    def __init__(self, cfg: Config, stream_url: Optional[str]):
        self.cfg = cfg
        self.stream_url = stream_url
        self.fired_for: dict[str, float] = {}  # lot fingerprint -> ts
        self.wins = 0
        self.attempts = 0

    def fingerprint(self, snap: AuctionSnapshot) -> str:
        # We don't have a stable lot id from the DOM alone, so we key on a
        # combination of start price + a "generation" bucket. Good enough to
        # avoid double-firing in a single lot without being so precise that
        # normal price movement resets it.
        return f"{snap.start_price}:{int(snap.captured_at) // 60}"

    async def run(self) -> None:
        async with async_playwright() as pw:
            ctx = await self._launch(pw)
            page = await ctx.new_page()
            page.set_default_timeout(8000)

            url = self.stream_url or (self.cfg.streams[0] if self.cfg.streams else None)
            if not url:
                console.print("[red]No stream URL. Set one in config or pass --stream.[/red]")
                return
            console.print(f"[cyan]Opening[/cyan] {url}")
            await page.goto(url, wait_until="domcontentloaded")

            console.print(
                "[yellow]If you're not logged in, do it now in the browser window. "
                "Press Enter here when you're ready to start watching.[/yellow]"
            )
            await asyncio.get_event_loop().run_in_executor(None, sys.stdin.readline)

            await self._watch(page)

            await ctx.close()

    async def _launch(self, pw: Playwright) -> BrowserContext:
        profile = Path(self.cfg.user_data_dir).resolve()
        profile.mkdir(parents=True, exist_ok=True)
        return await pw.chromium.launch_persistent_context(
            user_data_dir=str(profile),
            headless=self.cfg.headless,
            viewport={"width": 1280, "height": 900},
            args=["--disable-blink-features=AutomationControlled"],
        )

    async def _watch(self, page: Page) -> None:
        cfg = self.cfg
        sel = cfg.selectors
        last_log = 0.0

        try:
            while True:
                loop_start = time.monotonic()
                try:
                    snap = await read_auction(page, sel)
                except Exception as e:
                    console.print(f"[red]read error:[/red] {e}")
                    snap = None

                if snap is None:
                    # Nothing looking like an auction card — keep idling.
                    if loop_start - last_log > 5:
                        console.print("[dim]…no auction card in view[/dim]")
                        last_log = loop_start
                else:
                    decision = decide(snap, cfg, already_leading=False)
                    if loop_start - last_log > 1.0 or decision.should_bid:
                        self._log_row(snap, decision)
                        last_log = loop_start

                    if decision.should_bid:
                        fp = self.fingerprint(snap)
                        if fp not in self.fired_for:
                            self.fired_for[fp] = loop_start
                            await self._snipe(page, snap)

                # Steady poll cadence.
                elapsed = (time.monotonic() - loop_start) * 1000
                delay = max(0, cfg.poll_interval_ms - elapsed) / 1000
                await asyncio.sleep(delay)
        except (KeyboardInterrupt, asyncio.CancelledError):
            console.print("[cyan]Stopping sniper.[/cyan]")

    def _log_row(self, snap: AuctionSnapshot, decision: SnipeDecision) -> None:
        table = Table.grid(expand=False, padding=(0, 1))
        table.add_column(style="bold")
        table.add_column()
        table.add_row("start", f"${snap.start_price}")
        table.add_row("bid", f"${snap.current_bid}")
        table.add_row("t-left", f"{snap.time_left}")
        style = "green" if decision.should_bid else "dim"
        table.add_row("decision", f"[{style}]{decision.reason}[/{style}]")
        console.print(table)

    async def _snipe(self, page: Page, snap: AuctionSnapshot) -> None:
        self.attempts += 1
        cfg = self.cfg
        if cfg.dry_run:
            console.print(
                f"[magenta]DRY-RUN[/magenta] would click bid "
                f"(t={snap.time_left:.2f}s, next=${(snap.current_bid or 0)+cfg.min_bid_increment:.2f})"
            )
            return

        try:
            btn = await page.query_selector(cfg.selectors.bid_button)
            if btn is None:
                console.print("[red]bid button not found at snipe time[/red]")
                return
            await btn.click(no_wait_after=True)
            console.print(f"[green]BID CLICKED[/green] t={snap.time_left:.2f}s")

            if cfg.selectors.confirm_button:
                try:
                    confirm = await page.wait_for_selector(
                        cfg.selectors.confirm_button, timeout=500
                    )
                    if confirm:
                        await confirm.click(no_wait_after=True)
                        console.print("[green]confirmed[/green]")
                except PWTimeout:
                    pass  # No modal — fine.

            self.wins += 1  # optimistic; refine by re-reading current bid.
        except Exception as e:
            console.print(f"[red]snipe click failed:[/red] {e}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Whatnot $1 auction sniper bot")
    ap.add_argument("--config", default="config.yaml", help="Path to config file")
    ap.add_argument("--stream", default=None, help="Override stream URL")
    ap.add_argument("--live", action="store_true", help="Disable dry-run (DANGEROUS)")
    args = ap.parse_args(argv)

    cfg_path = Path(args.config)
    if not cfg_path.exists():
        example = cfg_path.with_name("config.example.yaml")
        if example.exists():
            console.print(
                f"[yellow]{cfg_path} not found — copy {example.name} to {cfg_path.name}.[/yellow]"
            )
        else:
            console.print(f"[red]config not found:[/red] {cfg_path}")
        return 2

    cfg = Config.load(cfg_path)
    if args.live:
        cfg.dry_run = False
        console.print("[red bold]LIVE MODE: real bids will be placed.[/red bold]")
    else:
        console.print("[cyan]Dry-run mode. Pass --live to actually bid.[/cyan]")

    sniper = Sniper(cfg, args.stream)

    # Graceful ctrl-c in the asyncio loop.
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    stop = asyncio.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:
            pass

    try:
        loop.run_until_complete(sniper.run())
    finally:
        loop.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
