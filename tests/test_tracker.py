"""Tests for prediction tracker: file locking, atomic writes, idempotency, corruption recovery."""

import json
import os
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from newsletter_engine.tracker.tracker import PredictionTracker
from newsletter_engine.models import (
    Market, MarketSource, ResearchResult, DivergenceOpportunity,
)


@pytest.fixture
def tmp_db(tmp_path):
    """Create a temporary tracker DB path."""
    return tmp_path / "test_predictions.json"


@pytest.fixture
def tracker(tmp_db):
    """Create a tracker with a temporary DB."""
    return PredictionTracker(db_path=tmp_db)


@pytest.fixture
def sample_opportunity():
    """Create a sample DivergenceOpportunity for testing."""
    market = Market(
        id="test-market-1",
        source=MarketSource.POLYMARKET,
        title="Test market question?",
        current_price=0.45,
        volume=100000,
        resolution_date=datetime(2026, 4, 20, tzinfo=timezone.utc),
    )
    research = ResearchResult(
        market_id="test-market-1",
        assessed_probability=0.65,
        confidence=0.7,
        reasoning="Test reasoning",
    )
    return DivergenceOpportunity(
        market=market,
        research=research,
        divergence=0.20,
        edge_direction="underpriced",
        edge_magnitude=0.20,
    )


@pytest.fixture
def sample_opportunity_2():
    """Create a second sample opportunity."""
    market = Market(
        id="test-market-2",
        source=MarketSource.KALSHI,
        title="Another test market?",
        current_price=0.70,
        volume=50000,
        resolution_date=datetime(2026, 4, 22, tzinfo=timezone.utc),
    )
    research = ResearchResult(
        market_id="test-market-2",
        assessed_probability=0.55,
        confidence=0.6,
        reasoning="Test reasoning 2",
    )
    return DivergenceOpportunity(
        market=market,
        research=research,
        divergence=-0.15,
        edge_direction="overpriced",
        edge_magnitude=0.15,
    )


class TestTrackerBasics:
    def test_empty_tracker(self, tracker):
        assert tracker.get_all_predictions() == []
        stats = tracker.get_stats()
        assert stats["total_predictions"] == 0
        assert stats["resolved"] == 0

    def test_log_predictions(self, tracker, sample_opportunity):
        preds = tracker.log_predictions("2026-04-09", [sample_opportunity])
        assert len(preds) == 1
        assert preds[0].market_id == "test-market-1"
        assert preds[0].our_assessed_probability == 0.65
        assert preds[0].market_price_at_call == 0.45

        all_preds = tracker.get_all_predictions()
        assert len(all_preds) == 1

    def test_log_multiple(self, tracker, sample_opportunity, sample_opportunity_2):
        preds = tracker.log_predictions(
            "2026-04-09", [sample_opportunity, sample_opportunity_2]
        )
        assert len(preds) == 2
        assert tracker.get_stats()["total_predictions"] == 2


class TestIdempotency:
    def test_no_duplicates_on_rerun(self, tracker, sample_opportunity):
        """Re-running with same date + market_id should not create duplicates."""
        preds_1 = tracker.log_predictions("2026-04-09", [sample_opportunity])
        assert len(preds_1) == 1

        preds_2 = tracker.log_predictions("2026-04-09", [sample_opportunity])
        assert len(preds_2) == 0  # No new predictions

        assert tracker.get_stats()["total_predictions"] == 1

    def test_different_dates_allowed(self, tracker, sample_opportunity):
        """Same market on different dates should be logged separately."""
        tracker.log_predictions("2026-04-09", [sample_opportunity])
        tracker.log_predictions("2026-04-10", [sample_opportunity])
        assert tracker.get_stats()["total_predictions"] == 2

    def test_different_markets_same_date(
        self, tracker, sample_opportunity, sample_opportunity_2
    ):
        """Different markets on the same date should all be logged."""
        tracker.log_predictions("2026-04-09", [sample_opportunity])
        tracker.log_predictions("2026-04-09", [sample_opportunity_2])
        assert tracker.get_stats()["total_predictions"] == 2


class TestResolution:
    def test_resolve_prediction(self, tracker, sample_opportunity):
        preds = tracker.log_predictions("2026-04-09", [sample_opportunity])
        pred_id = preds[0].id

        tracker.resolve_prediction(pred_id, 1.0)

        resolved = tracker.get_all_predictions()
        assert resolved[0].resolved is True
        assert resolved[0].resolution_outcome == 1.0
        assert resolved[0].our_brier_score is not None
        assert resolved[0].market_brier_score is not None

    def test_double_resolve_is_noop(self, tracker, sample_opportunity):
        """Resolving an already-resolved prediction should be a no-op."""
        preds = tracker.log_predictions("2026-04-09", [sample_opportunity])
        pred_id = preds[0].id

        tracker.resolve_prediction(pred_id, 1.0)
        tracker.resolve_prediction(pred_id, 0.0)  # Should not change

        resolved = tracker.get_all_predictions()
        assert resolved[0].resolution_outcome == 1.0  # First resolution sticks

    def test_resolve_nonexistent(self, tracker):
        """Resolving a prediction that doesn't exist should not crash."""
        tracker.resolve_prediction("nonexistent-id", 1.0)  # Should just warn

    def test_unresolved_filter(self, tracker, sample_opportunity, sample_opportunity_2):
        preds = tracker.log_predictions(
            "2026-04-09", [sample_opportunity, sample_opportunity_2]
        )
        tracker.resolve_prediction(preds[0].id, 1.0)

        unresolved = tracker.get_unresolved()
        assert len(unresolved) == 1
        assert unresolved[0].market_id == "test-market-2"


class TestCorruptionRecovery:
    def test_corrupted_json_recovery(self, tmp_db):
        """Corrupted JSON file should not crash; should recover gracefully."""
        # Write valid data
        tracker = PredictionTracker(db_path=tmp_db)
        # Now corrupt the file
        tmp_db.write_text("{ invalid json !!!")

        # Should recover (return empty, save corrupt file)
        tracker2 = PredictionTracker(db_path=tmp_db)
        preds = tracker2.get_all_predictions()
        assert preds == []

    def test_empty_file_recovery(self, tmp_db):
        """Empty file should be handled gracefully."""
        tmp_db.parent.mkdir(parents=True, exist_ok=True)
        tmp_db.write_text("")

        tracker = PredictionTracker(db_path=tmp_db)
        assert tracker.get_all_predictions() == []

    def test_backup_created(self, tracker, sample_opportunity, tmp_db):
        """A backup should be created before each save."""
        tracker.log_predictions("2026-04-09", [sample_opportunity])

        backup_path = tmp_db.with_suffix(".backup")
        # Backup is created on the second save (first save has nothing to back up)
        tracker.log_predictions("2026-04-10", [sample_opportunity])
        assert backup_path.exists()

        backup_data = json.loads(backup_path.read_text())
        assert len(backup_data) == 1  # Backup has state from before second save


class TestConcurrency:
    def test_concurrent_writes(self, tmp_db):
        """Multiple threads writing should not lose data."""
        tracker = PredictionTracker(db_path=tmp_db)

        results = {"logged": 0, "errors": 0}
        lock = threading.Lock()

        def write_prediction(thread_id):
            market = Market(
                id=f"thread-market-{thread_id}",
                source=MarketSource.POLYMARKET,
                title=f"Thread {thread_id} market?",
                current_price=0.50,
            )
            research = ResearchResult(
                market_id=f"thread-market-{thread_id}",
                assessed_probability=0.60,
                confidence=0.5,
            )
            opp = DivergenceOpportunity(
                market=market,
                research=research,
                divergence=0.10,
                edge_direction="underpriced",
                edge_magnitude=0.10,
            )
            try:
                preds = tracker.log_predictions(f"2026-04-{thread_id:02d}", [opp])
                with lock:
                    results["logged"] += len(preds)
            except Exception:
                with lock:
                    results["errors"] += 1

        threads = [threading.Thread(target=write_prediction, args=(i,)) for i in range(1, 11)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert results["errors"] == 0
        assert results["logged"] == 10

        all_preds = tracker.get_all_predictions()
        assert len(all_preds) == 10
