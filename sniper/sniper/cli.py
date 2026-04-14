"""CLI entry point. ``python -m sniper`` lands here via ``__main__.py``."""

from __future__ import annotations

import argparse
import asyncio
import signal
import sys
from pathlib import Path
from typing import List, Optional

from .config import Config
from .coordinator import Coordinator
from .log import log


def _build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(
        prog="sniper",
        description="Whatnot $1 auction sniper bot (multi-stream)",
    )
    ap.add_argument("--config", default="config.yaml", help="Path to config file")
    ap.add_argument(
        "--stream",
        action="append",
        default=[],
        metavar="URL",
        help="Watch this stream URL. May be passed multiple times.",
    )
    ap.add_argument(
        "--no-discovery",
        action="store_true",
        help="Disable automatic stream discovery for this run.",
    )
    ap.add_argument(
        "--max-streams",
        type=int,
        default=None,
        metavar="N",
        help="Override discovery.max_streams for this run.",
    )
    ap.add_argument(
        "--keyword",
        action="append",
        default=[],
        metavar="WORD",
        help="Title keyword filter (case-insensitive substring). Repeatable.",
    )
    ap.add_argument(
        "--live",
        action="store_true",
        help="Disable dry-run. Real bids will be placed. DANGEROUS.",
    )
    return ap


def main(argv: Optional[List[str]] = None) -> int:
    args = _build_parser().parse_args(argv)

    cfg_path = Path(args.config)
    if not cfg_path.exists():
        example = cfg_path.with_name("config.example.yaml")
        if example.exists():
            log.banner(
                f"{cfg_path} not found — copy {example.name} to {cfg_path.name}.",
                color="yellow",
            )
        else:
            log.banner(f"config not found: {cfg_path}", color="red")
        return 2

    cfg = Config.load(cfg_path)
    if args.no_discovery:
        cfg.discovery.enabled = False
    if args.max_streams is not None:
        cfg.discovery.max_streams = args.max_streams
    if args.keyword:
        cfg.discovery.title_keywords = list(cfg.discovery.title_keywords) + list(
            args.keyword
        )

    if args.live:
        cfg.dry_run = False
        log.banner("LIVE MODE: real bids will be placed.", color="red")
    else:
        log.banner("Dry-run mode. Pass --live to actually bid.", color="cyan")

    coord = Coordinator(cfg, manual_streams=args.stream)

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    def _stop():
        coord.request_stop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _stop)
        except NotImplementedError:
            pass

    try:
        loop.run_until_complete(coord.run())
    finally:
        loop.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
