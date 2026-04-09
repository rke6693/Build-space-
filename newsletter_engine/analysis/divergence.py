"""Divergence analyzer: identifies markets where our assessment differs most from price.

The core thesis: markets where our independent research suggests a significantly
different probability than what the market reflects represent the best opportunities
for newsletter content (and eventually, trading).
"""

import logging
from typing import Optional

from ..models import Market, ResearchResult, DivergenceOpportunity

logger = logging.getLogger(__name__)


class DivergenceAnalyzer:
    """Ranks markets by the gap between assessed probability and market price."""

    def __init__(
        self,
        min_confidence: float = 0.2,
        min_divergence: float = 0.05,
        min_volume: float = 0.0,
    ):
        """
        Args:
            min_confidence: Minimum research confidence to consider.
            min_divergence: Minimum absolute divergence to include.
            min_volume: Minimum market volume to consider.
        """
        self.min_confidence = min_confidence
        self.min_divergence = min_divergence
        self.min_volume = min_volume

    def find_opportunities(
        self,
        markets: list[Market],
        research_results: list[ResearchResult],
        top_n: int = 5,
    ) -> list[DivergenceOpportunity]:
        """Find the top N markets with the largest divergence.

        Args:
            markets: All fetched markets.
            research_results: Research results keyed by market_id.
            top_n: Number of top divergences to return.

        Returns:
            List of DivergenceOpportunity sorted by divergence descending.
        """
        # Build lookup
        research_by_id: dict[str, ResearchResult] = {
            r.market_id: r for r in research_results
        }

        opportunities: list[DivergenceOpportunity] = []

        for market in markets:
            research = research_by_id.get(market.id)
            if research is None:
                continue

            # Filter by confidence
            if research.confidence < self.min_confidence:
                continue

            # Filter by volume
            if market.volume < self.min_volume:
                continue

            # Calculate divergence
            divergence = research.assessed_probability - market.current_price
            abs_divergence = abs(divergence)

            if abs_divergence < self.min_divergence:
                continue

            direction = "underpriced" if divergence > 0 else "overpriced"

            opportunities.append(DivergenceOpportunity(
                market=market,
                research=research,
                divergence=divergence,
                edge_direction=direction,
                edge_magnitude=abs_divergence,
            ))

        # Sort by edge magnitude (largest first), weighted by confidence
        opportunities.sort(
            key=lambda o: o.edge_magnitude * o.research.confidence,
            reverse=True,
        )

        top = opportunities[:top_n]

        if top:
            logger.info(
                f"Top divergence: {top[0].market.title} "
                f"(market={top[0].market.current_price:.1%}, "
                f"ours={top[0].research.assessed_probability:.1%}, "
                f"edge={top[0].edge_magnitude:.1%})"
            )

        return top

    def summarize_opportunities(self, opportunities: list[DivergenceOpportunity]) -> str:
        """Create a text summary of divergence opportunities."""
        if not opportunities:
            return "No significant divergences found today."

        lines = ["# Divergence Summary\n"]
        for i, opp in enumerate(opportunities, 1):
            lines.append(
                f"{i}. **{opp.market.title}**\n"
                f"   - Market: {opp.market.current_price:.1%} | "
                f"Ours: {opp.research.assessed_probability:.1%} | "
                f"Edge: {opp.edge_magnitude:.1%} ({opp.edge_direction})\n"
                f"   - Confidence: {opp.research.confidence:.0%}\n"
                f"   - Source: {opp.market.source.value}\n"
            )
        return "\n".join(lines)
