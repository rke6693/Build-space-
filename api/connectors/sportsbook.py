"""
Sportsbook Connector — Unified adapter for Pinnacle, Betfair, DraftKings, FanDuel.
Normalizes American/Decimal/Fractional odds into implied probabilities.
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


class OddsConverter:
    """Convert between odds formats and implied probability."""

    @staticmethod
    def american_to_probability(odds: float) -> float:
        """Convert American odds to implied probability."""
        if odds > 0:
            return 100.0 / (odds + 100.0)
        else:
            return abs(odds) / (abs(odds) + 100.0)

    @staticmethod
    def decimal_to_probability(odds: float) -> float:
        """Convert decimal odds to implied probability."""
        if odds <= 0:
            return 0.0
        return 1.0 / odds

    @staticmethod
    def fractional_to_probability(numerator: float, denominator: float) -> float:
        """Convert fractional odds to implied probability."""
        return denominator / (numerator + denominator)

    @staticmethod
    def probability_to_american(prob: float) -> float:
        """Convert probability to American odds."""
        if prob <= 0 or prob >= 1:
            return 0
        if prob >= 0.5:
            return -(prob / (1 - prob)) * 100
        else:
            return ((1 - prob) / prob) * 100

    @staticmethod
    def remove_vig(prob_yes: float, prob_no: float) -> tuple[float, float]:
        """Remove bookmaker vigorish to get fair probabilities."""
        total = prob_yes + prob_no
        if total == 0:
            return 0.5, 0.5
        return prob_yes / total, prob_no / total


class PinnacleConnector(BaseConnector):
    """Connector for Pinnacle sharp lines (lowest vig sportsbook)."""

    platform = Platform.PINNACLE
    base_url = "https://api.pinnacle.com/v3"

    def _build_headers(self) -> dict:
        headers = super()._build_headers()
        if self.api_key:
            import base64
            headers["Authorization"] = f"Basic {base64.b64encode(self.api_key.encode()).decode()}"
        return headers

    def _normalize_market(self, event: dict, line: dict) -> MarketResponse:
        """Convert Pinnacle event + odds into unified market."""
        moneyline = line.get("moneyline", {})
        home_odds = moneyline.get("home", 0)
        away_odds = moneyline.get("away", 0)

        prob_yes = OddsConverter.american_to_probability(home_odds) if home_odds else 0.5
        prob_no = OddsConverter.american_to_probability(away_odds) if away_odds else 0.5
        fair_yes, fair_no = OddsConverter.remove_vig(prob_yes, prob_no)

        return MarketResponse(
            id=f"pinnacle-{event.get('id', '')}",
            platform=Platform.PINNACLE,
            platform_market_id=str(event.get("id", "")),
            title=f"{event.get('home', '')} vs {event.get('away', '')}",
            description=f"League: {event.get('league', {}).get('name', '')}",
            category=self._sport_to_category(event.get("sportId")),
            yes_price=round(fair_yes, 4),
            no_price=round(fair_no, 4),
            last_trade_price=round(fair_yes, 4),
            volume_24h=0,
            volume_total=0,
            liquidity=float(line.get("maxMoneyline", 0) or 0),
            status=MarketStatus.ACTIVE,
            end_date=self._parse_date(event.get("starts")),
            tags=["sports", event.get("league", {}).get("name", "")],
        )

    @staticmethod
    def _sport_to_category(sport_id: Optional[int]) -> str:
        sport_map = {
            1: "soccer", 2: "basketball", 3: "baseball", 4: "hockey",
            5: "tennis", 6: "football", 7: "mma", 8: "boxing",
            12: "esports", 33: "politics",
        }
        return sport_map.get(sport_id, "other")

    @staticmethod
    def _parse_date(val) -> Optional[datetime]:
        if not val:
            return None
        try:
            return datetime.fromisoformat(val.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            return None

    async def get_markets(
        self,
        category: Optional[str] = None,
        status: MarketStatus = MarketStatus.ACTIVE,
        limit: int = 100,
        offset: int = 0,
    ) -> list[MarketResponse]:
        sport_id = self._category_to_sport(category) if category else 33  # Default: politics
        fixtures = await self._request("GET", f"/fixtures", params={"sportId": sport_id})
        odds_data = await self._request("GET", f"/odds", params={"sportId": sport_id})

        odds_map = {}
        for league in odds_data.get("leagues", []):
            for event in league.get("events", []):
                for period in event.get("periods", []):
                    if period.get("number") == 0:  # Full game
                        odds_map[event["id"]] = period

        markets = []
        for league in fixtures.get("league", fixtures.get("leagues", [])):
            league_data = league if isinstance(league, dict) else {}
            for event in league_data.get("events", []):
                eid = event.get("id")
                if eid in odds_map:
                    markets.append(self._normalize_market(event, odds_map[eid]))

        return markets[offset:offset + limit]

    @staticmethod
    def _category_to_sport(category: str) -> int:
        rev_map = {
            "soccer": 1, "basketball": 2, "baseball": 3, "hockey": 4,
            "tennis": 5, "football": 6, "mma": 7, "boxing": 8,
            "esports": 12, "politics": 33,
        }
        return rev_map.get(category.lower(), 33)

    async def get_market(self, market_id: str) -> MarketResponse:
        # Pinnacle doesn't have single event lookup; fetch and filter
        markets = await self.get_markets()
        for m in markets:
            if m.platform_market_id == market_id:
                return m
        raise ValueError(f"Market {market_id} not found on Pinnacle")

    async def get_order_book(self, market_id: str) -> OrderBookSnapshot:
        # Sportsbooks don't have traditional order books; synthesize from lines
        market = await self.get_market(market_id)
        yes = market.yes_price or 0.5
        no = market.no_price or 0.5

        return OrderBookSnapshot(
            market_id=market_id,
            platform=Platform.PINNACLE,
            timestamp=datetime.now(timezone.utc),
            bids=[OrderLevel(price=yes - 0.01, size=market.liquidity, cumulative_size=market.liquidity)],
            asks=[OrderLevel(price=yes + 0.01, size=market.liquidity, cumulative_size=market.liquidity)],
            bid_depth=market.liquidity,
            ask_depth=market.liquidity,
            mid_price=yes,
            spread=0.02,  # ~2% typical sportsbook spread after vig removal
            imbalance=0,
        )

    async def get_trades(
        self, market_id: str, since: Optional[float] = None, limit: int = 500
    ) -> list[dict]:
        # Sportsbooks don't expose trade history
        return []

    async def stream_prices(self, market_ids: list[str]) -> AsyncIterator[dict]:
        """Poll-based streaming for sportsbooks (no native WebSocket)."""
        import asyncio
        while True:
            for mid in market_ids:
                try:
                    market = await self.get_market(mid)
                    yield {
                        "market_id": mid,
                        "platform": Platform.PINNACLE,
                        "yes_price": market.yes_price,
                        "no_price": market.no_price,
                        "timestamp": datetime.now(timezone.utc),
                    }
                except Exception as e:
                    logger.error("pinnacle_poll_error", market=mid, error=str(e))
            await asyncio.sleep(15)  # Pinnacle allows ~4 req/sec


class BetfairConnector(BaseConnector):
    """Connector for Betfair Exchange (order book-based betting exchange)."""

    platform = Platform.BETFAIR
    base_url = "https://api.betfair.com/exchange/betting/rest/v1.0"

    def __init__(self, api_key: Optional[str] = None, session_token: Optional[str] = None):
        super().__init__(api_key)
        self.session_token = session_token

    def _build_headers(self) -> dict:
        headers = super()._build_headers()
        if self.api_key:
            headers["X-Application"] = self.api_key
        if self.session_token:
            headers["X-Authentication"] = self.session_token
        return headers

    def _normalize_market(self, raw: dict, runners: list = None) -> MarketResponse:
        """Convert Betfair market catalog to unified schema."""
        runner = (runners or [{}])[0] if runners else {}
        last_price = runner.get("lastPriceTraded", 0)
        prob = OddsConverter.decimal_to_probability(last_price) if last_price > 0 else 0.5

        return MarketResponse(
            id=f"betfair-{raw.get('marketId', '')}",
            platform=Platform.BETFAIR,
            platform_market_id=raw.get("marketId", ""),
            title=raw.get("marketName", ""),
            description=raw.get("description", {}).get("rules", ""),
            category=raw.get("eventType", {}).get("name", ""),
            yes_price=round(prob, 4),
            no_price=round(1.0 - prob, 4),
            last_trade_price=round(prob, 4),
            volume_total=float(runner.get("totalMatched", 0) or 0),
            status=MarketStatus.ACTIVE if raw.get("status") == "OPEN" else MarketStatus.CLOSED,
            end_date=self._parse_date(raw.get("marketStartTime")),
            tags=["exchange", raw.get("eventType", {}).get("name", "")],
        )

    @staticmethod
    def _parse_date(val) -> Optional[datetime]:
        if not val:
            return None
        try:
            return datetime.fromisoformat(val.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            return None

    async def get_markets(
        self,
        category: Optional[str] = None,
        status: MarketStatus = MarketStatus.ACTIVE,
        limit: int = 100,
        offset: int = 0,
    ) -> list[MarketResponse]:
        filter_params = {"filter": {"inPlayOnly": False}}
        if category:
            filter_params["filter"]["eventTypeIds"] = [self._category_to_type(category)]

        data = await self._request("POST", "/listMarketCatalogue", json={
            **filter_params,
            "maxResults": str(limit),
            "marketProjection": ["EVENT", "MARKET_DESCRIPTION"],
        })
        return [self._normalize_market(m) for m in (data if isinstance(data, list) else [])]

    @staticmethod
    def _category_to_type(cat: str) -> str:
        type_map = {
            "soccer": "1", "tennis": "2", "golf": "3",
            "cricket": "4", "rugby": "5", "boxing": "6",
            "horse_racing": "7", "politics": "2378961",
        }
        return type_map.get(cat.lower(), "2378961")

    async def get_market(self, market_id: str) -> MarketResponse:
        data = await self._request("POST", "/listMarketBook", json={
            "marketIds": [market_id],
            "priceProjection": {"priceData": ["EX_BEST_OFFERS"]},
        })
        books = data if isinstance(data, list) else []
        if not books:
            raise ValueError(f"Market {market_id} not found on Betfair")
        return self._normalize_market(books[0], books[0].get("runners", []))

    async def get_order_book(self, market_id: str) -> OrderBookSnapshot:
        data = await self._request("POST", "/listMarketBook", json={
            "marketIds": [market_id],
            "priceProjection": {"priceData": ["EX_ALL_OFFERS"], "virtualise": True},
        })
        books = data if isinstance(data, list) else []
        runner = books[0].get("runners", [{}])[0] if books else {}
        ex = runner.get("ex", {})

        bids = []
        cumulative = 0.0
        for level in ex.get("availableToBack", []):
            size = float(level.get("size", 0))
            cumulative += size
            bids.append(OrderLevel(
                price=OddsConverter.decimal_to_probability(level.get("price", 1)),
                size=size,
                cumulative_size=cumulative,
            ))

        asks = []
        cumulative = 0.0
        for level in ex.get("availableToLay", []):
            size = float(level.get("size", 0))
            cumulative += size
            asks.append(OrderLevel(
                price=OddsConverter.decimal_to_probability(level.get("price", 1)),
                size=size,
                cumulative_size=cumulative,
            ))

        best_bid = bids[0].price if bids else 0.49
        best_ask = asks[0].price if asks else 0.51
        bid_depth = sum(b.size for b in bids)
        ask_depth = sum(a.size for a in asks)
        total = bid_depth + ask_depth

        return OrderBookSnapshot(
            market_id=market_id,
            platform=Platform.BETFAIR,
            timestamp=datetime.now(timezone.utc),
            bids=bids,
            asks=asks,
            bid_depth=bid_depth,
            ask_depth=ask_depth,
            mid_price=(best_bid + best_ask) / 2,
            spread=best_ask - best_bid,
            imbalance=(bid_depth - ask_depth) / total if total > 0 else 0,
        )

    async def get_trades(
        self, market_id: str, since: Optional[float] = None, limit: int = 500
    ) -> list[dict]:
        # Betfair doesn't expose individual trade history in real-time
        return []

    async def stream_prices(self, market_ids: list[str]) -> AsyncIterator[dict]:
        """Stream from Betfair Exchange Stream API."""
        import asyncio
        stream_url = "wss://stream-api.betfair.com/api/v1"
        async for ws in websockets.connect(stream_url, ping_interval=30):
            try:
                # Authenticate
                await ws.send(json.dumps({
                    "op": "authentication",
                    "appKey": self.api_key,
                    "session": self.session_token,
                }))

                # Subscribe to markets
                await ws.send(json.dumps({
                    "op": "marketSubscription",
                    "marketFilter": {"marketIds": market_ids},
                    "marketDataFilter": {"ladderLevels": 3},
                }))

                logger.info("betfair_ws_connected", markets=len(market_ids))

                async for message in ws:
                    data = json.loads(message)
                    if data.get("op") == "mcm":
                        for mc in data.get("mc", []):
                            mid = mc.get("id", "")
                            for rc in mc.get("rc", []):
                                back = rc.get("atb", [[0, 0]])[0]
                                price = OddsConverter.decimal_to_probability(back[0]) if back else 0.5
                                yield {
                                    "market_id": mid,
                                    "platform": Platform.BETFAIR,
                                    "yes_price": price,
                                    "no_price": 1.0 - price,
                                    "timestamp": datetime.now(timezone.utc),
                                }
            except websockets.ConnectionClosed:
                logger.warning("betfair_ws_disconnected, reconnecting...")
                continue
