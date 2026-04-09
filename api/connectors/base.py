"""
Base connector interface for prediction market platforms.
All platform-specific connectors inherit from this.
"""

from __future__ import annotations

import abc
import asyncio
import time
from typing import AsyncIterator, Optional

import httpx
import structlog

from api.models import (
    MarketResponse, OrderBookSnapshot, Platform, MarketStatus,
    WhaleAlert, PriceSnapshotDB
)

logger = structlog.get_logger(__name__)


class RateLimiter:
    """Token bucket rate limiter for API calls."""

    def __init__(self, requests_per_second: float = 5.0):
        self.rate = requests_per_second
        self.tokens = requests_per_second
        self.max_tokens = requests_per_second
        self.last_refill = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self):
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self.last_refill
            self.tokens = min(self.max_tokens, self.tokens + elapsed * self.rate)
            self.last_refill = now

            if self.tokens < 1:
                wait_time = (1 - self.tokens) / self.rate
                await asyncio.sleep(wait_time)
                self.tokens = 0
            else:
                self.tokens -= 1


class BaseConnector(abc.ABC):
    """Abstract base class for platform connectors."""

    platform: Platform
    base_url: str

    def __init__(self, api_key: Optional[str] = None, api_secret: Optional[str] = None):
        self.api_key = api_key
        self.api_secret = api_secret
        self.rate_limiter = RateLimiter()
        self._client: Optional[httpx.AsyncClient] = None

    async def get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=30.0,
                headers=self._build_headers(),
            )
        return self._client

    def _build_headers(self) -> dict:
        """Override to add platform-specific auth headers."""
        return {"User-Agent": "OmniSight/1.0"}

    async def _request(self, method: str, path: str, **kwargs) -> dict:
        await self.rate_limiter.acquire()
        client = await self.get_client()
        try:
            resp = await client.request(method, path, **kwargs)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            logger.error("api_error", platform=self.platform, path=path,
                         status=e.response.status_code, body=e.response.text[:500])
            raise
        except httpx.RequestError as e:
            logger.error("request_error", platform=self.platform, path=path, error=str(e))
            raise

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    # ── Abstract interface ─────────────────────────────────

    @abc.abstractmethod
    async def get_markets(
        self,
        category: Optional[str] = None,
        status: MarketStatus = MarketStatus.ACTIVE,
        limit: int = 100,
        offset: int = 0,
    ) -> list[MarketResponse]:
        """Fetch markets from the platform."""
        ...

    @abc.abstractmethod
    async def get_market(self, market_id: str) -> MarketResponse:
        """Fetch a single market by platform-specific ID."""
        ...

    @abc.abstractmethod
    async def get_order_book(self, market_id: str) -> OrderBookSnapshot:
        """Fetch current order book for a market."""
        ...

    @abc.abstractmethod
    async def get_trades(
        self, market_id: str, since: Optional[float] = None, limit: int = 500
    ) -> list[dict]:
        """Fetch recent trades for a market."""
        ...

    @abc.abstractmethod
    async def stream_prices(self, market_ids: list[str]) -> AsyncIterator[PriceSnapshotDB]:
        """Stream real-time price updates via WebSocket."""
        ...

    async def get_whale_trades(
        self, market_id: str, min_usd: float = 10000
    ) -> list[WhaleAlert]:
        """Default: filter trades by size. Platforms can override."""
        trades = await self.get_trades(market_id)
        whales = []
        for t in trades:
            usd_value = t.get("usd_value", t.get("size", 0) * t.get("price", 0))
            if usd_value >= min_usd:
                whales.append(WhaleAlert(
                    id=f"{self.platform.value}-{t.get('id', '')}",
                    market_id=market_id,
                    market_title=t.get("market_title", ""),
                    platform=self.platform,
                    wallet_address=t.get("wallet", t.get("user_id", "unknown")),
                    side=t.get("side", "bid"),
                    price=t.get("price", 0),
                    size=t.get("size", 0),
                    usd_value=usd_value,
                    timestamp=t.get("timestamp"),
                ))
        return whales
