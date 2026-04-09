"""Accuracy scorer: weekly accuracy reports and calibration analysis.

Implements Brier scoring, calibration buckets, and directional accuracy
to measure how well our predictions perform vs the market.
"""

import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from ..config import Config
from ..models import Prediction, AccuracyReport
from .tracker import PredictionTracker

logger = logging.getLogger(__name__)

# Calibration buckets: (lower_bound, upper_bound, label)
CALIBRATION_BUCKETS = [
    (0.0, 0.1, "0-10%"),
    (0.1, 0.2, "10-20%"),
    (0.2, 0.3, "20-30%"),
    (0.3, 0.4, "30-40%"),
    (0.4, 0.5, "40-50%"),
    (0.5, 0.6, "50-60%"),
    (0.6, 0.7, "60-70%"),
    (0.7, 0.8, "70-80%"),
    (0.8, 0.9, "80-90%"),
    (0.9, 1.0, "90-100%"),
]


class AccuracyScorer:
    """Generates weekly accuracy reports from tracked predictions."""

    def __init__(self, tracker: Optional[PredictionTracker] = None):
        self.tracker = tracker or PredictionTracker()

    def generate_weekly_report(self, week_ending: Optional[str] = None) -> AccuracyReport:
        """Generate an accuracy report for the past week.

        Args:
            week_ending: YYYY-MM-DD of the report end date. Defaults to today.

        Returns:
            AccuracyReport with scoring and calibration data.
        """
        if week_ending is None:
            week_ending = datetime.utcnow().strftime("%Y-%m-%d")

        end_date = datetime.strptime(week_ending, "%Y-%m-%d")
        start_date = end_date - timedelta(days=7)

        all_preds = self.tracker.get_all_predictions()
        resolved = [p for p in all_preds if p.resolved]

        # Predictions that were resolved this week
        week_resolved = []
        for p in resolved:
            if p.resolution_date:
                try:
                    res_date = datetime.fromisoformat(p.resolution_date.replace("Z", "+00:00")).replace(tzinfo=None)
                    if start_date <= res_date <= end_date:
                        week_resolved.append(p)
                except ValueError:
                    pass

        # If no weekly filter, use all resolved
        if not week_resolved:
            week_resolved = resolved

        report = AccuracyReport(
            week_ending=week_ending,
            total_predictions=len(all_preds),
            resolved_predictions=len(week_resolved),
        )

        if not week_resolved:
            return report

        # Brier scores
        our_briers = [p.our_brier_score for p in week_resolved if p.our_brier_score is not None]
        market_briers = [p.market_brier_score for p in week_resolved if p.market_brier_score is not None]

        if our_briers:
            report.our_avg_brier = sum(our_briers) / len(our_briers)
        if market_briers:
            report.market_avg_brier = sum(market_briers) / len(market_briers)

        # Directional accuracy (did our edge call go the right way?)
        correct = 0
        total = 0
        for p in week_resolved:
            if p.resolution_outcome is not None:
                total += 1
                outcome = p.resolution_outcome
                # If we said underpriced (should be higher) and it resolved YES, correct
                # If we said overpriced (should be lower) and it resolved NO, correct
                if p.edge_direction == "underpriced" and outcome == 1.0:
                    correct += 1
                elif p.edge_direction == "overpriced" and outcome == 0.0:
                    correct += 1

        report.edge_calls_total = total
        report.edge_calls_correct = correct
        report.edge_accuracy_pct = (correct / total * 100) if total > 0 else None

        # Calibration
        report.our_calibration = self._compute_calibration(week_resolved)

        return report

    def _compute_calibration(self, predictions: list[Prediction]) -> dict[str, dict]:
        """Compute calibration buckets.

        For each probability range, what was the actual resolution rate?
        Good calibration means 70% predictions resolve YES ~70% of the time.
        """
        buckets: dict[str, dict] = {}

        for lower, upper, label in CALIBRATION_BUCKETS:
            bucket_preds = [
                p for p in predictions
                if p.our_assessed_probability >= lower
                and p.our_assessed_probability < upper
                and p.resolution_outcome is not None
            ]

            if not bucket_preds:
                continue

            avg_predicted = sum(p.our_assessed_probability for p in bucket_preds) / len(bucket_preds)
            avg_actual = sum(p.resolution_outcome for p in bucket_preds) / len(bucket_preds)

            buckets[label] = {
                "count": len(bucket_preds),
                "avg_predicted": round(avg_predicted, 3),
                "avg_actual": round(avg_actual, 3),
                "calibration_error": round(abs(avg_predicted - avg_actual), 3),
            }

        return buckets

    def save_report(self, report: AccuracyReport):
        """Save a weekly accuracy report to disk."""
        Config.ensure_dirs()
        filepath = Config.ACCURACY_DIR / f"accuracy_{report.week_ending}.json"
        filepath.write_text(json.dumps(report.model_dump(), indent=2, default=str))
        logger.info(f"Saved accuracy report to {filepath}")

    def render_accuracy_markdown(self, report: AccuracyReport) -> str:
        """Render an accuracy report as markdown for standalone publication."""
        lines = [
            f"# Weekly Accuracy Report",
            f"## Week Ending {report.week_ending}\n",
            f"**Total predictions tracked:** {report.total_predictions}",
            f"**Resolved this period:** {report.resolved_predictions}\n",
        ]

        if report.our_avg_brier is not None:
            lines.append(f"### Brier Scores (lower = better)\n")
            lines.append(f"| Scorer | Brier Score |")
            lines.append(f"|--------|:-----------:|")
            lines.append(f"| Our Assessment | {report.our_avg_brier:.4f} |")
            if report.market_avg_brier is not None:
                lines.append(f"| Market Price | {report.market_avg_brier:.4f} |")
                diff = report.market_avg_brier - report.our_avg_brier
                lines.append(f"\n*Our edge vs market: {diff:+.4f} (positive = we're better)*\n")

        if report.edge_accuracy_pct is not None:
            lines.append(f"### Directional Accuracy\n")
            lines.append(
                f"When we said a market was overpriced or underpriced, we were right "
                f"**{report.edge_accuracy_pct:.1f}%** of the time "
                f"({report.edge_calls_correct}/{report.edge_calls_total}).\n"
            )

        if report.our_calibration:
            lines.append(f"### Calibration\n")
            lines.append(f"| Predicted Range | Count | Avg Predicted | Avg Actual | Error |")
            lines.append(f"|:----------------|:-----:|:-------------:|:----------:|:-----:|")
            for label, data in report.our_calibration.items():
                lines.append(
                    f"| {label} | {data['count']} | {data['avg_predicted']:.1%} | "
                    f"{data['avg_actual']:.1%} | {data['calibration_error']:.1%} |"
                )

        return "\n".join(lines)
