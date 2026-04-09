"""Main pipeline: orchestrates the full newsletter generation flow.

This is the core orchestrator that ties together:
1. Market fetching (Polymarket + Kalshi)
2. Research (web search + LLM analysis)
3. Divergence analysis
4. Newsletter generation
5. Prediction tracking
6. Accuracy scoring
"""

import logging
from datetime import datetime, timezone
from pathlib import Path

from .config import Config
from .fetchers import MarketAggregator
from .research import ResearchEngine
from .analysis import DivergenceAnalyzer
from .generator import NewsletterWriter
from .tracker import PredictionTracker, AccuracyScorer
from .tracker.resolver import ResolutionChecker

logger = logging.getLogger(__name__)


class NewsletterPipeline:
    """Full pipeline from market fetch to published newsletter."""

    def __init__(self):
        Config.ensure_dirs()
        self.aggregator = MarketAggregator()
        self.researcher = ResearchEngine()
        self.analyzer = DivergenceAnalyzer(
            min_confidence=0.15,
            min_divergence=0.03,
        )
        self.writer = NewsletterWriter()
        self.tracker = PredictionTracker()
        self.accuracy = AccuracyScorer(self.tracker)
        self.resolver = ResolutionChecker(self.tracker)

    def run(self, date: str = None) -> Path:
        """Execute the full pipeline for a given date.

        Args:
            date: YYYY-MM-DD override. Defaults to today.

        Returns:
            Path to the generated newsletter file.
        """
        if date is None:
            date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        logger.info(f"=== Newsletter Pipeline: {date} ===")

        # Step 0: Check resolutions for any prior predictions
        logger.info("Step 0: Checking prior prediction resolutions...")
        resolution_stats = self._check_resolutions()
        logger.info(f"Resolutions: {resolution_stats}")

        # Step 1: Fetch markets
        logger.info("Step 1: Fetching active markets...")
        markets = self.aggregator.fetch_all(
            resolution_window_days=Config.RESOLUTION_WINDOW_DAYS,
        )
        logger.info(f"Fetched {len(markets)} markets")

        if not markets:
            logger.warning("No markets found. Generating empty newsletter.")
            return self._save_empty_newsletter(date)

        # Step 2: Research top markets (by volume, capped for API budget)
        # Research top 30 by volume, then pick top 5 by divergence
        research_pool = markets[:30]
        logger.info(f"Step 2: Researching top {len(research_pool)} markets...")
        research_results = self.researcher.research_markets(research_pool)
        logger.info(f"Completed research on {len(research_results)} markets")

        # Step 3: Find divergences
        logger.info("Step 3: Analyzing divergences...")
        opportunities = self.analyzer.find_opportunities(
            markets=research_pool,
            research_results=research_results,
            top_n=Config.TOP_DIVERGENCE_COUNT,
        )
        logger.info(f"Found {len(opportunities)} divergence opportunities")

        if not opportunities:
            logger.warning("No significant divergences found.")
            return self._save_empty_newsletter(date)

        # Step 4: Generate briefings
        logger.info("Step 4: Generating briefings...")
        briefings = self.writer.generate_briefings(opportunities)
        logger.info(f"Generated {len(briefings)} briefings")

        # Step 5: Log predictions
        logger.info("Step 5: Logging predictions...")
        predictions = self.tracker.log_predictions(date, opportunities)
        logger.info(f"Logged {len(predictions)} predictions")

        # Step 6: Generate accuracy report (if we have history)
        accuracy_report = None
        stats = self.tracker.get_stats()
        if stats.get("resolved", 0) > 0:
            logger.info("Step 6: Generating accuracy report...")
            accuracy_report = self.accuracy.generate_weekly_report(date)
            self.accuracy.save_report(accuracy_report)

        # Step 7: Render and save newsletter
        logger.info("Step 7: Rendering newsletter...")
        newsletter_md = self.writer.render_newsletter(
            date=date,
            briefings=briefings,
            accuracy=accuracy_report,
        )

        output_path = Config.NEWSLETTER_DIR / f"{date}.md"
        output_path.write_text(newsletter_md)
        logger.info(f"Newsletter saved to {output_path}")

        # Print summary
        self._print_summary(date, opportunities, stats)

        return output_path

    def _check_resolutions(self) -> dict:
        """Check for resolved markets."""
        try:
            return self.resolver.check_and_resolve_all()
        except Exception as e:
            logger.error(f"Resolution check failed: {e}")
            return {"checked": 0, "resolved": 0, "error": str(e)}

    def _save_empty_newsletter(self, date: str) -> Path:
        """Save a minimal newsletter when no opportunities are found."""
        dt = datetime.strptime(date, "%Y-%m-%d")
        content = f"""\
---
title: "Market Edge Daily"
date: {date}
markets_analyzed: 0
---

# Market Edge Daily
## {dt.strftime('%A, %B %d, %Y')}

No significant divergences found today. All active markets resolving within \
{Config.RESOLUTION_WINDOW_DAYS} days are trading close to our independently \
assessed probabilities.

This is actually a good signal — it means the market is doing its job efficiently \
on the questions we analyzed.

We'll be back tomorrow with fresh analysis.

---

*Generated by Market Edge Daily Engine v1.0*
"""
        output_path = Config.NEWSLETTER_DIR / f"{date}.md"
        output_path.write_text(content)
        return output_path

    def _print_summary(self, date: str, opportunities, stats: dict):
        """Print a summary to the console."""
        print(f"\n{'='*60}")
        print(f"  Market Edge Daily — {date}")
        print(f"{'='*60}")
        print(f"  Markets featured: {len(opportunities)}")
        for i, opp in enumerate(opportunities, 1):
            arrow = "↑" if opp.edge_direction == "underpriced" else "↓"
            print(
                f"  {i}. {opp.market.title[:50]}"
                f"\n     Market: {opp.market.current_price:.1%} | "
                f"Ours: {opp.research.assessed_probability:.1%} | "
                f"{arrow} {opp.edge_magnitude:.1%}"
            )
        print(f"\n  Total predictions tracked: {stats.get('total_predictions', 0)}")
        print(f"  Resolved: {stats.get('resolved', 0)}")
        print(f"{'='*60}\n")

    def close(self):
        self.aggregator.close()
        self.researcher.close()
        self.writer.close()
        self.resolver.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
