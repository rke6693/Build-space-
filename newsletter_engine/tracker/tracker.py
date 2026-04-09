"""Prediction tracker: logs every call for future accuracy scoring.

Stores predictions in a JSON file with one entry per market call.
Each entry records: date, market details, our probability, market price,
and later the resolution outcome for scoring.

Fixes over v1:
- File locking to prevent concurrent write corruption
- Atomic writes (tmp + rename) to prevent mid-write corruption
- Backup before every write
- Corruption recovery from backups
- Idempotency: won't double-log for the same date + market_id
"""

import fcntl
import json
import logging
import shutil
import uuid
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Optional

from ..config import Config
from ..models import Prediction, DivergenceOpportunity
from ..utils import atomic_write_json, load_json_safe

logger = logging.getLogger(__name__)


class PredictionTracker:
    """Tracks all predictions for accuracy scoring."""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or Config.TRACKER_DB
        self._lock_path = self.db_path.with_suffix(".lock")
        self._backup_path = self.db_path.with_suffix(".backup")
        self._ensure_db()

    def _ensure_db(self):
        """Create the DB file if it doesn't exist."""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.db_path.exists():
            atomic_write_json(self.db_path, [])

    @contextmanager
    def _file_lock(self):
        """Acquire an exclusive file lock for read-modify-write operations.

        Uses fcntl.flock for POSIX advisory locking. This prevents
        concurrent processes from corrupting the JSON file.
        """
        self._lock_path.parent.mkdir(parents=True, exist_ok=True)
        lock_fd = open(self._lock_path, "w")
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX)
            yield
        finally:
            fcntl.flock(lock_fd, fcntl.LOCK_UN)
            lock_fd.close()

    def _load(self) -> list[dict]:
        """Load all predictions from disk with corruption recovery."""
        return load_json_safe(self.db_path, backup_on_corrupt=True)

    def _save(self, data: list[dict]):
        """Save predictions atomically with backup.

        1. Copy current file to .backup
        2. Write new data to temp file
        3. Atomic rename temp -> db
        """
        # Back up current data before overwriting
        if self.db_path.exists() and self.db_path.stat().st_size > 0:
            try:
                shutil.copy2(self.db_path, self._backup_path)
            except OSError as e:
                logger.warning(f"Failed to create backup: {e}")

        atomic_write_json(self.db_path, data)

    def log_predictions(
        self,
        date: str,
        opportunities: list[DivergenceOpportunity],
    ) -> list[Prediction]:
        """Log a batch of predictions from today's newsletter.

        Idempotent: if predictions for this date + market_id already exist,
        they are skipped (not duplicated).

        Args:
            date: YYYY-MM-DD of the newsletter.
            opportunities: The divergence opportunities featured.

        Returns:
            List of Prediction objects that were newly logged.
        """
        new_predictions = []

        with self._file_lock():
            existing = self._load()
            existing_keys = {
                (entry.get("date"), entry.get("market_id"))
                for entry in existing
            }

            for opp in opportunities:
                key = (date, opp.market.id)
                if key in existing_keys:
                    logger.debug(
                        f"Skipping duplicate prediction: {date}/{opp.market.id}"
                    )
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
                new_predictions.append(pred)
                existing.append(pred.model_dump())
                existing_keys.add(key)

            if new_predictions:
                self._save(existing)

        skipped = len(opportunities) - len(new_predictions)
        if skipped > 0:
            logger.info(f"Skipped {skipped} duplicate predictions for {date}")
        logger.info(f"Logged {len(new_predictions)} new predictions for {date}")
        return new_predictions

    def get_all_predictions(self) -> list[Prediction]:
        """Load all tracked predictions."""
        data = self._load()
        predictions = []
        for entry in data:
            try:
                predictions.append(Prediction(**entry))
            except Exception as e:
                logger.warning(f"Skipping malformed prediction entry: {e}")
        return predictions

    def get_unresolved(self) -> list[Prediction]:
        """Get predictions that haven't been resolved yet."""
        return [p for p in self.get_all_predictions() if not p.resolved]

    def get_predictions_for_date(self, date: str) -> list[Prediction]:
        """Get predictions from a specific newsletter date."""
        return [p for p in self.get_all_predictions() if p.date == date]

    def resolve_prediction(self, prediction_id: str, outcome: float):
        """Mark a prediction as resolved with the actual outcome.

        Args:
            prediction_id: The prediction ID.
            outcome: 1.0 for YES, 0.0 for NO.
        """
        with self._file_lock():
            data = self._load()
            found = False
            for entry in data:
                if entry.get("id") == prediction_id:
                    if entry.get("resolved"):
                        logger.debug(
                            f"Prediction {prediction_id} already resolved, skipping"
                        )
                        return
                    entry["resolved"] = True
                    entry["resolution_outcome"] = outcome

                    # Calculate Brier scores
                    our_prob = entry["our_assessed_probability"]
                    market_prob = entry["market_price_at_call"]
                    entry["our_brier_score"] = (our_prob - outcome) ** 2
                    entry["market_brier_score"] = (market_prob - outcome) ** 2

                    logger.info(
                        f"Resolved {prediction_id}: outcome={outcome}, "
                        f"our_brier={entry['our_brier_score']:.4f}, "
                        f"market_brier={entry['market_brier_score']:.4f}"
                    )
                    found = True
                    break

            if not found:
                logger.warning(f"Prediction {prediction_id} not found for resolution")
                return

            self._save(data)

    def get_stats(self) -> dict:
        """Get summary statistics."""
        preds = self.get_all_predictions()
        resolved = [p for p in preds if p.resolved]

        stats = {
            "total_predictions": len(preds),
            "resolved": len(resolved),
            "unresolved": len(preds) - len(resolved),
        }

        if resolved:
            our_briers = [
                p.our_brier_score for p in resolved
                if p.our_brier_score is not None
            ]
            market_briers = [
                p.market_brier_score for p in resolved
                if p.market_brier_score is not None
            ]

            if our_briers:
                stats["our_avg_brier"] = sum(our_briers) / len(our_briers)
            if market_briers:
                stats["market_avg_brier"] = sum(market_briers) / len(market_briers)

        return stats
