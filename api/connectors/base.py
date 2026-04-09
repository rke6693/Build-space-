"""
Base connector interface for prediction market platforms.
All platform-specific connectors inherit from this.

Hardened with: circuit breaker, retry with exponential backoff,
Prometheus metrics, structured logging, and proper timeout handling.
"""

from __future__ import annotations

import abc
import asyncio
import time
from typing import AsyncIterator, Optional

import httpx
import structlog

from api.circuit_breaker import CircuitBreaker, CircuitOpenError, get_breaker
from api.metrics import (
    PLATFORM_REQUESTS_TOTAL,
    PLATFORM_REQUEST_DURATION,
)
from api.models import (
    MarketResponse, OrderBookSnapshot, Platform, MarketStatus,
    WhaleAlert, PriceSnapshotDB,
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
    """
    Abstract base class for platform connectors.
    Provides circuit breaker, retry logic, rate limiting, and metrics.
    """

    platform: Platform
    base_url: str

    # Retry configuration
    MAX_RETRIES = 3
    RETRY_BACKOFF_BASE = 0.5  # seconds
    RETRY_BACKOFF_MAX = 8.0   # seconds
    RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}

    def __init__(self, api_key: Optional[str] = None, api_secret: Optional[str] = None):
        self.api_key = api_key
        self.api_secret = api_secret
        self.rate_limiter = RateLimiter()
        self._client: Optional[httpx.AsyncClient] = None
        self._circuit_breaker: Optional[CircuitBreaker] = None

    @property
    def circuit_breaker(self) -> CircuitBreaker:
        if self._circuit_breaker is None:
            self._circuit_breaker = get_breaker(f"connector:{self.platform.value}")
        return self._circuit_breaker

    async def get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(30.0, connect=10.0),
                headers=self._build_headers(),
                limits=httpx.Limits(
                    max_keepalive_connections=20,
                    max_connections=50,
                    keepalive_expiry=30,
                ),
            )
        return self._client

    def _build_headers(self) -> dict:
        """Override to add platform-specific auth headers."""
        return {"User-Agent": "OmniSight/1.0"}

    async def _request(self, method: str, path: str, **kwargs) -> dict:
        """
        Make an HTTP request with circuit breaker, retry, rate limiting, and metrics.
        """
        last_error: Optional[Exception] = None

        for attempt in range(self.MAX_RETRIES + 1):
            # Circuit breaker check
            try:
                async with self.circuit_breaker:
                    await self.rate_limiter.acquire()
                    client = await self.get_client()

                    start = time.monotonic()
                    try:
                        resp = await client.request(method, path, **kwargs)
                        duration = time.monotonic() - start

                        PLATFORM_REQUEST_DURATION.labels(
                            platform=self.platform.value, endpoint=path
                        ).observe(duration)

                        if resp.status_code in self.RETRYABLE_STATUS_CODES:
                            PLATFORM_REQUESTS_TOTAL.labels(
                                platform=self.platform.value, endpoint=path, status="retryable"
                            ).inc()

                            if attempt < self.MAX_RETRIES:
                                backoff = min(
                                    self.RETRY_BACKOFF_BASE * (2 ** attempt),
                                    self.RETRY_BACKOFF_MAX,
                                )
                                # Respect Retry-After header
                                retry_after = resp.headers.get("Retry-After")
                                if retry_after:
                                    backoff = max(backoff, float(retry_after))

                                logger.warning(
                                    "retrying_request",
                                    platform=self.platform.value,
                                    path=path,
                                    status=resp.status_code,
                                    attempt=attempt + 1,
                                    backoff=backoff,
                                )
                                await asyncio.sleep(backoff)
                                continue

                        resp.raise_for_status()

                        PLATFORM_REQUESTS_TOTAL.labels(
                            platform=self.platform.value, endpoint=path, status="success"
                        ).inc()

                        return resp.json()

                    except httpx.HTTPStatusError as e:
                        PLATFORM_REQUESTS_TOTAL.labels(
                            platform=self.platform.value, endpoint=path, status="error"
                        ).inc()
                        logger.error(
                            "api_error",
                            platform=self.platform.value,
                            path=path,
                            status=e.response.status_code,
                            body=e.response.text[:500],
                        )
                        raise

                    except httpx.RequestError as e:
                        duration = time.monotonic() - start
                        PLATFORM_REQUESTS_TOTAL.labels(
                            platform=self.platform.value, endpoint=path, status="timeout"
                        ).inc()
                        PLATFORM_REQUEST_DURATION.labels(
                            platform=self.platform.value, endpoint=path
                        ).observe(duration)
                        last_error = e

                        if attempt < self.MAX_RETRIES:
                            backoff = min(
                                self.RETRY_BACKOFF_BASE * (2 ** attempt),
                                self.RETRY_BACKOFF_MAX,
                            )
                            logger.warning(
                                "retrying_request",
                                platform=self.platform.value,
                                path=path,
                                error=str(e),
                                attempt=attempt + 1,
                                backoff=backoff,
                            )
                            await asyncio.sleep(backoff)
                            continue
                        raise

            except CircuitOpenError:
                PLATFORM_REQUESTS_TOTAL.labels(
                    platform=self.platform.value, endpoint=path, status="circuit_open"
                ).inc()
                raise

        # Should not reach here, but just in case
        raise last_error or RuntimeError(f"Request to {path} failed after {self.MAX_RETRIES} retries")

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
        ...

    @abc.abstractmethod
    async def get_market(self, market_id: str) -> MarketResponse:
        ...

    @abc.abstractmethod
    async def get_order_book(self, market_id: str) -> OrderBookSnapshot:
        ...

    @abc.abstractmethod
    async def get_trades(
        self, market_id: str, since: Optional[float] = None, limit: int = 500
    ) -> list[dict]:
        ...

    @abc.abstractmethod
    async def stream_prices(self, market_ids: list[str]) -> AsyncIterator[PriceSnapshotDB]:
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
