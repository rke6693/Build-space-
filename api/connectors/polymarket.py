"""
Polymarket Connector — CLOB (Central Limit Order Book) API integration.
Handles market data, order books, trades, and WebSocket streaming.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from datetime import datetime, timezone
from typing import AsyncIterator, Optional

import structlog
import websockets

from api.connectors.base import BaseConnector
from api.models import (
    MarketResponse, MarketStatus, OrderBookSnapshot, OrderLevel,
    OrderSide, Platform, PlatformOdds, PriceSnapshotDB, WhaleAlert,
)

logger = structlog.get_logger(__name__)


class PolymarketConnector(BaseConnector):
    """Connector for Polymarket's CLOB API and Gamma Markets API."""

    platform = Platform.POLYMARKET
    base_url = "https://clob.polymarket.com"
    gamma_url = "https://gamma-api.polymarket.com"
    ws_url = "wss://ws-subscriptions-clob.polymarket.com/ws/market"

    def _build_headers(self) -> dict:
        headers = super()._build_headers()
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def _sign_request(self, method: str, path: str, body: str = "") -> dict:
        """Generate HMAC signature for authenticated endpoints."""
        if not self.api_secret:
            return {}
        timestamp = str(int(time.time()))
        message = f"{timestamp}{method.upper()}{path}{body}"
        signature = hmac.new(
            self.api_secret.encode(), message.encode(), hashlib.sha256
        ).hexdigest()
        return {
            "POLY_TIMESTAMP": timestamp,
            "POLY_SIGNATURE": signature,
            "POLY_API_KEY": self.api_key or "",
        }

    def _normalize_market(self, raw: dict) -> MarketResponse:
        """Convert Polymarket API response to unified schema."""
        tokens = raw.get("tokens", [])
        yes_price = None
        no_price = None
        for token in tokens:
            outcome = token.get("outcome", "").lower()
            price = token.get("price")
            if outcome == "yes":
                yes_price = price
            elif outcome == "no":
                no_price = price

        # Derive prices from each other if only one is available
        if yes_price is not None and no_price is None:
            no_price = round(1.0 - yes_price, 4)
        elif no_price is not None and yes_price is None:
            yes_price = round(1.0 - no_price, 4)

        status_map = {
            "active": MarketStatus.ACTIVE,
            "closed": MarketStatus.CLOSED,
            "resolved": MarketStatus.RESOLVED,
        }

        return MarketResponse(
            id=f"poly-{raw.get('condition_id', raw.get('id', ''))}",
            platform=Platform.POLYMARKET,
            platform_market_id=raw.get("condition_id", raw.get("id", "")),
            title=raw.get("question", raw.get("title", "")),
            description=raw.get("description", ""),
            category=raw.get("category", ""),
            yes_price=yes_price,
            no_price=no_price,
            last_trade_price=yes_price,
            volume_24h=float(raw.get("volume_24hr", 0) or 0),
            volume_total=float(raw.get("volume", raw.get("volumeNum", 0)) or 0),
            liquidity=float(raw.get("liquidity", raw.get("liquidityNum", 0)) or 0),
            open_interest=float(raw.get("open_interest", 0) or 0),
            status=status_map.get(raw.get("active", "active"), MarketStatus.ACTIVE),
            end_date=self._parse_date(raw.get("end_date_iso")),
            tags=raw.get("tags", []),
            created_at=self._parse_date(raw.get("created_at")),
            updated_at=self._parse_date(raw.get("updated_at")),
        )

    @staticmethod
    def _parse_date(val) -> Optional[datetime]:
        if not val:
            return None
        if isinstance(val, datetime):
            return val
        try:
            return datetime.fromisoformat(val.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            return None

    # ── Market Data ────────────────────────────────────────

    async def get_markets(
        self,
        category: Optional[str] = None,
        status: MarketStatus = MarketStatus.ACTIVE,
        limit: int = 100,
        offset: int = 0,
    ) -> list[MarketResponse]:
        params = {"limit": limit, "offset": offset}
        if category:
            params["tag"] = category
        if status == MarketStatus.ACTIVE:
            params["active"] = "true"

        # Use Gamma API for market discovery
        await self.rate_limiter.acquire()
        client = await self.get_client()
        resp = await client.get(f"{self.gamma_url}/markets", params=params)
        resp.raise_for_status()
        raw_markets = resp.json()

        return [self._normalize_market(m) for m in raw_markets]

    async def get_market(self, market_id: str) -> MarketResponse:
        # Try CLOB first, fallback to Gamma
        try:
            data = await self._request("GET", f"/markets/{market_id}")
        except Exception:
            await self.rate_limiter.acquire()
            client = await self.get_client()
            resp = await client.get(f"{self.gamma_url}/markets/{market_id}")
            resp.raise_for_status()
            data = resp.json()
        return self._normalize_market(data)

    async def get_order_book(self, market_id: str) -> OrderBookSnapshot:
        data = await self._request("GET", f"/book", params={"token_id": market_id})

        bids = []
        cumulative = 0.0
        for level in sorted(data.get("bids", []), key=lambda x: -float(x["price"])):
            size = float(level["size"])
            cumulative += size
            bids.append(OrderLevel(
                price=float(level["price"]),
                size=size,
                cumulative_size=cumulative,
            ))

        asks = []
        cumulative = 0.0
        for level in sorted(data.get("asks", []), key=lambda x: float(x["price"])):
            size = float(level["size"])
            cumulative += size
            asks.append(OrderLevel(
                price=float(level["price"]),
                size=size,
                cumulative_size=cumulative,
            ))

        best_bid = bids[0].price if bids else 0
        best_ask = asks[0].price if asks else 1
        mid = (best_bid + best_ask) / 2
        spread = best_ask - best_bid

        bid_depth = sum(b.size for b in bids)
        ask_depth = sum(a.size for a in asks)
        total_depth = bid_depth + ask_depth
        imbalance = (bid_depth - ask_depth) / total_depth if total_depth > 0 else 0

        return OrderBookSnapshot(
            market_id=market_id,
            platform=Platform.POLYMARKET,
            timestamp=datetime.now(timezone.utc),
            bids=bids,
            asks=asks,
            bid_depth=bid_depth,
            ask_depth=ask_depth,
            mid_price=mid,
            spread=spread,
            imbalance=imbalance,
        )

    async def get_trades(
        self, market_id: str, since: Optional[float] = None, limit: int = 500
    ) -> list[dict]:
        params = {"asset_id": market_id, "limit": limit}
        if since:
            params["after"] = int(since)
        data = await self._request("GET", "/trades", params=params)

        trades = []
        for t in data if isinstance(data, list) else data.get("trades", data.get("data", [])):
            trades.append({
                "id": t.get("id", ""),
                "market_id": market_id,
                "market_title": t.get("market", ""),
                "price": float(t.get("price", 0)),
                "size": float(t.get("size", 0)),
                "usd_value": float(t.get("price", 0)) * float(t.get("size", 0)),
                "side": "bid" if t.get("side", "").lower() in ("buy", "bid") else "ask",
                "wallet": t.get("maker_address", t.get("taker_address", "")),
                "timestamp": datetime.now(timezone.utc),
            })
        return trades

    async def stream_prices(self, market_ids: list[str]) -> AsyncIterator[dict]:
        """Stream real-time price updates via Polymarket WebSocket."""
        subscribe_msg = {
            "type": "subscribe",
            "channel": "market",
            "assets_ids": market_ids,
        }
        async for ws in websockets.connect(self.ws_url, ping_interval=30):
            try:
                await ws.send(json.dumps(subscribe_msg))
                logger.info("polymarket_ws_connected", markets=len(market_ids))

                async for message in ws:
                    data = json.loads(message)
                    if data.get("type") == "price_change":
                        yield {
                            "market_id": data.get("asset_id"),
                            "platform": Platform.POLYMARKET,
                            "yes_price": float(data.get("price", 0)),
                            "no_price": 1.0 - float(data.get("price", 0)),
                            "timestamp": datetime.now(timezone.utc),
                        }
            except websockets.ConnectionClosed:
                logger.warning("polymarket_ws_disconnected, reconnecting...")
                continue
