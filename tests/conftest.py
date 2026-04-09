"""
OmniSight — Test Configuration
Shared fixtures for unit and integration tests.
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from api.models import (
    MarketResponse, MarketStatus, OrderBookSnapshot, OrderLevel,
    Platform, ResolutionOutcome,
)

# Note: pytest-asyncio with asyncio_mode="auto" (pyproject.toml) handles
# event loop creation. No manual event_loop fixture needed.


@pytest.fixture
def sample_market() -> MarketResponse:
    return MarketResponse(
        id="poly-test-123",
        platform=Platform.POLYMARKET,
        platform_market_id="test-123",
        title="US Presidential Election 2028 — Republican Nominee",
        description="Who will be the Republican nominee?",
        category="politics",
        yes_price=0.42,
        no_price=0.58,
        last_trade_price=0.42,
        volume_24h=18_420_000,
        volume_total=45_000_000,
        liquidity=5_200_000,
        open_interest=12_000_000,
        status=MarketStatus.ACTIVE,
        end_date=datetime(2028, 11, 5, tzinfo=timezone.utc),
        tags=["politics", "election"],
        created_at=datetime(2024, 6, 1, tzinfo=timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


@pytest.fixture
def sample_market_kalshi() -> MarketResponse:
    return MarketResponse(
        id="kalshi-test-456",
        platform=Platform.KALSHI,
        platform_market_id="test-456",
        title="Republican Presidential Nominee 2028",
        category="politics",
        yes_price=0.44,
        no_price=0.56,
        last_trade_price=0.44,
        volume_24h=12_800_000,
        volume_total=32_000_000,
        liquidity=3_800_000,
        status=MarketStatus.ACTIVE,
        end_date=datetime(2028, 11, 5, tzinfo=timezone.utc),
        tags=["politics"],
    )


@pytest.fixture
def sample_market_pinnacle() -> MarketResponse:
    return MarketResponse(
        id="pinnacle-test-789",
        platform=Platform.PINNACLE,
        platform_market_id="test-789",
        title="2028 US Presidential Election — Republican Winner",
        category="politics",
        yes_price=0.40,
        no_price=0.60,
        volume_24h=0,
        liquidity=8_200_000,
        status=MarketStatus.ACTIVE,
    )


@pytest.fixture
def sample_order_book() -> OrderBookSnapshot:
    return OrderBookSnapshot(
        market_id="test-123",
        platform=Platform.POLYMARKET,
        timestamp=datetime.now(timezone.utc),
        bids=[
            OrderLevel(price=0.64, size=5200, cumulative_size=5200),
            OrderLevel(price=0.63, size=7200, cumulative_size=12400),
            OrderLevel(price=0.62, size=16200, cumulative_size=28600),
            OrderLevel(price=0.61, size=13500, cumulative_size=42100),
            OrderLevel(price=0.60, size=16100, cumulative_size=58200),
        ],
        asks=[
            OrderLevel(price=0.66, size=4800, cumulative_size=4800),
            OrderLevel(price=0.67, size=6400, cumulative_size=11200),
            OrderLevel(price=0.68, size=13600, cumulative_size=24800),
            OrderLevel(price=0.69, size=13600, cumulative_size=38400),
            OrderLevel(price=0.70, size=13700, cumulative_size=52100),
        ],
        bid_depth=58200,
        ask_depth=52100,
        mid_price=0.65,
        spread=0.02,
        imbalance=0.055,
    )


@pytest.fixture
def mock_connector():
    """Create a mock platform connector."""
    connector = AsyncMock()
    connector.platform = Platform.POLYMARKET
    connector.get_markets = AsyncMock(return_value=[])
    connector.get_market = AsyncMock()
    connector.get_order_book = AsyncMock()
    connector.get_trades = AsyncMock(return_value=[])
    connector.get_whale_trades = AsyncMock(return_value=[])
    connector.close = AsyncMock()
    return connector
