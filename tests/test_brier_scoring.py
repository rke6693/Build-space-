"""Tests for Brier scoring and accuracy calculations.

The Brier score is the mean squared error between predicted probabilities
and actual outcomes: (predicted - actual)^2. Lower is better. 0 = perfect.
"""

import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import pytest

from newsletter_engine.tracker.tracker import PredictionTracker
from newsletter_engine.tracker.accuracy import AccuracyScorer
from newsletter_engine.models import (
    Market, MarketSource, ResearchResult, DivergenceOpportunity, Prediction,
)


@pytest.fixture
def tmp_db(tmp_path):
    return tmp_path / "test_predictions.json"


def make_opp(market_id, market_price, our_prob, direction, resolution_date=None):
    """Helper to create a DivergenceOpportunity."""
    market = Market(
        id=market_id,
        source=MarketSource.POLYMARKET,
        title=f"Market {market_id}",
        current_price=market_price,
        resolution_date=resolution_date or datetime(2026, 4, 20, tzinfo=timezone.utc),
    )
    research = ResearchResult(
        market_id=market_id,
        assessed_probability=our_prob,
        confidence=0.7,
    )
    return DivergenceOpportunity(
        market=market,
        research=research,
        divergence=our_prob - market_price,
        edge_direction=direction,
        edge_magnitude=abs(our_prob - market_price),
    )


class TestBrierScoreCalculation:
    def test_perfect_prediction_yes(self, tmp_db):
        """Predicting 1.0 for an event that happens = Brier score 0."""
        tracker = PredictionTracker(db_path=tmp_db)
        opp = make_opp("m1", market_price=0.5, our_prob=1.0, direction="underpriced")
        preds = tracker.log_predictions("2026-04-09", [opp])
        tracker.resolve_prediction(preds[0].id, 1.0)

        resolved = tracker.get_all_predictions()[0]
        assert resolved.our_brier_score == pytest.approx(0.0)

    def test_perfect_prediction_no(self, tmp_db):
        """Predicting 0.0 for an event that doesn't happen = Brier score 0."""
        tracker = PredictionTracker(db_path=tmp_db)
        opp = make_opp("m1", market_price=0.5, our_prob=0.01, direction="overpriced")
        preds = tracker.log_predictions("2026-04-09", [opp])
        tracker.resolve_prediction(preds[0].id, 0.0)

        resolved = tracker.get_all_predictions()[0]
        assert resolved.our_brier_score == pytest.approx(0.0001)  # (0.01 - 0)^2

    def test_worst_prediction(self, tmp_db):
        """Predicting 0.99 for something that doesn't happen = Brier score ~1."""
        tracker = PredictionTracker(db_path=tmp_db)
        opp = make_opp("m1", market_price=0.5, our_prob=0.99, direction="underpriced")
        preds = tracker.log_predictions("2026-04-09", [opp])
        tracker.resolve_prediction(preds[0].id, 0.0)

        resolved = tracker.get_all_predictions()[0]
        assert resolved.our_brier_score == pytest.approx(0.9801)  # (0.99 - 0)^2

    def test_brier_formula(self, tmp_db):
        """Verify the Brier score formula: (predicted - outcome)^2."""
        tracker = PredictionTracker(db_path=tmp_db)
        opp = make_opp("m1", market_price=0.30, our_prob=0.70, direction="underpriced")
        preds = tracker.log_predictions("2026-04-09", [opp])
        tracker.resolve_prediction(preds[0].id, 1.0)

        resolved = tracker.get_all_predictions()[0]
        # Our Brier: (0.70 - 1.0)^2 = 0.09
        assert resolved.our_brier_score == pytest.approx(0.09)
        # Market Brier: (0.30 - 1.0)^2 = 0.49
        assert resolved.market_brier_score == pytest.approx(0.49)

    def test_we_beat_market(self, tmp_db):
        """When our probability is closer to truth, our Brier is lower."""
        tracker = PredictionTracker(db_path=tmp_db)
        # Market says 30%, we say 70%, actual = YES
        opp = make_opp("m1", market_price=0.30, our_prob=0.70, direction="underpriced")
        preds = tracker.log_predictions("2026-04-09", [opp])
        tracker.resolve_prediction(preds[0].id, 1.0)

        stats = tracker.get_stats()
        assert stats["our_avg_brier"] < stats["market_avg_brier"]

    def test_market_beats_us(self, tmp_db):
        """When market is closer to truth, their Brier is lower."""
        tracker = PredictionTracker(db_path=tmp_db)
        # Market says 70%, we say 30%, actual = YES — market was right
        opp = make_opp("m1", market_price=0.70, our_prob=0.30, direction="overpriced")
        preds = tracker.log_predictions("2026-04-09", [opp])
        tracker.resolve_prediction(preds[0].id, 1.0)

        stats = tracker.get_stats()
        assert stats["our_avg_brier"] > stats["market_avg_brier"]


class TestAccuracyScorer:
    def test_directional_accuracy_underpriced_yes(self, tmp_db):
        """Saying 'underpriced' when outcome is YES = correct."""
        tracker = PredictionTracker(db_path=tmp_db)
        opp = make_opp("m1", market_price=0.30, our_prob=0.60, direction="underpriced")
        preds = tracker.log_predictions("2026-04-09", [opp])
        tracker.resolve_prediction(preds[0].id, 1.0)

        scorer = AccuracyScorer(tracker)
        report = scorer.generate_weekly_report("2026-04-09")
        assert report.edge_calls_correct == 1
        assert report.edge_calls_total == 1
        assert report.edge_accuracy_pct == pytest.approx(100.0)

    def test_directional_accuracy_overpriced_no(self, tmp_db):
        """Saying 'overpriced' when outcome is NO = correct."""
        tracker = PredictionTracker(db_path=tmp_db)
        opp = make_opp("m1", market_price=0.70, our_prob=0.40, direction="overpriced")
        preds = tracker.log_predictions("2026-04-09", [opp])
        tracker.resolve_prediction(preds[0].id, 0.0)

        scorer = AccuracyScorer(tracker)
        report = scorer.generate_weekly_report("2026-04-09")
        assert report.edge_calls_correct == 1

    def test_directional_accuracy_wrong(self, tmp_db):
        """Saying 'underpriced' when outcome is NO = wrong."""
        tracker = PredictionTracker(db_path=tmp_db)
        opp = make_opp("m1", market_price=0.30, our_prob=0.60, direction="underpriced")
        preds = tracker.log_predictions("2026-04-09", [opp])
        tracker.resolve_prediction(preds[0].id, 0.0)

        scorer = AccuracyScorer(tracker)
        report = scorer.generate_weekly_report("2026-04-09")
        assert report.edge_calls_correct == 0
        assert report.edge_calls_total == 1
        assert report.edge_accuracy_pct == pytest.approx(0.0)

    def test_mixed_accuracy(self, tmp_db):
        """Mix of correct and incorrect calls."""
        tracker = PredictionTracker(db_path=tmp_db)

        # Correct: underpriced + YES
        opp1 = make_opp("m1", 0.30, 0.60, "underpriced")
        # Wrong: underpriced + NO
        opp2 = make_opp("m2", 0.30, 0.60, "underpriced")
        # Correct: overpriced + NO
        opp3 = make_opp("m3", 0.70, 0.40, "overpriced")

        preds = tracker.log_predictions("2026-04-09", [opp1, opp2, opp3])
        tracker.resolve_prediction(preds[0].id, 1.0)  # correct
        tracker.resolve_prediction(preds[1].id, 0.0)  # wrong
        tracker.resolve_prediction(preds[2].id, 0.0)  # correct

        scorer = AccuracyScorer(tracker)
        report = scorer.generate_weekly_report("2026-04-09")
        assert report.edge_calls_correct == 2
        assert report.edge_calls_total == 3
        assert report.edge_accuracy_pct == pytest.approx(66.667, rel=0.01)

    def test_calibration_buckets(self, tmp_db):
        """Test that calibration buckets are computed correctly."""
        tracker = PredictionTracker(db_path=tmp_db)

        # All in the 60-70% bucket, 2/3 resolve YES
        for i in range(3):
            opp = make_opp(f"m{i}", 0.50, 0.65, "underpriced")
            preds = tracker.log_predictions(f"2026-04-{9+i:02d}", [opp])
            outcome = 1.0 if i < 2 else 0.0
            tracker.resolve_prediction(preds[0].id, outcome)

        scorer = AccuracyScorer(tracker)
        report = scorer.generate_weekly_report("2026-04-15")

        assert "60-70%" in report.our_calibration
        bucket = report.our_calibration["60-70%"]
        assert bucket["count"] == 3
        assert bucket["avg_predicted"] == pytest.approx(0.65)
        assert bucket["avg_actual"] == pytest.approx(0.667, rel=0.01)

    def test_avg_brier_multiple_predictions(self, tmp_db):
        """Average Brier score across multiple predictions."""
        tracker = PredictionTracker(db_path=tmp_db)

        opp1 = make_opp("m1", 0.50, 0.80, "underpriced")
        opp2 = make_opp("m2", 0.50, 0.20, "overpriced")

        preds = tracker.log_predictions("2026-04-09", [opp1, opp2])
        tracker.resolve_prediction(preds[0].id, 1.0)  # our: (0.8-1)^2=0.04
        tracker.resolve_prediction(preds[1].id, 0.0)  # our: (0.2-0)^2=0.04

        stats = tracker.get_stats()
        assert stats["our_avg_brier"] == pytest.approx(0.04)
        # Market: (0.5-1)^2=0.25, (0.5-0)^2=0.25 -> avg 0.25
        assert stats["market_avg_brier"] == pytest.approx(0.25)
