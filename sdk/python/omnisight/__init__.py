"""
OmniSight Python SDK
The Bloomberg Terminal for Prediction Markets — Official Python Client

Usage:
    from omnisight import OmniSight

    client = OmniSight(api_key="your-api-key")

    # Get normalized odds across all platforms
    odds = client.get_normalized_odds(category="politics")

    # Stream real-time prices
    async for price in client.stream_prices(["market-id-1"], platform="polymarket"):
        print(f"{price.market_id}: {price.yes_price}")

    # Whale alerts
    whales = client.get_whale_alerts(min_usd=50000)

    # Arbitrage scanner
    arbs = client.get_arbitrage_opportunities(min_profit_bps=20)
"""

from omnisight.client import OmniSight
from omnisight.models import (
    Market, NormalizedOdds, OrderBook, WhaleAlert,
    ArbitrageOpportunity, MarketMicrostructure, Resolution,
)

__version__ = "1.0.0"
__all__ = [
    "OmniSight",
    "Market",
    "NormalizedOdds",
    "OrderBook",
    "WhaleAlert",
    "ArbitrageOpportunity",
    "MarketMicrostructure",
    "Resolution",
]
