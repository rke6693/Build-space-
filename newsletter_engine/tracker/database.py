"""SQLite-backed prediction database.

Replaces the JSON file tracker with a proper database that supports:
- Atomic transactions (no corruption)
- Concurrent access (SQLite WAL mode)
- Efficient queries (indexed)
- Schema migrations
- No file locking gymnastics

The JSON tracker is kept as a fallback import path but this is the
primary storage backend.
"""

import logging
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from ..config import Config
from ..models import Prediction, DivergenceOpportunity

logger = logging.getLogger(__name__)

SCHEMA_VERSION = 1

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS predictions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    market_id TEXT NOT NULL,
    market_title TEXT NOT NULL,
    market_source TEXT NOT NULL,
    market_url TEXT DEFAULT '',
    market_price_at_call REAL NOT NULL,
    our_assessed_probability REAL NOT NULL,
    our_confidence REAL NOT NULL,
    edge_direction TEXT NOT NULL,
    edge_magnitude REAL NOT NULL,
    resolution_date TEXT,
    resolved INTEGER DEFAULT 0,
    resolution_outcome REAL,
    our_brier_score REAL,
    market_brier_score REAL,
    created_at TEXT NOT NULL,
    UNIQUE(date, market_id)
);

CREATE INDEX IF NOT EXISTS idx_predictions_date ON predictions(date);
CREATE INDEX IF NOT EXISTS idx_predictions_resolved ON predictions(resolved);
CREATE INDEX IF NOT EXISTS idx_predictions_market_id ON predictions(market_id);

CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
);
"""


class PredictionDB:
    """SQLite-backed prediction tracker."""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or Config.TRACKER_DB.with_suffix(".db")
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self):
        """Initialize the database schema."""
        with self._connect() as conn:
            conn.executescript(SCHEMA_SQL)
            # Set schema version
            existing = conn.execute(
                "SELECT version FROM schema_version LIMIT 1"
            ).fetchone()
            if not existing:
                conn.execute(
                    "INSERT INTO schema_version (version) VALUES (?)",
                    (SCHEMA_VERSION,),
                )

    @contextmanager
    def _connect(self):
        """Get a database connection with WAL mode and proper settings."""
        conn = sqlite3.connect(
            str(self.db_path),
            timeout=10.0,
            isolation_level="DEFERRED",
        )
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def log_predictions(
        self,
        date: str,
        opportunities: list[DivergenceOpportunity],
    ) -> list[Prediction]:
        """Log predictions. Idempotent: skips existing (date, market_id) pairs."""
        import uuid
        new_predictions = []

        with self._connect() as conn:
            for opp in opportunities:
                # Check for existing
                existing = conn.execute(
                    "SELECT id FROM predictions WHERE date = ? AND market_id = ?",
                    (date, opp.market.id),
                ).fetchone()

                if existing:
                    logger.debug(f"Skipping duplicate: {date}/{opp.market.id}")
                    continue

                pred = Prediction(
                    id=str(uuid.uuid4())[:8],
                    date=date,
                    market_id=opp.market.id,
                    market_title=opp.market.title,
                    market_source=opp.market.source.value,
                    market_url=opp.market.url,
                    market_price_at_call=opp.market.current_price,
                    our_assessed_probability=opp.research.assessed_probability,
                    our_confidence=opp.research.confidence,
                    edge_direction=opp.edge_direction,
                    edge_magnitude=opp.edge_magnitude,
                    resolution_date=(
                        opp.market.resolution_date.isoformat()
                        if opp.market.resolution_date else None
                    ),
                )

                conn.execute(
                    """INSERT INTO predictions (
                        id, date, market_id, market_title, market_source, market_url,
                        market_price_at_call, our_assessed_probability, our_confidence,
                        edge_direction, edge_magnitude, resolution_date, resolved, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)""",
                    (
                        pred.id, pred.date, pred.market_id, pred.market_title,
                        pred.market_source, pred.market_url,
                        pred.market_price_at_call, pred.our_assessed_probability,
                        pred.our_confidence, pred.edge_direction, pred.edge_magnitude,
                        pred.resolution_date, pred.created_at,
                    ),
                )
                new_predictions.append(pred)

        skipped = len(opportunities) - len(new_predictions)
        if skipped > 0:
            logger.info(f"Skipped {skipped} duplicate predictions for {date}")
        logger.info(f"Logged {len(new_predictions)} new predictions for {date}")
        return new_predictions

    def _row_to_prediction(self, row: sqlite3.Row) -> Prediction:
        """Convert a database row to a Prediction object."""
        return Prediction(
            id=row["id"],
            date=row["date"],
            market_id=row["market_id"],
            market_title=row["market_title"],
            market_source=row["market_source"],
            market_url=row["market_url"] or "",
            market_price_at_call=row["market_price_at_call"],
            our_assessed_probability=row["our_assessed_probability"],
            our_confidence=row["our_confidence"],
            edge_direction=row["edge_direction"],
            edge_magnitude=row["edge_magnitude"],
            resolution_date=row["resolution_date"],
            resolved=bool(row["resolved"]),
            resolution_outcome=row["resolution_outcome"],
            our_brier_score=row["our_brier_score"],
            market_brier_score=row["market_brier_score"],
            created_at=row["created_at"],
        )

    def get_all_predictions(self) -> list[Prediction]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM predictions ORDER BY date DESC, created_at DESC"
            ).fetchall()
            return [self._row_to_prediction(r) for r in rows]

    def get_unresolved(self) -> list[Prediction]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM predictions WHERE resolved = 0 ORDER BY date"
            ).fetchall()
            return [self._row_to_prediction(r) for r in rows]

    def get_predictions_for_date(self, date: str) -> list[Prediction]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM predictions WHERE date = ? ORDER BY created_at",
                (date,),
            ).fetchall()
            return [self._row_to_prediction(r) for r in rows]

    def resolve_prediction(self, prediction_id: str, outcome: float):
        """Resolve a prediction. No-op if already resolved."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT resolved, our_assessed_probability, market_price_at_call "
                "FROM predictions WHERE id = ?",
                (prediction_id,),
            ).fetchone()

            if not row:
                logger.warning(f"Prediction {prediction_id} not found")
                return
            if row["resolved"]:
                logger.debug(f"Prediction {prediction_id} already resolved")
                return

            our_brier = (row["our_assessed_probability"] - outcome) ** 2
            market_brier = (row["market_price_at_call"] - outcome) ** 2

            conn.execute(
                """UPDATE predictions SET
                    resolved = 1,
                    resolution_outcome = ?,
                    our_brier_score = ?,
                    market_brier_score = ?
                WHERE id = ?""",
                (outcome, our_brier, market_brier, prediction_id),
            )

            logger.info(
                f"Resolved {prediction_id}: outcome={outcome}, "
                f"our_brier={our_brier:.4f}, market_brier={market_brier:.4f}"
            )

    def get_stats(self) -> dict:
        with self._connect() as conn:
            total = conn.execute("SELECT COUNT(*) FROM predictions").fetchone()[0]
            resolved = conn.execute(
                "SELECT COUNT(*) FROM predictions WHERE resolved = 1"
            ).fetchone()[0]

            stats = {
                "total_predictions": total,
                "resolved": resolved,
                "unresolved": total - resolved,
            }

            if resolved > 0:
                row = conn.execute(
                    "SELECT AVG(our_brier_score) as our_avg, "
                    "AVG(market_brier_score) as market_avg "
                    "FROM predictions WHERE resolved = 1 "
                    "AND our_brier_score IS NOT NULL"
                ).fetchone()
                if row["our_avg"] is not None:
                    stats["our_avg_brier"] = row["our_avg"]
                if row["market_avg"] is not None:
                    stats["market_avg_brier"] = row["market_avg"]

            return stats

    def migrate_from_json(self, json_path: Path):
        """Import predictions from the old JSON tracker file.

        Useful for migrating existing data to SQLite.
        """
        import json

        if not json_path.exists():
            logger.info("No JSON tracker file to migrate")
            return

        try:
            data = json.loads(json_path.read_text())
        except (json.JSONDecodeError, FileNotFoundError):
            logger.error(f"Could not read JSON tracker: {json_path}")
            return

        imported = 0
        skipped = 0

        with self._connect() as conn:
            for entry in data:
                try:
                    existing = conn.execute(
                        "SELECT id FROM predictions WHERE date = ? AND market_id = ?",
                        (entry.get("date", ""), entry.get("market_id", "")),
                    ).fetchone()

                    if existing:
                        skipped += 1
                        continue

                    conn.execute(
                        """INSERT INTO predictions (
                            id, date, market_id, market_title, market_source, market_url,
                            market_price_at_call, our_assessed_probability, our_confidence,
                            edge_direction, edge_magnitude, resolution_date,
                            resolved, resolution_outcome, our_brier_score,
                            market_brier_score, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (
                            entry.get("id", ""),
                            entry.get("date", ""),
                            entry.get("market_id", ""),
                            entry.get("market_title", ""),
                            entry.get("market_source", ""),
                            entry.get("market_url", ""),
                            entry.get("market_price_at_call", 0),
                            entry.get("our_assessed_probability", 0),
                            entry.get("our_confidence", 0),
                            entry.get("edge_direction", ""),
                            entry.get("edge_magnitude", 0),
                            entry.get("resolution_date"),
                            1 if entry.get("resolved") else 0,
                            entry.get("resolution_outcome"),
                            entry.get("our_brier_score"),
                            entry.get("market_brier_score"),
                            entry.get("created_at", datetime.now(timezone.utc).isoformat()),
                        ),
                    )
                    imported += 1
                except Exception as e:
                    logger.warning(f"Skipping malformed entry during migration: {e}")

        logger.info(f"Migration complete: {imported} imported, {skipped} skipped (duplicates)")
