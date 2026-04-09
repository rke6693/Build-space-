"""Prediction tracker: logs every call for future accuracy scoring.

Stores predictions in a JSON file with one entry per market call.
Each entry records: date, market details, our probability, market price,
and later the resolution outcome for scoring.
"""

import json
import logging
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from ..config import Config
from ..models import Prediction, DivergenceOpportunity

logger = logging.getLogger(__name__)


class PredictionTracker:
    """Tracks all predictions for accuracy scoring."""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or Config.TRACKER_DB
        self._ensure_db()

    def _ensure_db(self):
        """Create the DB file if it doesn't exist."""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.db_path.exists():
            self.db_path.write_text("[]")

    def _load(self) -> list[dict]:
        """Load all predictions from disk."""
        try:
            return json.loads(self.db_path.read_text())
        except (json.JSONDecodeError, FileNotFoundError):
            return []

    def _save(self, data: list[dict]):
        """Save predictions to disk."""
        self.db_path.write_text(json.dumps(data, indent=2, default=str))

    def log_predictions(
        self,
        date: str,
        opportunities: list[DivergenceOpportunity],
    ) -> list[Prediction]:
        """Log a batch of predictions from today's newsletter.

        Args:
            date: YYYY-MM-DD of the newsletter.
            opportunities: The divergence opportunities featured.

        Returns:
            List of Prediction objects that were logged.
        """
        predictions = []
        existing = self._load()

        for opp in opportunities:
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
                resolution_date=opp.market.resolution_date.isoformat() if opp.market.resolution_date else None,
            )
            predictions.append(pred)
            existing.append(pred.model_dump())

        self._save(existing)
        logger.info(f"Logged {len(predictions)} predictions for {date}")
        return predictions

    def get_all_predictions(self) -> list[Prediction]:
        """Load all tracked predictions."""
        data = self._load()
        return [Prediction(**p) for p in data]

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
        data = self._load()
        for entry in data:
            if entry.get("id") == prediction_id:
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
                break

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
            our_briers = [p.our_brier_score for p in resolved if p.our_brier_score is not None]
            market_briers = [p.market_brier_score for p in resolved if p.market_brier_score is not None]

            if our_briers:
                stats["our_avg_brier"] = sum(our_briers) / len(our_briers)
            if market_briers:
                stats["market_avg_brier"] = sum(market_briers) / len(market_briers)

        return stats
