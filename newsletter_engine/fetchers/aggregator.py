"""Aggregates markets from all sources."""

import logging
from typing import Optional

from ..models import Market
from .polymarket import PolymarketFetcher
from .kalshi import KalshiFetcher

logger = logging.getLogger(__name__)


class MarketAggregator:
    """Fetches and combines markets from all supported platforms."""

    def __init__(self):
        self.polymarket = PolymarketFetcher()
        self.kalshi = KalshiFetcher()

    def fetch_all(
        self,
        resolution_window_days: int = 14,
        min_volume: float = 0.0,
    ) -> list[Market]:
        """Fetch active markets from all platforms.

        Args:
            resolution_window_days: Only markets resolving within this window.
            min_volume: Minimum trading volume to include.

        Returns:
            Combined, deduplicated, sorted list of markets.
        """
        all_markets: list[Market] = []

        # Fetch from each source, gracefully handling failures
        for name, fetcher in [("Polymarket", self.polymarket), ("Kalshi", self.kalshi)]:
            try:
                markets = fetcher.fetch_active_markets(
                    resolution_window_days=resolution_window_days,
                )
                logger.info(f"{name}: fetched {len(markets)} markets")
                all_markets.extend(markets)
            except Exception as e:
                logger.error(f"Failed to fetch from {name}: {e}")

        # Filter by minimum volume
        if min_volume > 0:
            all_markets = [m for m in all_markets if m.volume >= min_volume]

        # Sort by volume descending (most liquid first)
        all_markets.sort(key=lambda m: m.volume, reverse=True)

        # Deduplicate by title similarity
        all_markets = self._deduplicate(all_markets)

        logger.info(f"Total aggregated markets: {len(all_markets)}")
        return all_markets

    def _deduplicate(self, markets: list[Market]) -> list[Market]:
        """Remove near-duplicate markets across platforms.

        Uses simple title normalization. Keeps the higher-volume version.
        """
        seen: dict[str, Market] = {}
        result: list[Market] = []

        for market in markets:
            key = self._normalize_title(market.title)
            if key in seen:
                # Keep the one with higher volume
                if market.volume > seen[key].volume:
                    result = [m for m in result if self._normalize_title(m.title) != key]
                    result.append(market)
                    seen[key] = market
            else:
                seen[key] = market
                result.append(market)

        return result

    @staticmethod
    def _normalize_title(title: str) -> str:
        """Normalize a title for deduplication."""
        import re
        title = title.lower().strip()
        title = re.sub(r'[^a-z0-9\s]', '', title)
        title = re.sub(r'\s+', ' ', title)
        # Remove common filler words
        for word in ["will", "the", "be", "to", "in", "on", "by", "a", "an"]:
            title = title.replace(f" {word} ", " ")
        return title.strip()

    def close(self):
        self.polymarket.close()
        self.kalshi.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
