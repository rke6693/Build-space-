"""Configuration loading + dataclasses.

The bot's behaviour is driven entirely by `config.yaml`. Loading is tolerant
of missing optional keys so old configs still work after upgrades.
"""

from __future__ import annotations

import dataclasses
from pathlib import Path
from typing import List

import yaml


@dataclasses.dataclass
class Selectors:
    # --- Stream page (per-livestream) ----------------------------------
    auction_root: str
    current_bid: str
    start_price: str
    time_left: str
    bid_button: str
    confirm_button: str
    # --- Listings page (discovery) -------------------------------------
    livestream_link: str
    livestream_title: str


@dataclasses.dataclass
class Discovery:
    enabled: bool
    listing_urls: List[str]
    max_streams: int
    refresh_interval_seconds: float
    idle_timeout_seconds: float
    title_keywords: List[str]
    title_blocklist: List[str]


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
    streams: List[str]
    selectors: Selectors
    discovery: Discovery

    @classmethod
    def load(cls, path: Path) -> "Config":
        raw = yaml.safe_load(path.read_text()) or {}

        sel_raw = raw.get("selectors", {})
        selectors = Selectors(
            auction_root=sel_raw["auction_root"],
            current_bid=sel_raw["current_bid"],
            start_price=sel_raw["start_price"],
            time_left=sel_raw["time_left"],
            bid_button=sel_raw["bid_button"],
            confirm_button=sel_raw.get("confirm_button", ""),
            livestream_link=sel_raw.get("livestream_link", 'a[href*="/live/"]'),
            livestream_title=sel_raw.get(
                "livestream_title", '[data-testid*="title"], h2, h3'
            ),
        )

        disc_raw = raw.get("discovery", {}) or {}
        discovery = Discovery(
            enabled=bool(disc_raw.get("enabled", False)),
            listing_urls=list(disc_raw.get("listing_urls", []) or []),
            max_streams=int(disc_raw.get("max_streams", 5)),
            refresh_interval_seconds=float(
                disc_raw.get("refresh_interval_seconds", 30)
            ),
            idle_timeout_seconds=float(disc_raw.get("idle_timeout_seconds", 60)),
            title_keywords=list(disc_raw.get("title_keywords", []) or []),
            title_blocklist=list(disc_raw.get("title_blocklist", []) or []),
        )

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
            streams=list(raw.get("streams", []) or []),
            selectors=selectors,
            discovery=discovery,
        )
