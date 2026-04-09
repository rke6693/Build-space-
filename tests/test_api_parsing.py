"""Tests for market API response parsing.

Tests the parser logic WITHOUT making real API calls. We feed in mock
response data and verify correct Market objects come out.
"""

from datetime import datetime, timezone

import pytest

from newsletter_engine.fetchers.polymarket import PolymarketFetcher
from newsletter_engine.fetchers.kalshi import KalshiFetcher
from newsletter_engine.models import MarketSource


class TestPolymarketParsing:
    def setup_method(self):
        self.fetcher = PolymarketFetcher()

    def test_parse_standard_market(self):
        data = {
            "id": "12345",
            "question": "Will BTC hit $100K?",
            "description": "Bitcoin price prediction",
            "slug": "btc-100k",
            "outcomePrices": '["0.65", "0.35"]',
            "volume": 5000000,
            "endDate": "2026-04-20T00:00:00Z",
            "active": True,
            "category": "crypto",
        }
        market = self.fetcher._parse_market(data)

        assert market is not None
        assert market.id == "12345"
        assert market.source == MarketSource.POLYMARKET
        assert market.title == "Will BTC hit $100K?"
        assert market.current_price == pytest.approx(0.65)
        assert market.volume == 5000000
        assert market.url == "https://polymarket.com/event/btc-100k"
        assert market.resolution_date is not None

    def test_parse_outcome_prices_as_list(self):
        """outcomePrices can be an actual list, not just a JSON string."""
        data = {
            "id": "123",
            "question": "Test?",
            "outcomePrices": [0.55, 0.45],
            "endDate": "2026-05-01T00:00:00Z",
        }
        market = self.fetcher._parse_market(data)
        assert market is not None
        assert market.current_price == pytest.approx(0.55)

    def test_parse_missing_price_returns_none(self):
        data = {
            "id": "123",
            "question": "Test?",
            "endDate": "2026-05-01T00:00:00Z",
            # No price fields at all
        }
        market = self.fetcher._parse_market(data)
        assert market is None

    def test_parse_clamps_price(self):
        """Prices outside 0-1 should be clamped."""
        data = {
            "id": "123",
            "question": "Test?",
            "outcomePrices": '["1.5", "-0.1"]',
            "endDate": "2026-05-01T00:00:00Z",
        }
        market = self.fetcher._parse_market(data)
        assert market is not None
        assert market.current_price == 1.0

    def test_parse_invalid_date(self):
        """Invalid date string should result in None resolution_date."""
        data = {
            "id": "123",
            "question": "Test?",
            "outcomePrices": '["0.50", "0.50"]',
            "endDate": "not-a-date",
        }
        market = self.fetcher._parse_market(data)
        assert market is not None
        assert market.resolution_date is None

    def test_parse_malformed_json_prices(self):
        """Malformed outcomePrices JSON should be handled."""
        data = {
            "id": "123",
            "question": "Test?",
            "outcomePrices": "not json at all",
            "bestBid": "0.42",
            "endDate": "2026-05-01T00:00:00Z",
        }
        market = self.fetcher._parse_market(data)
        assert market is not None
        assert market.current_price == pytest.approx(0.42)

    def test_parse_missing_optional_fields(self):
        """Market with minimal fields should still parse."""
        data = {
            "id": "123",
            "question": "Test?",
            "outcomePrices": '["0.60", "0.40"]',
        }
        market = self.fetcher._parse_market(data)
        assert market is not None
        assert market.description == ""
        assert market.volume == 0

    def test_parse_completely_garbage(self):
        """Totally invalid data should return None, not crash."""
        assert self.fetcher._parse_market({}) is None
        assert self.fetcher._parse_market({"random": "stuff"}) is None


class TestKalshiParsing:
    def setup_method(self):
        self.fetcher = KalshiFetcher()

    def test_parse_standard_market(self):
        data = {
            "ticker": "FED-RATE-CUT-MAY",
            "title": "Fed rate cut in May?",
            "subtitle": "Will the Fed cut rates?",
            "yes_ask": 45,  # Cents
            "volume": 1000000,
            "close_time": "2026-05-07T00:00:00Z",
            "category": "economics",
        }
        market = self.fetcher._parse_market(data)

        assert market is not None
        assert market.id == "FED-RATE-CUT-MAY"
        assert market.source == MarketSource.KALSHI
        assert market.title == "Fed rate cut in May?"
        assert market.current_price == pytest.approx(0.45)
        assert market.volume == 1000000
        assert market.url == "https://kalshi.com/markets/FED-RATE-CUT-MAY"

    def test_parse_cents_conversion(self):
        """Prices > 1.0 are in cents and should be divided by 100."""
        data = {
            "ticker": "TEST",
            "title": "Test",
            "yes_ask": 72,  # 72 cents = 0.72
            "close_time": "2026-05-01T00:00:00Z",
        }
        market = self.fetcher._parse_market(data)
        assert market is not None
        assert market.current_price == pytest.approx(0.72)

    def test_parse_decimal_price(self):
        """Prices <= 1.0 are already decimal."""
        data = {
            "ticker": "TEST",
            "title": "Test",
            "yes_ask": 0.55,
            "close_time": "2026-05-01T00:00:00Z",
        }
        market = self.fetcher._parse_market(data)
        assert market is not None
        assert market.current_price == pytest.approx(0.55)

    def test_parse_fallback_price_fields(self):
        """Should try last_price and yes_bid when yes_ask is missing."""
        data = {
            "ticker": "TEST",
            "title": "Test",
            "last_price": 60,
            "close_time": "2026-05-01T00:00:00Z",
        }
        market = self.fetcher._parse_market(data)
        assert market is not None
        assert market.current_price == pytest.approx(0.60)

    def test_parse_no_price_returns_none(self):
        data = {
            "ticker": "TEST",
            "title": "Test",
            "close_time": "2026-05-01T00:00:00Z",
        }
        market = self.fetcher._parse_market(data)
        assert market is None

    def test_parse_expected_expiration_time(self):
        """Should use expected_expiration_time as fallback for close_time."""
        data = {
            "ticker": "TEST",
            "title": "Test",
            "yes_ask": 50,
            "expected_expiration_time": "2026-06-01T00:00:00Z",
        }
        market = self.fetcher._parse_market(data)
        assert market is not None
        assert market.resolution_date is not None
