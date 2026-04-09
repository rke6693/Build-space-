"""Polymarket API fetcher.

Polymarket uses the CLOB (Central Limit Order Book) API and a Gamma API
for market metadata. We fetch active markets and filter by resolution date.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

from ..models import Market, MarketSource

logger = logging.getLogger(__name__)

GAMMA_API_BASE = "https://gamma-api.polymarket.com"
MARKETS_ENDPOINT = f"{GAMMA_API_BASE}/markets"


class PolymarketFetcher:
    """Fetches active markets from Polymarket's Gamma API."""

    def __init__(self, timeout: float = 30.0):
        self.timeout = timeout
        self.client = httpx.Client(timeout=timeout, follow_redirects=True)

    def fetch_active_markets(
        self,
        resolution_window_days: int = 14,
        limit: int = 200,
    ) -> list[Market]:
        """Fetch all active Polymarket markets resolving within the window.

        Args:
            resolution_window_days: Only include markets resolving within this many days.
            limit: Max markets per API page.

        Returns:
            List of Market objects.
        """
        markets: list[Market] = []
        now = datetime.now(timezone.utc)
        cutoff = now + timedelta(days=resolution_window_days)
        offset = 0

        while True:
            try:
                resp = self.client.get(
                    MARKETS_ENDPOINT,
                    params={
                        "active": "true",
                        "closed": "false",
                        "limit": limit,
                        "offset": offset,
                    },
                )
                resp.raise_for_status()
                data = resp.json()

                if not data:
                    break

                for item in data:
                    market = self._parse_market(item)
                    if market is None:
                        continue
                    # Filter: must resolve within our window
                    if market.resolution_date and market.resolution_date <= cutoff:
                        markets.append(market)

                offset += limit

                # Safety valve
                if offset > 2000:
                    break

            except httpx.HTTPError as e:
                logger.error(f"Polymarket API error at offset {offset}: {e}")
                break

        logger.info(f"Fetched {len(markets)} Polymarket markets resolving within {resolution_window_days} days")
        return markets

    def _parse_market(self, data: dict) -> Optional[Market]:
        """Parse a single market from the Gamma API response."""
        try:
            # Polymarket returns outcomePrices as a JSON string like "[0.55, 0.45]"
            price = None
            if data.get("outcomePrices"):
                import json
                try:
                    prices = json.loads(data["outcomePrices"])
                    if prices:
                        price = float(prices[0])  # Price of YES outcome
                except (json.JSONDecodeError, IndexError, TypeError):
                    pass

            if price is None:
                # Try bestAsk / bestBid midpoint or other price fields
                price = self._extract_price(data)

            if price is None:
                return None

            resolution_date = None
            end_date_str = data.get("endDate") or data.get("end_date_iso")
            if end_date_str:
                try:
                    resolution_date = datetime.fromisoformat(end_date_str.replace("Z", "+00:00"))
                except ValueError:
                    pass

            slug = data.get("slug", data.get("condition_id", ""))
            url = f"https://polymarket.com/event/{slug}" if slug else ""

            return Market(
                id=str(data.get("id", data.get("condition_id", ""))),
                source=MarketSource.POLYMARKET,
                title=data.get("question", data.get("title", "Unknown")),
                description=data.get("description", ""),
                url=url,
                current_price=max(0.0, min(1.0, price)),
                volume=float(data.get("volume", 0) or 0),
                resolution_date=resolution_date,
                category=data.get("category", data.get("tags", [""])[0] if data.get("tags") else ""),
                fetched_at=datetime.now(timezone.utc),
            )
        except Exception as e:
            logger.debug(f"Failed to parse Polymarket market: {e}")
            return None

    def _extract_price(self, data: dict) -> Optional[float]:
        """Try multiple fields to extract a price."""
        for field in ["clobTokenIds", "bestBid", "lastTradePrice"]:
            val = data.get(field)
            if val is not None:
                try:
                    return float(val)
                except (ValueError, TypeError):
                    continue
        return None

    def close(self):
        self.client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
