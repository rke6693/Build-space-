"""
Tests for the odds normalizer and event matcher.
"""

import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock

from api.models import MarketResponse, MarketStatus, Platform
from api.services.normalizer import EventMatcher, OddsNormalizer


class TestEventMatcher:
    """Test the multi-signal event matching engine."""

    def test_exact_match_after_normalization(self):
        score = EventMatcher.compute_similarity(
            "Will the US Presidential Election 2028 go to Republicans?",
            "us presidential election 2028 go to republicans",
        )
        assert score >= 0.95

    def test_high_similarity_different_phrasing(self):
        score = EventMatcher.compute_similarity(
            "US Presidential Election 2028 — Republican Nominee",
            "Republican Presidential Nominee 2028",
        )
        assert score >= 0.55, f"Expected >= 0.55, got {score}"

    def test_low_similarity_different_events(self):
        score = EventMatcher.compute_similarity(
            "US Presidential Election 2028 — Republican Nominee",
            "Champions League Final Winner 2026",
        )
        assert score < 0.3, f"Expected < 0.3, got {score}"

    def test_entity_extraction_years(self):
        entities = EventMatcher.extract_entities("Bitcoin above $200K by December 2026")
        assert "2026" in entities["date"]

    def test_entity_extraction_amounts(self):
        entities = EventMatcher.extract_entities("GDP growth above 3% in Q2 2026")
        assert "3%" in entities["number"]

    def test_normalize_title_strips_prefixes(self):
        assert "bitcoin" in EventMatcher.normalize_title("Will Bitcoin reach $100K?")
        assert "republican" in EventMatcher.normalize_title("Who will win the Republican primary?")

    def test_tokenize_removes_stop_words(self):
        tokens = EventMatcher.tokenize("Will the Bitcoin price be above 200K by end of 2026?")
        assert "the" not in tokens
        assert "will" not in tokens
        assert "bitcoin" in tokens

    def test_find_matches_respects_category(
        self, sample_market, sample_market_kalshi
    ):
        # Same category — should match
        matches = EventMatcher.find_matches(
            sample_market,
            [sample_market_kalshi],
            threshold=0.3,
        )
        assert len(matches) >= 1

    def test_find_matches_filters_same_platform(self, sample_market):
        # Same platform — should not match
        other = sample_market.model_copy()
        other.id = "poly-other"
        matches = EventMatcher.find_matches(sample_market, [other])
        assert len(matches) == 0

    def test_cross_platform_matching_realistic(self):
        """Test matching across realistic platform title variations."""
        poly = MarketResponse(
            id="poly-1",
            platform=Platform.POLYMARKET,
            platform_market_id="1",
            title="Fed rate cut before July 2026",
            category="economics",
            yes_price=0.67,
        )
        kalshi = MarketResponse(
            id="kalshi-1",
            platform=Platform.KALSHI,
            platform_market_id="1",
            title="Will the Federal Reserve cut rates before July 2026?",
            category="economics",
            yes_price=0.65,
        )
        matches = EventMatcher.find_matches(poly, [kalshi], threshold=0.4)
        assert len(matches) >= 1, "Should match Fed rate cut across platforms"

    def test_tfidf_similarity_weighted(self):
        """Distinctive terms should contribute more than common ones."""
        tokens_a = EventMatcher.tokenize("Bitcoin price above 200K December 2026")
        tokens_b = EventMatcher.tokenize("Ethereum price above 10K December 2026")
        score = EventMatcher.compute_tfidf_similarity(tokens_a, tokens_b)
        # Should be moderate — shared structure but different key entity
        assert 0.3 < score < 0.9


class TestOddsNormalizer:
    """Test the odds normalization pipeline."""

    @pytest.mark.asyncio
    async def test_normalize_event_basic(
        self, sample_market, sample_market_kalshi, sample_market_pinnacle
    ):
        normalizer = OddsNormalizer({})
        result = await normalizer.normalize_event({
            Platform.POLYMARKET: sample_market,
            Platform.KALSHI: sample_market_kalshi,
            Platform.PINNACLE: sample_market_pinnacle,
        })
        assert result.event_title == sample_market.title
        assert len(result.platforms) == 3
        assert 0 < result.consensus_probability < 1
        assert result.max_spread > 0

    @pytest.mark.asyncio
    async def test_consensus_uses_volume_weighting(
        self, sample_market, sample_market_kalshi
    ):
        """Higher volume platform should contribute more to consensus."""
        normalizer = OddsNormalizer({})
        result = await normalizer.normalize_event({
            Platform.POLYMARKET: sample_market,       # vol: 18.4M, price: 0.42
            Platform.KALSHI: sample_market_kalshi,     # vol: 12.8M, price: 0.44
        })
        # Consensus should be closer to Polymarket (higher volume)
        assert result.consensus_probability < 0.44
        assert result.consensus_probability > 0.40

    @pytest.mark.asyncio
    async def test_arbitrage_detection(self):
        """Detect arbitrage when prices diverge enough."""
        cheap = MarketResponse(
            id="a", platform=Platform.POLYMARKET, platform_market_id="a",
            title="Test", yes_price=0.40, no_price=0.60, volume_24h=1000000,
        )
        expensive = MarketResponse(
            id="b", platform=Platform.KALSHI, platform_market_id="b",
            title="Test", yes_price=0.50, no_price=0.50, volume_24h=1000000,
        )
        normalizer = OddsNormalizer({})
        result = await normalizer.normalize_event({
            Platform.POLYMARKET: cheap,
            Platform.KALSHI: expensive,
        })
        assert result.max_spread >= 100  # 10 cents = 1000 bps

    @pytest.mark.asyncio
    async def test_normalize_single_platform(self, sample_market):
        """Single platform should work without errors."""
        normalizer = OddsNormalizer({})
        result = await normalizer.normalize_event({
            Platform.POLYMARKET: sample_market,
        })
        assert result.consensus_probability == pytest.approx(0.42, abs=0.01)
        assert result.max_spread == 0  # No cross-platform spread with one platform
