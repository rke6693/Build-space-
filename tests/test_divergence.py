"""Tests for divergence analysis logic."""

from datetime import datetime, timezone

import pytest

from newsletter_engine.analysis.divergence import DivergenceAnalyzer
from newsletter_engine.models import (
    Market, MarketSource, ResearchResult, DivergenceOpportunity,
)


def make_market(market_id, price, volume=100000):
    return Market(
        id=market_id,
        source=MarketSource.POLYMARKET,
        title=f"Market {market_id}",
        current_price=price,
        volume=volume,
        resolution_date=datetime(2026, 4, 20, tzinfo=timezone.utc),
    )


def make_research(market_id, prob, confidence=0.7):
    return ResearchResult(
        market_id=market_id,
        assessed_probability=prob,
        confidence=confidence,
    )


class TestDivergenceAnalyzer:
    def test_basic_divergence_ranking(self):
        """Markets should be ranked by divergence magnitude * confidence."""
        analyzer = DivergenceAnalyzer(min_confidence=0.0, min_divergence=0.0)

        markets = [
            make_market("m1", 0.50),  # divergence: |0.70 - 0.50| = 0.20
            make_market("m2", 0.50),  # divergence: |0.90 - 0.50| = 0.40
            make_market("m3", 0.50),  # divergence: |0.55 - 0.50| = 0.05
        ]
        research = [
            make_research("m1", 0.70, confidence=0.7),  # score: 0.20 * 0.7 = 0.14
            make_research("m2", 0.90, confidence=0.7),  # score: 0.40 * 0.7 = 0.28
            make_research("m3", 0.55, confidence=0.7),  # score: 0.05 * 0.7 = 0.035
        ]

        opps = analyzer.find_opportunities(markets, research, top_n=3)
        assert len(opps) == 3
        assert opps[0].market.id == "m2"  # Largest divergence
        assert opps[1].market.id == "m1"
        assert opps[2].market.id == "m3"

    def test_confidence_weighting(self):
        """Higher confidence should boost ranking even with smaller divergence."""
        analyzer = DivergenceAnalyzer(min_confidence=0.0, min_divergence=0.0)

        markets = [
            make_market("m1", 0.50),  # div: 0.20
            make_market("m2", 0.50),  # div: 0.15
        ]
        research = [
            make_research("m1", 0.70, confidence=0.3),  # score: 0.20 * 0.3 = 0.06
            make_research("m2", 0.65, confidence=0.9),  # score: 0.15 * 0.9 = 0.135
        ]

        opps = analyzer.find_opportunities(markets, research, top_n=2)
        assert opps[0].market.id == "m2"  # Higher confidence wins

    def test_min_confidence_filter(self):
        """Markets below minimum confidence should be excluded."""
        analyzer = DivergenceAnalyzer(min_confidence=0.5, min_divergence=0.0)

        markets = [make_market("m1", 0.50)]
        research = [make_research("m1", 0.80, confidence=0.3)]

        opps = analyzer.find_opportunities(markets, research, top_n=5)
        assert len(opps) == 0

    def test_min_divergence_filter(self):
        """Markets below minimum divergence should be excluded."""
        analyzer = DivergenceAnalyzer(min_confidence=0.0, min_divergence=0.10)

        markets = [make_market("m1", 0.50)]
        research = [make_research("m1", 0.55)]  # divergence = 0.05

        opps = analyzer.find_opportunities(markets, research, top_n=5)
        assert len(opps) == 0

    def test_edge_direction(self):
        """Underpriced vs overpriced should be set correctly."""
        analyzer = DivergenceAnalyzer(min_confidence=0.0, min_divergence=0.0)

        markets = [
            make_market("m1", 0.30),
            make_market("m2", 0.70),
        ]
        research = [
            make_research("m1", 0.60),  # Our price > market = underpriced
            make_research("m2", 0.40),  # Our price < market = overpriced
        ]

        opps = analyzer.find_opportunities(markets, research, top_n=2)
        by_id = {o.market.id: o for o in opps}
        assert by_id["m1"].edge_direction == "underpriced"
        assert by_id["m2"].edge_direction == "overpriced"

    def test_top_n_limit(self):
        """Should return at most top_n results."""
        analyzer = DivergenceAnalyzer(min_confidence=0.0, min_divergence=0.0)

        markets = [make_market(f"m{i}", 0.50) for i in range(10)]
        research = [make_research(f"m{i}", 0.50 + 0.05 * i) for i in range(10)]

        opps = analyzer.find_opportunities(markets, research, top_n=3)
        assert len(opps) == 3

    def test_missing_research(self):
        """Markets without matching research should be skipped."""
        analyzer = DivergenceAnalyzer(min_confidence=0.0, min_divergence=0.0)

        markets = [make_market("m1", 0.50), make_market("m2", 0.50)]
        research = [make_research("m1", 0.70)]  # No research for m2

        opps = analyzer.find_opportunities(markets, research, top_n=5)
        assert len(opps) == 1
        assert opps[0].market.id == "m1"

    def test_empty_inputs(self):
        analyzer = DivergenceAnalyzer()
        assert analyzer.find_opportunities([], [], top_n=5) == []

    def test_min_volume_filter(self):
        """Markets below minimum volume should be excluded."""
        analyzer = DivergenceAnalyzer(
            min_confidence=0.0, min_divergence=0.0, min_volume=50000
        )

        markets = [
            make_market("m1", 0.50, volume=100000),
            make_market("m2", 0.50, volume=10000),  # Below threshold
        ]
        research = [
            make_research("m1", 0.70),
            make_research("m2", 0.80),
        ]

        opps = analyzer.find_opportunities(markets, research, top_n=5)
        assert len(opps) == 1
        assert opps[0].market.id == "m1"
