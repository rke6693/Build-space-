"""Kalshi API fetcher.

Kalshi provides a public API for market data. We fetch active markets
and filter by close/resolution date within our window.
"""

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

from ..models import Market, MarketSource

logger = logging.getLogger(__name__)

KALSHI_API_BASE = "https://api.elections.kalshi.com/trade-api/v2"
MARKETS_ENDPOINT = f"{KALSHI_API_BASE}/markets"


class KalshiFetcher:
    """Fetches active markets from Kalshi's public API."""

    def __init__(self, timeout: float = 30.0):
        self.timeout = timeout
        self.client = httpx.Client(
            timeout=timeout,
            follow_redirects=True,
            headers={
                "Accept": "application/json",
            },
        )

    def fetch_active_markets(
        self,
        resolution_window_days: int = 14,
        limit: int = 200,
    ) -> list[Market]:
        """Fetch active Kalshi markets resolving within the window.

        Args:
            resolution_window_days: Only include markets resolving within this many days.
            limit: Max markets per page.

        Returns:
            List of Market objects.
        """
        markets: list[Market] = []
        now = datetime.now(timezone.utc)
        cutoff = now + timedelta(days=resolution_window_days)
        cursor: Optional[str] = None
        rate_limit_retries = 0
        max_rate_limit_retries = 3
        pages_fetched = 0
        max_pages = 10  # Cap total pages to avoid excessive API calls

        while pages_fetched < max_pages:
            try:
                params: dict = {
                    "limit": limit,
                    "status": "open",
                }
                if cursor:
                    params["cursor"] = cursor

                resp = self.client.get(MARKETS_ENDPOINT, params=params)

                # Handle rate limiting with retry (max 3 retries)
                if resp.status_code == 429:
                    rate_limit_retries += 1
                    if rate_limit_retries > max_rate_limit_retries:
                        logger.warning(f"Kalshi rate limit exceeded {max_rate_limit_retries} retries, stopping")
                        break
                    retry_after = int(resp.headers.get("Retry-After", "5"))
                    logger.warning(f"Kalshi rate limited, waiting {retry_after}s (retry {rate_limit_retries}/{max_rate_limit_retries})")
                    time.sleep(retry_after)
                    continue

                resp.raise_for_status()
                data = resp.json()
                rate_limit_retries = 0  # Reset on success
                pages_fetched += 1

                market_list = data.get("markets", [])
                if not market_list:
                    break

                for item in market_list:
                    market = self._parse_market(item)
                    if market is None:
                        continue
                    if market.resolution_date and market.resolution_date <= cutoff:
                        markets.append(market)

                cursor = data.get("cursor")
                if not cursor:
                    break

                # Respect rate limits: small delay between pages
                time.sleep(0.5)

            except httpx.HTTPError as e:
                logger.error(f"Kalshi API error: {e}")
                break

        logger.info(f"Fetched {len(markets)} Kalshi markets resolving within {resolution_window_days} days")
        return markets

    def _parse_market(self, data: dict) -> Optional[Market]:
        """Parse a single market from Kalshi API response."""
        try:
            # Kalshi prices are in cents (0-100), convert to 0-1
            yes_price = data.get("yes_ask") or data.get("last_price") or data.get("yes_bid")
            if yes_price is None:
                return None

            price = float(yes_price) / 100.0 if float(yes_price) > 1.0 else float(yes_price)

            resolution_date = None
            close_time = data.get("close_time") or data.get("expected_expiration_time")
            if close_time:
                try:
                    resolution_date = datetime.fromisoformat(close_time.replace("Z", "+00:00"))
                except ValueError:
                    pass

            ticker = data.get("ticker", "")
            url = f"https://kalshi.com/markets/{ticker}" if ticker else ""

            return Market(
                id=ticker or str(data.get("id", "")),
                source=MarketSource.KALSHI,
                title=data.get("title", "Unknown"),
                description=data.get("subtitle", data.get("rules_primary", "")),
                url=url,
                current_price=max(0.0, min(1.0, price)),
                volume=float(data.get("volume", 0) or 0),
                resolution_date=resolution_date,
                category=data.get("category", ""),
                fetched_at=datetime.now(timezone.utc),
            )
        except Exception as e:
            logger.debug(f"Failed to parse Kalshi market: {e}")
            return None

    def close(self):
        self.client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
