"""Telegram notifier with rate limiting and silent-fail semantics.

Never raises — if Telegram is down or tokens are missing, we log and keep
trading. Communication failures must never take the bot offline.
"""
from __future__ import annotations

import asyncio
import time
from collections import deque
from typing import Deque

import aiohttp

from .config import get_settings
from .logger import get_logger

log = get_logger("notifier")


class Notifier:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._recent: Deque[float] = deque(maxlen=20)
        self._enabled = bool(
            self.settings.telegram_bot_token and self.settings.telegram_chat_id
        )
        if not self._enabled:
            log.warning("notifier.disabled", reason="missing telegram creds")

    async def send(self, text: str, *, priority: str = "normal") -> None:
        if not self._enabled:
            log.info("notify", text=text, priority=priority)
            return

        # Rate limit: max 20 msgs / minute
        now = time.time()
        while self._recent and now - self._recent[0] > 60:
            self._recent.popleft()
        if len(self._recent) >= 20:
            log.warning("notifier.rate_limited", dropped=text[:80])
            return
        self._recent.append(now)

        url = f"https://api.telegram.org/bot{self.settings.telegram_bot_token}/sendMessage"
        payload = {
            "chat_id": self.settings.telegram_chat_id,
            "text": text,
            "parse_mode": "Markdown",
            "disable_web_page_preview": True,
        }
        try:
            async with aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=10)
            ) as sess:
                async with sess.post(url, json=payload) as resp:
                    if resp.status != 200:
                        body = await resp.text()
                        log.warning(
                            "notifier.bad_status", status=resp.status, body=body[:200]
                        )
        except Exception as e:  # noqa: BLE001
            log.warning("notifier.error", err=str(e))

    # ---- formatters ----
    async def trade_opened(self, *, market: str, side: str, price: float,
                           shares: float, stake: float, edge_bps: int,
                           strategy: str) -> None:
        msg = (
            f"*OPEN* `{strategy}`\n"
            f"{market}\n"
            f"{side} {shares:.2f} sh @ ${price:.3f}\n"
            f"Stake: ${stake:.2f}  |  Edge: {edge_bps} bps"
        )
        await self.send(msg)

    async def trade_closed(self, *, market: str, shares: float, price: float,
                           pnl: float, reason: str) -> None:
        emoji = "+" if pnl >= 0 else "-"
        msg = (
            f"*CLOSE* [{reason}]\n"
            f"{market}\n"
            f"{shares:.2f} sh @ ${price:.3f}\n"
            f"PnL: {emoji}${abs(pnl):.2f}"
        )
        await self.send(msg)

    async def daily_report(self, *, bankroll: float, realised: float,
                           open_count: int, high_water: float) -> None:
        msg = (
            f"*Daily Report*\n"
            f"Bankroll: ${bankroll:.2f}\n"
            f"Realised today: ${realised:.2f}\n"
            f"High-water: ${high_water:.2f}\n"
            f"Open positions: {open_count}"
        )
        await self.send(msg, priority="low")

    async def halt(self, reason: str) -> None:
        await self.send(f"*BOT HALTED*\n{reason}", priority="high")
