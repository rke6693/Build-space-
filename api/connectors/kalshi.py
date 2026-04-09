"""
Kalshi Connector — REST API + WebSocket integration for Kalshi exchange.
Kalshi is a CFTC-regulated exchange for event contracts.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import AsyncIterator, Optional

import structlog
import websockets

from api.connectors.base import BaseConnector
from api.models import (
    MarketResponse, MarketStatus, OrderBookSnapshot, OrderLevel,
    Platform, PriceSnapshotDB,
)

logger = structlog.get_logger(__name__)


class KalshiConnector(BaseConnector):
    """Connector for Kalshi's event contracts API."""

    platform = Platform.KALSHI
    base_url = "https://api.elections.kalshi.com/trade-api/v2"
    ws_url = "wss://api.elections.kalshi.com/trade-api/ws/v2"

    def _build_headers(self) -> dict:
        headers = super()._build_headers()
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def authenticate(self) -> str:
        """Exchange API key/secret for session token."""
        if not self.api_key or not self.api_secret:
            raise ValueError("Kalshi API key and secret required for authentication")
        data = await self._request("POST", "/login", json={
            "email": self.api_key,
            "password": self.api_secret,
        })
        token = data.get("token", "")
        # Update client headers with session token
        client = await self.get_client()
        client.headers["Authorization"] = f"Bearer {token}"
        return token

    def _normalize_market(self, raw: dict) -> MarketResponse:
        """Convert Kalshi API response to unified schema."""
        yes_price = raw.get("yes_ask", raw.get("last_price"))
        no_price = raw.get("no_ask")

        if yes_price is not None:
            yes_price = yes_price / 100.0  # Kalshi uses cents
        if no_price is not None:
            no_price = no_price / 100.0

        if yes_price is not None and no_price is None:
            no_price = round(1.0 - yes_price, 4)

        status_map = {
            "open": MarketStatus.ACTIVE,
            "active": MarketStatus.ACTIVE,
            "closed": MarketStatus.CLOSED,
            "settled": MarketStatus.RESOLVED,
        }

        return MarketResponse(
            id=f"kalshi-{raw.get('ticker', '')}",
            platform=Platform.KALSHI,
            platform_market_id=raw.get("ticker", ""),
            title=raw.get("title", raw.get("subtitle", "")),
            description=raw.get("rules_primary", ""),
            category=raw.get("category", raw.get("series_ticker", "")),
            yes_price=yes_price,
            no_price=no_price,
            last_trade_price=raw.get("last_price", 0) / 100.0 if raw.get("last_price") else None,
            volume_24h=float(raw.get("volume_24h", 0) or 0),
            volume_total=float(raw.get("volume", 0) or 0),
            liquidity=float(raw.get("liquidity", 0) or 0),
            open_interest=float(raw.get("open_interest", 0) or 0),
            status=status_map.get(raw.get("status", "open"), MarketStatus.ACTIVE),
            end_date=self._parse_date(raw.get("close_time", raw.get("expiration_time"))),
            tags=raw.get("tags", []),
            created_at=self._parse_date(raw.get("open_time")),
            updated_at=self._parse_date(raw.get("last_trade_time")),
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
        params = {"limit": limit, "cursor": offset}
        if category:
            params["series_ticker"] = category
        if status == MarketStatus.ACTIVE:
            params["status"] = "open"

        data = await self._request("GET", "/markets", params=params)
        raw_markets = data.get("markets", [])
        return [self._normalize_market(m) for m in raw_markets]

    async def get_market(self, market_id: str) -> MarketResponse:
        data = await self._request("GET", f"/markets/{market_id}")
        return self._normalize_market(data.get("market", data))

    async def get_order_book(self, market_id: str) -> OrderBookSnapshot:
        data = await self._request("GET", f"/markets/{market_id}/orderbook")

        bids = []
        cumulative = 0.0
        for price_str, size in sorted(
            (data.get("yes", {}).get("bids", {}) or {}).items(),
            key=lambda x: -int(x[0])
        ):
            size_f = float(size)
            cumulative += size_f
            bids.append(OrderLevel(
                price=int(price_str) / 100.0,
                size=size_f,
                cumulative_size=cumulative,
            ))

        asks = []
        cumulative = 0.0
        for price_str, size in sorted(
            (data.get("yes", {}).get("asks", {}) or {}).items(),
            key=lambda x: int(x[0])
        ):
            size_f = float(size)
            cumulative += size_f
            asks.append(OrderLevel(
                price=int(price_str) / 100.0,
                size=size_f,
                cumulative_size=cumulative,
            ))

        best_bid = bids[0].price if bids else 0
        best_ask = asks[0].price if asks else 1
        mid = (best_bid + best_ask) / 2
        spread = best_ask - best_bid

        bid_depth = sum(b.size for b in bids)
        ask_depth = sum(a.size for a in asks)
        total = bid_depth + ask_depth
        imbalance = (bid_depth - ask_depth) / total if total > 0 else 0

        return OrderBookSnapshot(
            market_id=market_id,
            platform=Platform.KALSHI,
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
        params = {"ticker": market_id, "limit": limit}
        if since:
            params["min_ts"] = int(since)

        data = await self._request("GET", f"/markets/{market_id}/trades", params=params)
        trades = []
        for t in data.get("trades", []):
            price = t.get("yes_price", t.get("no_price", 0)) / 100.0
            contracts = t.get("count", t.get("contracts", 1))
            trades.append({
                "id": t.get("trade_id", ""),
                "market_id": market_id,
                "market_title": "",
                "price": price,
                "size": float(contracts),
                "usd_value": price * float(contracts),
                "side": "bid" if t.get("taker_side", "").lower() in ("yes", "buy") else "ask",
                "user_id": t.get("user_id", ""),
                "timestamp": datetime.now(timezone.utc),
            })
        return trades

    async def stream_prices(self, market_ids: list[str]) -> AsyncIterator[dict]:
        """Stream real-time prices from Kalshi WebSocket."""
        async for ws in websockets.connect(self.ws_url, ping_interval=30):
            try:
                # Authenticate WebSocket
                if self.api_key:
                    await ws.send(json.dumps({
                        "type": "auth",
                        "token": self.api_key,
                    }))

                # Subscribe to market channels
                for mid in market_ids:
                    await ws.send(json.dumps({
                        "type": "subscribe",
                        "channel": "orderbook_delta",
                        "params": {"market_ticker": mid},
                    }))

                logger.info("kalshi_ws_connected", markets=len(market_ids))

                async for message in ws:
                    data = json.loads(message)
                    msg_type = data.get("type", "")

                    if msg_type in ("orderbook_snapshot", "orderbook_delta"):
                        ticker = data.get("msg", {}).get("market_ticker", "")
                        yes_price = data.get("msg", {}).get("yes_price", 0) / 100.0
                        yield {
                            "market_id": ticker,
                            "platform": Platform.KALSHI,
                            "yes_price": yes_price,
                            "no_price": 1.0 - yes_price,
                            "timestamp": datetime.now(timezone.utc),
                        }
            except websockets.ConnectionClosed:
                logger.warning("kalshi_ws_disconnected, reconnecting...")
                continue
