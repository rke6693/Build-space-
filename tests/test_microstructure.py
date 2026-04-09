"""
Tests for whale tracking and market microstructure analytics.
"""

import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock

from api.models import OrderSide, Platform, WhaleAlert
from api.services.whale_tracker import MicrostructureAnalyzer, WhaleTracker


class TestWhaleTracker:
    """Test whale detection and flow tracking."""

    def test_whale_flow_summary_empty(self):
        tracker = WhaleTracker({})
        summary = tracker.get_whale_flow_summary(24)
        assert summary["total_whale_volume_usd"] == 0
        assert summary["unique_whales"] == 0

    def test_wallet_profile_empty(self):
        tracker = WhaleTracker({})
        profile = tracker.get_wallet_profile("0xunknown")
        assert profile["trades"] == 0

    def test_wallet_profile_with_history(self):
        tracker = WhaleTracker({})
        alert = WhaleAlert(
            id="test-1",
            market_id="m1",
            market_title="Test Market",
            platform=Platform.POLYMARKET,
            wallet_address="0xabc",
            side=OrderSide.BID,
            price=0.65,
            size=10000,
            usd_value=50000,
            timestamp=datetime.now(timezone.utc),
        )
        tracker._wallet_history["0xabc"].append(alert)

        profile = tracker.get_wallet_profile("0xabc")
        assert profile["trades"] == 1
        assert profile["total_volume_usd"] == 50000
        assert profile["buy_volume_usd"] == 50000

    def test_subscribe_unsubscribe(self):
        tracker = WhaleTracker({})
        queue = tracker.subscribe()
        assert len(tracker._subscribers) == 1
        tracker.unsubscribe(queue)
        assert len(tracker._subscribers) == 0


class TestMicrostructureAnalyzer:
    """Test market microstructure calculations."""

    @pytest.mark.asyncio
    async def test_analyze_market(self, sample_order_book, mock_connector):
        mock_connector.get_order_book = AsyncMock(return_value=sample_order_book)
        mock_connector.get_trades = AsyncMock(return_value=[
            {"price": 0.65, "size": 100, "usd_value": 65, "side": "bid",
             "wallet": "0x1", "timestamp": datetime.now(timezone.utc)},
            {"price": 0.64, "size": 200, "usd_value": 128, "side": "ask",
             "wallet": "0x2", "timestamp": datetime.now(timezone.utc)},
        ])

        analyzer = MicrostructureAnalyzer({Platform.POLYMARKET: mock_connector})
        result = await analyzer.analyze_market("test-123", Platform.POLYMARKET)

        assert result.market_id == "test-123"
        assert result.current_spread == 0.02
        assert result.bid_depth_10bps >= 0
        assert result.ask_depth_10bps >= 0
        assert result.volume_1h >= 0

    def test_depth_within_bps(self, sample_order_book):
        depth = MicrostructureAnalyzer._depth_within_bps(
            sample_order_book.bids, 0.65, 50
        )
        assert depth > 0

    def test_slippage_estimation(self, sample_order_book):
        slippage = MicrostructureAnalyzer._estimate_slippage(sample_order_book, 1000)
        assert slippage >= 0
