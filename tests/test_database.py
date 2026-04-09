"""Tests for SQLite prediction database."""

import json
import threading
from datetime import datetime, timezone
from pathlib import Path

import pytest

from newsletter_engine.tracker.database import PredictionDB
from newsletter_engine.models import (
    Market, MarketSource, ResearchResult, DivergenceOpportunity,
)


@pytest.fixture
def db(tmp_path):
    return PredictionDB(db_path=tmp_path / "test.db")


def make_opp(market_id, market_price=0.45, our_prob=0.65, direction="underpriced"):
    market = Market(
        id=market_id,
        source=MarketSource.POLYMARKET,
        title=f"Market {market_id}",
        current_price=market_price,
        volume=100000,
        resolution_date=datetime(2026, 4, 20, tzinfo=timezone.utc),
    )
    research = ResearchResult(
        market_id=market_id,
        assessed_probability=our_prob,
        confidence=0.7,
        reasoning="Test",
    )
    return DivergenceOpportunity(
        market=market,
        research=research,
        divergence=our_prob - market_price,
        edge_direction=direction,
        edge_magnitude=abs(our_prob - market_price),
    )


class TestDatabaseBasics:
    def test_empty_db(self, db):
        assert db.get_all_predictions() == []
        stats = db.get_stats()
        assert stats["total_predictions"] == 0

    def test_log_and_retrieve(self, db):
        preds = db.log_predictions("2026-04-09", [make_opp("m1")])
        assert len(preds) == 1

        all_preds = db.get_all_predictions()
        assert len(all_preds) == 1
        assert all_preds[0].market_id == "m1"

    def test_idempotent_logging(self, db):
        db.log_predictions("2026-04-09", [make_opp("m1")])
        preds2 = db.log_predictions("2026-04-09", [make_opp("m1")])
        assert len(preds2) == 0
        assert db.get_stats()["total_predictions"] == 1

    def test_different_dates_not_deduplicated(self, db):
        db.log_predictions("2026-04-09", [make_opp("m1")])
        db.log_predictions("2026-04-10", [make_opp("m1")])
        assert db.get_stats()["total_predictions"] == 2


class TestDatabaseResolution:
    def test_resolve(self, db):
        preds = db.log_predictions("2026-04-09", [make_opp("m1")])
        db.resolve_prediction(preds[0].id, 1.0)

        resolved = db.get_all_predictions()[0]
        assert resolved.resolved is True
        assert resolved.resolution_outcome == 1.0
        assert resolved.our_brier_score is not None

    def test_double_resolve_noop(self, db):
        preds = db.log_predictions("2026-04-09", [make_opp("m1")])
        db.resolve_prediction(preds[0].id, 1.0)
        db.resolve_prediction(preds[0].id, 0.0)

        resolved = db.get_all_predictions()[0]
        assert resolved.resolution_outcome == 1.0  # First resolution sticks

    def test_brier_calculation(self, db):
        opp = make_opp("m1", market_price=0.30, our_prob=0.70)
        preds = db.log_predictions("2026-04-09", [opp])
        db.resolve_prediction(preds[0].id, 1.0)

        p = db.get_all_predictions()[0]
        assert p.our_brier_score == pytest.approx(0.09)  # (0.7-1)^2
        assert p.market_brier_score == pytest.approx(0.49)  # (0.3-1)^2

    def test_unresolved_filter(self, db):
        preds = db.log_predictions("2026-04-09", [make_opp("m1"), make_opp("m2")])
        db.resolve_prediction(preds[0].id, 1.0)

        unresolved = db.get_unresolved()
        assert len(unresolved) == 1
        assert unresolved[0].market_id == "m2"


class TestDatabaseStats:
    def test_stats_with_resolved(self, db):
        opp1 = make_opp("m1", market_price=0.50, our_prob=0.80)
        opp2 = make_opp("m2", market_price=0.50, our_prob=0.20, direction="overpriced")
        preds = db.log_predictions("2026-04-09", [opp1, opp2])

        db.resolve_prediction(preds[0].id, 1.0)  # our_brier = 0.04
        db.resolve_prediction(preds[1].id, 0.0)  # our_brier = 0.04

        stats = db.get_stats()
        assert stats["total_predictions"] == 2
        assert stats["resolved"] == 2
        assert stats["our_avg_brier"] == pytest.approx(0.04)
        assert stats["market_avg_brier"] == pytest.approx(0.25)


class TestDatabaseConcurrency:
    def test_concurrent_writes(self, tmp_path):
        db = PredictionDB(db_path=tmp_path / "concurrent.db")
        results = {"logged": 0, "errors": 0}
        lock = threading.Lock()

        def write(thread_id):
            try:
                opp = make_opp(f"thread-{thread_id}")
                preds = db.log_predictions(f"2026-04-{thread_id:02d}", [opp])
                with lock:
                    results["logged"] += len(preds)
            except Exception:
                with lock:
                    results["errors"] += 1

        threads = [threading.Thread(target=write, args=(i,)) for i in range(1, 11)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert results["errors"] == 0
        assert results["logged"] == 10
        assert db.get_stats()["total_predictions"] == 10


class TestDatabaseMigration:
    def test_migrate_from_json(self, tmp_path):
        # Create a JSON file with predictions
        json_path = tmp_path / "predictions.json"
        json_data = [
            {
                "id": "abc123",
                "date": "2026-04-01",
                "market_id": "legacy-m1",
                "market_title": "Legacy market",
                "market_source": "polymarket",
                "market_url": "",
                "market_price_at_call": 0.50,
                "our_assessed_probability": 0.70,
                "our_confidence": 0.6,
                "edge_direction": "underpriced",
                "edge_magnitude": 0.20,
                "resolution_date": None,
                "resolved": True,
                "resolution_outcome": 1.0,
                "our_brier_score": 0.09,
                "market_brier_score": 0.25,
                "created_at": "2026-04-01T05:00:00",
            },
        ]
        json_path.write_text(json.dumps(json_data))

        db = PredictionDB(db_path=tmp_path / "migrated.db")
        db.migrate_from_json(json_path)

        all_preds = db.get_all_predictions()
        assert len(all_preds) == 1
        assert all_preds[0].market_id == "legacy-m1"
        assert all_preds[0].resolved is True
        assert all_preds[0].our_brier_score == pytest.approx(0.09)

    def test_migrate_idempotent(self, tmp_path):
        json_path = tmp_path / "predictions.json"
        json_path.write_text(json.dumps([{
            "id": "abc", "date": "2026-04-01", "market_id": "m1",
            "market_title": "T", "market_source": "polymarket",
            "market_price_at_call": 0.5, "our_assessed_probability": 0.7,
            "our_confidence": 0.6, "edge_direction": "underpriced",
            "edge_magnitude": 0.2, "created_at": "2026-04-01T00:00:00",
        }]))

        db = PredictionDB(db_path=tmp_path / "migrated.db")
        db.migrate_from_json(json_path)
        db.migrate_from_json(json_path)  # Should not duplicate

        assert db.get_stats()["total_predictions"] == 1
