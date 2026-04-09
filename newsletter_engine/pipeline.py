"""Main pipeline: orchestrates the full newsletter generation flow.

This is the core orchestrator that ties together:
1. Market fetching (Polymarket + Kalshi)
2. Research (web search + LLM analysis)
3. Divergence analysis
4. Newsletter generation
5. Prediction tracking (SQLite)
6. Accuracy scoring
7. Email delivery (Buttondown / Resend)
8. Alerting (Slack / Discord webhooks)
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from .config import Config
from .fetchers import MarketAggregator
from .research import ResearchEngine
from .analysis import DivergenceAnalyzer
from .generator import NewsletterWriter
from .tracker.database import PredictionDB
from .tracker.accuracy import AccuracyScorer
from .tracker.resolver import ResolutionChecker
from .delivery import DeliverySender
from .alerting import AlertManager
from .utils import validate_date

logger = logging.getLogger(__name__)


@dataclass
class PipelineStatus:
    """Tracks the outcome of each pipeline step for observability."""
    date: str = ""
    dry_run: bool = False
    markets_fetched: int = 0
    markets_researched: int = 0
    research_skipped: int = 0
    divergences_found: int = 0
    briefings_generated: int = 0
    predictions_logged: int = 0
    predictions_deduplicated: int = 0
    resolutions_checked: int = 0
    resolutions_found: int = 0
    delivery_results: dict = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def has_errors(self) -> bool:
        return len(self.errors) > 0

    def summary(self) -> str:
        prefix = "[DRY RUN] " if self.dry_run else ""
        lines = [
            f"{prefix}Pipeline run: {self.date}",
            f"  Markets: {self.markets_fetched} fetched, {self.markets_researched} researched "
            f"({self.research_skipped} skipped)",
            f"  Divergences: {self.divergences_found}",
            f"  Briefings: {self.briefings_generated}",
        ]
        if not self.dry_run:
            lines.append(
                f"  Predictions: {self.predictions_logged} logged "
                f"({self.predictions_deduplicated} deduped)"
            )
            lines.append(
                f"  Resolutions: {self.resolutions_found}/{self.resolutions_checked} resolved"
            )
            if self.delivery_results:
                for backend, result in self.delivery_results.items():
                    lines.append(f"  Delivery [{backend}]: {result.get('status', 'unknown')}")
        if self.errors:
            lines.append(f"  ERRORS ({len(self.errors)}):")
            for e in self.errors:
                lines.append(f"    - {e}")
        if self.warnings:
            lines.append(f"  Warnings ({len(self.warnings)}):")
            for w in self.warnings:
                lines.append(f"    - {w}")
        return "\n".join(lines)


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
        self.db = PredictionDB()
        self.accuracy = AccuracyScorer(db=self.db)
        self.resolver = ResolutionChecker(db=self.db)
        self.delivery = DeliverySender()
        self.alerts = AlertManager()

    def run(self, date: str = None, dry_run: bool = False) -> Path:
        """Execute the full pipeline for a given date.

        Args:
            date: YYYY-MM-DD override. Defaults to today.
            dry_run: If True, run full pipeline but don't save predictions
                     or send delivery. For testing without side effects.

        Returns:
            Path to the generated newsletter file.

        Raises:
            ValueError: If date is invalid.
        """
        if date is None:
            date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        else:
            date = validate_date(date)

        status = PipelineStatus(date=date, dry_run=dry_run)

        if dry_run:
            logger.info(f"=== Newsletter Pipeline [DRY RUN]: {date} ===")
        else:
            logger.info(f"=== Newsletter Pipeline: {date} ===")

        # Step 0: Check resolutions (skip in dry run)
        if not dry_run:
            logger.info("Step 0: Checking prior prediction resolutions...")
            resolution_stats = self._check_resolutions()
            status.resolutions_checked = resolution_stats.get("checked", 0)
            status.resolutions_found = resolution_stats.get("resolved", 0)
            logger.info(f"Resolutions: {resolution_stats}")

            if status.resolutions_found > 0:
                self.alerts.alert_resolutions(
                    status.resolutions_found, status.resolutions_checked
                )

        # Step 1: Fetch markets
        logger.info("Step 1: Fetching active markets...")
        markets = self.aggregator.fetch_all(
            resolution_window_days=Config.RESOLUTION_WINDOW_DAYS,
        )
        status.markets_fetched = len(markets)
        logger.info(f"Fetched {len(markets)} markets")

        if not markets:
            status.warnings.append("No markets found from any source")
            logger.warning("No markets found. Generating empty newsletter.")
            self._log_status(status)
            return self._save_empty_newsletter(date)

        # Step 2: Research top markets
        research_pool = markets[:30]
        logger.info(f"Step 2: Researching top {len(research_pool)} markets...")
        research_results = self.researcher.research_markets(research_pool)
        status.markets_researched = len(research_results)
        status.research_skipped = len(research_pool) - len(research_results)
        logger.info(f"Completed research on {len(research_results)} markets")

        if status.research_skipped > len(research_pool) * 0.5:
            msg = (
                f"High research failure rate: {status.research_skipped}/{len(research_pool)} "
                f"markets skipped. Check API keys and quotas."
            )
            status.errors.append(msg)
            logger.error(msg)
            self.alerts.alert_high_failure_rate(
                status.research_skipped, len(research_pool)
            )

        # Step 3: Find divergences
        logger.info("Step 3: Analyzing divergences...")
        opportunities = self.analyzer.find_opportunities(
            markets=research_pool,
            research_results=research_results,
            top_n=Config.TOP_DIVERGENCE_COUNT,
        )
        status.divergences_found = len(opportunities)
        logger.info(f"Found {len(opportunities)} divergence opportunities")

        if not opportunities:
            status.warnings.append("No significant divergences found")
            logger.warning("No significant divergences found.")
            self._log_status(status)
            return self._save_empty_newsletter(date)

        # Step 4: Generate briefings
        logger.info("Step 4: Generating briefings...")
        briefings = self.writer.generate_briefings(opportunities)
        status.briefings_generated = len(briefings)
        logger.info(f"Generated {len(briefings)} briefings")

        # Step 5: Log predictions (skip in dry run)
        if not dry_run:
            logger.info("Step 5: Logging predictions...")
            new_predictions = self.db.log_predictions(date, opportunities)
            status.predictions_logged = len(new_predictions)
            status.predictions_deduplicated = len(opportunities) - len(new_predictions)
        else:
            logger.info("Step 5: [DRY RUN] Skipping prediction logging")

        # Step 6: Accuracy report
        accuracy_report = None
        if not dry_run:
            stats = self.db.get_stats()
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

        # Step 8: Deliver (skip in dry run)
        if not dry_run:
            logger.info("Step 8: Delivering newsletter...")
            try:
                status.delivery_results = self.delivery.send(date, output_path)
            except Exception as e:
                msg = f"Delivery failed: {e}"
                status.errors.append(msg)
                logger.error(msg)
        else:
            logger.info("Step 8: [DRY RUN] Skipping delivery")

        # Summary and alerts
        self._log_status(status)
        self._print_summary(date, opportunities, status)

        if not dry_run:
            if status.has_errors:
                self.alerts.alert_pipeline_error(date, status.errors)
            else:
                self.alerts.alert_pipeline_success(
                    date, len(opportunities), status.predictions_logged
                )

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

    def _log_status(self, status: PipelineStatus):
        summary = status.summary()
        if status.has_errors:
            logger.error(f"Pipeline completed with errors:\n{summary}")
        else:
            logger.info(f"Pipeline completed:\n{summary}")

    def _print_summary(self, date: str, opportunities, status: PipelineStatus):
        prefix = "[DRY RUN] " if status.dry_run else ""
        print(f"\n{'='*60}")
        print(f"  {prefix}Market Edge Daily — {date}")
        print(f"{'='*60}")

        if status.has_errors:
            print(f"  !! {len(status.errors)} ERROR(S) — check logs")
        if status.warnings:
            print(f"  {len(status.warnings)} warning(s)")

        print(f"  Markets featured: {len(opportunities)}")
        for i, opp in enumerate(opportunities, 1):
            arrow = "↑" if opp.edge_direction == "underpriced" else "↓"
            print(
                f"  {i}. {opp.market.title[:50]}"
                f"\n     Market: {opp.market.current_price:.1%} | "
                f"Ours: {opp.research.assessed_probability:.1%} | "
                f"{arrow} {opp.edge_magnitude:.1%}"
            )

        if not status.dry_run:
            stats = self.db.get_stats()
            print(f"\n  Total predictions tracked: {stats.get('total_predictions', 0)}")
            print(f"  Resolved: {stats.get('resolved', 0)}")
            if status.predictions_deduplicated > 0:
                print(f"  Deduplicated (re-run): {status.predictions_deduplicated}")
            for backend, result in status.delivery_results.items():
                print(f"  Delivery [{backend}]: {result.get('status', 'N/A')}")
        else:
            print(f"\n  [DRY RUN] No predictions logged, no delivery sent")

        print(f"{'='*60}\n")

    def close(self):
        self.aggregator.close()
        self.researcher.close()
        self.writer.close()
        self.resolver.close()
        self.delivery.close()
        self.alerts.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
