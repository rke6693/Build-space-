"""Market data fetchers for prediction market platforms."""

from .polymarket import PolymarketFetcher
from .kalshi import KalshiFetcher
from .aggregator import MarketAggregator

__all__ = ["PolymarketFetcher", "KalshiFetcher", "MarketAggregator"]
