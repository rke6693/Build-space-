"""Market resolution checker.

Checks prediction market platforms for resolution outcomes and
updates tracked predictions accordingly.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

import httpx

from ..models import Prediction
from .tracker import PredictionTracker

logger = logging.getLogger(__name__)


class ResolutionChecker:
    """Checks markets for resolution and updates tracked predictions."""

    def __init__(self, tracker: Optional[PredictionTracker] = None):
        self.tracker = tracker or PredictionTracker()
        self.client = httpx.Client(timeout=20.0, follow_redirects=True)

    def check_polymarket_resolution(self, market_id: str) -> Optional[float]:
        """Check if a Polymarket market has resolved.

        Returns:
            1.0 for YES, 0.0 for NO, None if not yet resolved.
        """
        try:
            resp = self.client.get(
                f"https://gamma-api.polymarket.com/markets/{market_id}",
            )
            resp.raise_for_status()
            data = resp.json()

            if data.get("closed") or data.get("resolved"):
                outcome = data.get("outcome")
                if outcome == "Yes":
                    return 1.0
                elif outcome == "No":
                    return 0.0

                # Check outcome prices
                outcome_prices = data.get("outcomePrices")
                if outcome_prices:
                    import json
                    try:
                        prices = json.loads(outcome_prices) if isinstance(outcome_prices, str) else outcome_prices
                        if prices and float(prices[0]) >= 0.99:
                            return 1.0
                        elif prices and float(prices[0]) <= 0.01:
                            return 0.0
                    except (json.JSONDecodeError, IndexError, TypeError):
                        pass

        except Exception as e:
            logger.debug(f"Failed to check Polymarket resolution for {market_id}: {e}")

        return None

    def check_kalshi_resolution(self, market_id: str) -> Optional[float]:
        """Check if a Kalshi market has resolved.

        Returns:
            1.0 for YES, 0.0 for NO, None if not yet resolved.
        """
        try:
            resp = self.client.get(
                f"https://api.elections.kalshi.com/trade-api/v2/markets/{market_id}",
                headers={"Accept": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json().get("market", {})

            result = data.get("result")
            if result == "yes":
                return 1.0
            elif result == "no":
                return 0.0

            status = data.get("status")
            if status in ("settled", "finalized"):
                settlement = data.get("settlement_value")
                if settlement is not None:
                    return 1.0 if float(settlement) >= 50 else 0.0

        except Exception as e:
            logger.debug(f"Failed to check Kalshi resolution for {market_id}: {e}")

        return None

    def check_and_resolve_all(self) -> dict:
        """Check all unresolved predictions and resolve any that have outcomes.

        Returns:
            Summary dict with counts.
        """
        unresolved = self.tracker.get_unresolved()
        resolved_count = 0
        checked_count = 0

        for pred in unresolved:
            checked_count += 1
            outcome = None

            if pred.market_source == "polymarket":
                outcome = self.check_polymarket_resolution(pred.market_id)
            elif pred.market_source == "kalshi":
                outcome = self.check_kalshi_resolution(pred.market_id)

            if outcome is not None:
                self.tracker.resolve_prediction(pred.id, outcome)
                resolved_count += 1
                logger.info(
                    f"Resolved: {pred.market_title} -> "
                    f"{'YES' if outcome == 1.0 else 'NO'}"
                )

        return {
            "checked": checked_count,
            "resolved": resolved_count,
            "remaining": checked_count - resolved_count,
        }

    def close(self):
        self.client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
