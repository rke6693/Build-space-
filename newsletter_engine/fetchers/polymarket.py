"""Polymarket API fetcher.

Polymarket uses the CLOB (Central Limit Order Book) API and a Gamma API
for market metadata. We fetch active markets and filter by resolution date.
"""

import json
import logging
import time
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
        max_pages = 10
        pages_fetched = 0
        consecutive_errors = 0
        max_consecutive_errors = 3

        while pages_fetched < max_pages:
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

                # Handle rate limiting
                if resp.status_code == 429:
                    consecutive_errors += 1
                    if consecutive_errors > max_consecutive_errors:
                        logger.warning("Polymarket: max rate limit retries exceeded")
                        break
                    retry_after = int(resp.headers.get("Retry-After", "3"))
                    logger.warning(f"Polymarket rate limited, waiting {retry_after}s")
                    time.sleep(retry_after)
                    continue

                resp.raise_for_status()
                data = resp.json()
                consecutive_errors = 0
                pages_fetched += 1

                if not isinstance(data, list) or not data:
                    break

                for item in data:
                    market = self._parse_market(item)
                    if market is None:
                        continue
                    if market.resolution_date and market.resolution_date <= cutoff:
                        markets.append(market)

                offset += limit

            except httpx.HTTPError as e:
                consecutive_errors += 1
                logger.error(f"Polymarket API error at offset {offset}: {e}")
                if consecutive_errors >= max_consecutive_errors:
                    logger.error(
                        f"Polymarket: {consecutive_errors} consecutive errors, "
                        f"returning {len(markets)} partial results"
                    )
                    break
                time.sleep(2 ** consecutive_errors)
                continue

        if pages_fetched == 0 and not markets:
            logger.error("Polymarket: fetched 0 pages, API may be down")
        elif pages_fetched < max_pages:
            logger.info(
                f"Fetched {len(markets)} Polymarket markets from {pages_fetched} pages "
                f"(resolving within {resolution_window_days} days)"
            )
        else:
            logger.info(
                f"Fetched {len(markets)} Polymarket markets (hit page limit of {max_pages})"
            )

        return markets

    def _parse_market(self, data: dict) -> Optional[Market]:
        """Parse a single market from the Gamma API response."""
        try:
            # Polymarket returns outcomePrices as a JSON string like "[0.55, 0.45]"
            price = None
            outcome_prices = data.get("outcomePrices")
            if outcome_prices:
                try:
                    prices = json.loads(outcome_prices) if isinstance(outcome_prices, str) else outcome_prices
                    if isinstance(prices, list) and prices:
                        price = float(prices[0])
                except (json.JSONDecodeError, IndexError, TypeError, ValueError):
                    pass

            if price is None:
                price = self._extract_price(data)

            if price is None:
                return None

            resolution_date = None
            end_date_str = data.get("endDate") or data.get("end_date_iso")
            if end_date_str:
                try:
                    resolution_date = datetime.fromisoformat(
                        end_date_str.replace("Z", "+00:00")
                    )
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
                category=data.get(
                    "category",
                    data.get("tags", [""])[0] if data.get("tags") else "",
                ),
                fetched_at=datetime.now(timezone.utc),
            )
        except Exception as e:
            logger.debug(f"Failed to parse Polymarket market: {e}")
            return None

    def _extract_price(self, data: dict) -> Optional[float]:
        """Try multiple fields to extract a price."""
        for field_name in ["bestBid", "lastTradePrice"]:
            val = data.get(field_name)
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
