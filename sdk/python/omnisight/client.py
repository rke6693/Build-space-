"""
OmniSight SDK — Python Client
Async-first client for the OmniSight Prediction Market API.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime
from typing import AsyncIterator, Optional

import httpx
import websockets

from omnisight.models import (
    ArbitrageOpportunity, Market, MarketMicrostructure, NormalizedOdds,
    OrderBook, OrderLevel, PlatformOdds, PriceUpdate, Resolution, WhaleAlert,
)


class OmniSightError(Exception):
    """Base exception for OmniSight SDK errors."""

    def __init__(self, status_code: int, message: str, detail: Optional[str] = None):
        self.status_code = status_code
        self.message = message
        self.detail = detail
        super().__init__(f"[{status_code}] {message}")


class RateLimitError(OmniSightError):
    """Raised when API rate limit is exceeded."""

    def __init__(self, retry_after: int):
        self.retry_after = retry_after
        super().__init__(429, f"Rate limit exceeded. Retry after {retry_after}s")


class OmniSight:
    """
    OmniSight Python SDK client.

    Usage:
        client = OmniSight(api_key="your-key")
        markets = client.get_markets(platform="polymarket")

    Async usage:
        async with OmniSight(api_key="your-key") as client:
            odds = await client.aget_normalized_odds()
    """

    DEFAULT_BASE_URL = "https://api.omnisight.dev"
    DEFAULT_WS_URL = "wss://api.omnisight.dev"

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        ws_url: Optional[str] = None,
        timeout: float = 30.0,
    ):
        self.api_key = api_key
        self.base_url = (base_url or self.DEFAULT_BASE_URL).rstrip("/")
        self.ws_url = (ws_url or self.DEFAULT_WS_URL).rstrip("/")
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            headers = {"User-Agent": "OmniSight-Python/1.0"}
            if self.api_key:
                headers["X-API-Key"] = self.api_key
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers=headers,
                timeout=self.timeout,
            )
        return self._client

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.close()

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def _request(self, method: str, path: str, **kwargs) -> dict:
        client = await self._get_client()
        resp = await client.request(method, path, **kwargs)

        if resp.status_code == 429:
            retry_after = int(resp.headers.get("Retry-After", 60))
            raise RateLimitError(retry_after)
        if resp.status_code >= 400:
            detail = resp.json().get("detail", resp.text) if resp.headers.get("content-type", "").startswith("application/json") else resp.text
            raise OmniSightError(resp.status_code, f"API error: {path}", detail)

        return resp.json()

    def _run_sync(self, coro):
        """Run async method synchronously for convenience."""
        try:
            loop = asyncio.get_running_loop()
            # Already in async context — can't nest
            raise RuntimeError("Use async methods (aget_*, astream_*) in async context")
        except RuntimeError:
            return asyncio.run(coro)

    # ── Markets ────────────────────────────────────────────

    async def aget_markets(
        self,
        platform: Optional[str] = None,
        category: Optional[str] = None,
        status: str = "active",
        limit: int = 50,
    ) -> list[Market]:
        """Get markets across all platforms or filter by platform."""
        params = {"status": status, "limit": limit}
        if platform:
            params["platform"] = platform
        if category:
            params["category"] = category
        data = await self._request("GET", "/v1/markets", params=params)
        return [Market(**m) for m in data]

    def get_markets(self, **kwargs) -> list[Market]:
        return self._run_sync(self.aget_markets(**kwargs))

    async def aget_market(self, market_id: str, platform: str) -> Market:
        """Get a single market by ID."""
        data = await self._request("GET", f"/v1/markets/{market_id}", params={"platform": platform})
        return Market(**data)

    def get_market(self, market_id: str, platform: str) -> Market:
        return self._run_sync(self.aget_market(market_id, platform))

    # ── Normalized Odds ────────────────────────────────────

    async def aget_normalized_odds(
        self, category: Optional[str] = None, limit: int = 50
    ) -> list[NormalizedOdds]:
        """Get cross-platform normalized odds with consensus probability."""
        params = {"limit": limit}
        if category:
            params["category"] = category
        data = await self._request("GET", "/v1/odds/normalized", params=params)
        return [self._parse_normalized_odds(d) for d in data]

    def get_normalized_odds(self, **kwargs) -> list[NormalizedOdds]:
        return self._run_sync(self.aget_normalized_odds(**kwargs))

    @staticmethod
    def _parse_normalized_odds(d: dict) -> NormalizedOdds:
        platforms = {}
        for k, v in d.get("platforms", {}).items():
            platforms[k] = PlatformOdds(**v)
        return NormalizedOdds(
            event_id=d["event_id"],
            event_title=d["event_title"],
            category=d["category"],
            platforms=platforms,
            consensus_probability=d["consensus_probability"],
            max_spread=d["max_spread"],
            arbitrage_opportunity=d.get("arbitrage_opportunity", False),
            arbitrage_profit_bps=d.get("arbitrage_profit_bps"),
        )

    # ── Order Book ─────────────────────────────────────────

    async def aget_order_book(self, market_id: str, platform: str) -> OrderBook:
        """Get order book snapshot. Requires Pro tier."""
        data = await self._request("GET", f"/v1/orderbook/{market_id}", params={"platform": platform})
        return OrderBook(
            market_id=data["market_id"],
            platform=data["platform"],
            bids=[OrderLevel(**l) for l in data.get("bids", [])],
            asks=[OrderLevel(**l) for l in data.get("asks", [])],
            bid_depth=data.get("bid_depth", 0),
            ask_depth=data.get("ask_depth", 0),
            mid_price=data.get("mid_price", 0),
            spread=data.get("spread", 0),
            imbalance=data.get("imbalance", 0),
        )

    def get_order_book(self, market_id: str, platform: str) -> OrderBook:
        return self._run_sync(self.aget_order_book(market_id, platform))

    # ── Whale Tracking ─────────────────────────────────────

    async def aget_whale_alerts(
        self,
        market_id: Optional[str] = None,
        platform: Optional[str] = None,
        min_usd: float = 10000,
        hours: int = 24,
        limit: int = 50,
    ) -> list[WhaleAlert]:
        """Get whale trade alerts. Requires Pro tier."""
        params = {"min_usd": min_usd, "hours": hours, "limit": limit}
        if market_id:
            params["market_id"] = market_id
        if platform:
            params["platform"] = platform
        data = await self._request("GET", "/v1/whales/alerts", params=params)
        return [WhaleAlert(**w) for w in data]

    def get_whale_alerts(self, **kwargs) -> list[WhaleAlert]:
        return self._run_sync(self.aget_whale_alerts(**kwargs))

    async def aget_whale_flow(self, hours: int = 24) -> dict:
        """Get aggregated whale flow summary."""
        return await self._request("GET", "/v1/whales/flow", params={"hours": hours})

    def get_whale_flow(self, hours: int = 24) -> dict:
        return self._run_sync(self.aget_whale_flow(hours))

    # ── Arbitrage ──────────────────────────────────────────

    async def aget_arbitrage_opportunities(
        self,
        category: Optional[str] = None,
        min_profit_bps: float = 10,
        limit: int = 20,
    ) -> list[ArbitrageOpportunity]:
        """Scan for cross-platform arbitrage. Requires Pro tier."""
        params = {"min_profit_bps": min_profit_bps, "limit": limit}
        if category:
            params["category"] = category
        data = await self._request("GET", "/v1/arbitrage", params=params)
        return [ArbitrageOpportunity(**a) for a in data]

    def get_arbitrage_opportunities(self, **kwargs) -> list[ArbitrageOpportunity]:
        return self._run_sync(self.aget_arbitrage_opportunities(**kwargs))

    # ── Market Microstructure ──────────────────────────────

    async def aget_microstructure(self, market_id: str, platform: str) -> MarketMicrostructure:
        """Get full microstructure analytics. Requires Pro tier."""
        data = await self._request(
            "GET", f"/v1/microstructure/{market_id}", params={"platform": platform}
        )
        return MarketMicrostructure(**data)

    def get_microstructure(self, market_id: str, platform: str) -> MarketMicrostructure:
        return self._run_sync(self.aget_microstructure(market_id, platform))

    # ── Resolutions ────────────────────────────────────────

    async def aget_recent_resolutions(self, days: int = 7, limit: int = 50) -> list[Resolution]:
        data = await self._request("GET", "/v1/resolutions/recent", params={"days": days, "limit": limit})
        return [Resolution(**r) for r in data]

    def get_recent_resolutions(self, **kwargs) -> list[Resolution]:
        return self._run_sync(self.aget_recent_resolutions(**kwargs))

    async def aget_upcoming_resolutions(self, hours: int = 48) -> list[dict]:
        return await self._request("GET", "/v1/resolutions/upcoming", params={"hours": hours})

    def get_upcoming_resolutions(self, hours: int = 48) -> list[dict]:
        return self._run_sync(self.aget_upcoming_resolutions(hours))

    # ── WebSocket Streams ──────────────────────────────────

    async def stream_prices(
        self, market_ids: list[str], platform: str = "polymarket"
    ) -> AsyncIterator[PriceUpdate]:
        """Stream real-time price updates via WebSocket."""
        url = f"{self.ws_url}/v1/ws/prices"
        headers = {}
        if self.api_key:
            headers["X-API-Key"] = self.api_key

        async for ws in websockets.connect(url, additional_headers=headers):
            try:
                await ws.send(json.dumps({"subscribe": market_ids, "platform": platform}))
                async for message in ws:
                    data = json.loads(message)
                    yield PriceUpdate(
                        market_id=data["market_id"],
                        platform=data["platform"],
                        yes_price=data["yes_price"],
                        no_price=data["no_price"],
                        timestamp=datetime.fromisoformat(data["timestamp"]),
                    )
            except websockets.ConnectionClosed:
                continue

    async def stream_whale_alerts(self) -> AsyncIterator[WhaleAlert]:
        """Stream real-time whale alerts via WebSocket."""
        url = f"{self.ws_url}/v1/ws/whales"
        headers = {}
        if self.api_key:
            headers["X-API-Key"] = self.api_key

        async for ws in websockets.connect(url, additional_headers=headers):
            try:
                async for message in ws:
                    data = json.loads(message)
                    yield WhaleAlert(
                        id=data.get("id", ""),
                        market_id=data["market_id"],
                        market_title=data.get("market_title", ""),
                        platform=data["platform"],
                        wallet_address=data.get("wallet", ""),
                        wallet_label=data.get("wallet_label"),
                        side=data["side"],
                        price=data["price"],
                        size=data["size"],
                        usd_value=data["usd_value"],
                        tags=data.get("tags", []),
                        timestamp=datetime.fromisoformat(data["timestamp"]),
                    )
            except websockets.ConnectionClosed:
                continue
