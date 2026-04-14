"""Binance spot WebSocket — real-time mid prices + rolling vol.

Binance is used as the "truth" feed for crypto spot. A single shared
stream multiplexes all configured symbols. Consumers read from an
asyncio.Queue-like `PriceTape` which stores the last N prices per symbol
so we can compute realized vol on demand.
"""
from __future__ import annotations

import asyncio
import json
import time
from collections import deque
from dataclasses import dataclass
from typing import Deque, Dict, List, Optional

import websockets

from core.config import get_settings
from core.logger import get_logger

log = get_logger("binance_ws")


@dataclass
class PriceTick:
    symbol: str
    price: float
    ts: float


class PriceTape:
    """Thread-safe-ish rolling price history per symbol.

    Stores (ts, price) tuples. Single writer (WS task), many readers.
    """

    def __init__(self, maxlen: int = 3600) -> None:
        self._data: Dict[str, Deque[PriceTick]] = {}
        self._maxlen = maxlen
        self._ready = asyncio.Event()

    def push(self, tick: PriceTick) -> None:
        dq = self._data.get(tick.symbol)
        if dq is None:
            dq = deque(maxlen=self._maxlen)
            self._data[tick.symbol] = dq
        dq.append(tick)
        if not self._ready.is_set():
            self._ready.set()

    def last(self, symbol: str) -> Optional[PriceTick]:
        dq = self._data.get(symbol)
        if not dq:
            return None
        return dq[-1]

    def series(self, symbol: str) -> List[PriceTick]:
        return list(self._data.get(symbol, []))

    async def wait_ready(self, timeout: float = 30.0) -> bool:
        try:
            await asyncio.wait_for(self._ready.wait(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            return False

    def symbols(self) -> List[str]:
        return list(self._data.keys())


async def binance_stream(tape: PriceTape) -> None:
    """Long-running task. Reconnects with backoff on disconnect."""
    settings = get_settings()
    symbols = [s.lower() for s in settings.crypto_symbols]
    streams = "/".join(f"{s}@trade" for s in symbols)
    url = f"{settings.binance_ws_url}?streams={streams}"
    backoff = 1.0

    while True:
        try:
            log.info("binance.connect", url=url)
            async with websockets.connect(url, ping_interval=20, ping_timeout=20) as ws:
                backoff = 1.0
                async for raw in ws:
                    try:
                        msg = json.loads(raw)
                        data = msg.get("data") or msg
                        sym = data.get("s")
                        px = data.get("p")
                        if sym and px:
                            tape.push(
                                PriceTick(
                                    symbol=sym.upper(),
                                    price=float(px),
                                    ts=time.time(),
                                )
                            )
                    except Exception as e:  # noqa: BLE001
                        log.debug("binance.parse_err", err=str(e))
        except Exception as e:  # noqa: BLE001
            log.warning("binance.disconnect", err=str(e), backoff=backoff)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60.0)
