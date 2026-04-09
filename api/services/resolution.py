"""
OmniSight — Resolution Tracker
Monitors market resolutions, validates outcomes across platforms,
detects disputed resolutions, and tracks resolution source accuracy.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

import structlog

from api.connectors.base import BaseConnector
from api.models import (
    MarketResponse, MarketStatus, Platform, ResolutionEvent, ResolutionOutcome,
)

logger = structlog.get_logger(__name__)


class ResolutionTracker:
    """
    Tracks and validates market resolutions across platforms.
    Identifies disputed outcomes, tracks resolution source reliability.
    """

    def __init__(self, connectors: dict[Platform, BaseConnector]):
        self.connectors = connectors

        # Resolution history (production: backed by DB)
        self._resolutions: list[ResolutionEvent] = []
        self._disputes: list[dict] = []
        self._source_accuracy: dict[str, dict] = defaultdict(
            lambda: {"correct": 0, "incorrect": 0, "disputed": 0}
        )
        self._subscribers: list[asyncio.Queue] = []

    async def check_resolution(
        self,
        market_id: str,
        platform: Platform,
    ) -> Optional[ResolutionEvent]:
        """Check if a market has been resolved."""
        connector = self.connectors.get(platform)
        if not connector:
            return None

        try:
            market = await connector.get_market(market_id)
        except Exception as e:
            logger.error("resolution_check_failed", market=market_id, error=str(e))
            return None

        if market.status != MarketStatus.RESOLVED:
            return None

        # Determine outcome from final price
        final_price = market.last_trade_price or market.yes_price or 0.5
        if final_price >= 0.95:
            outcome = ResolutionOutcome.YES
        elif final_price <= 0.05:
            outcome = ResolutionOutcome.NO
        else:
            outcome = ResolutionOutcome.PARTIAL

        event = ResolutionEvent(
            market_id=market.id,
            platform=platform,
            title=market.title,
            outcome=outcome,
            resolution_source=market.resolution or "platform_settlement",
            resolved_at=market.updated_at or datetime.now(timezone.utc),
            final_price=final_price,
            total_volume=market.volume_total,
        )

        self._resolutions.append(event)

        # Notify subscribers
        for queue in self._subscribers:
            await queue.put(event)

        return event

    async def validate_cross_platform(
        self,
        event_title: str,
        resolutions: dict[Platform, ResolutionEvent],
    ) -> dict:
        """
        Validate that the same event resolved consistently across platforms.
        Returns validation report.
        """
        outcomes = {p.value: r.outcome for p, r in resolutions.items()}
        unique_outcomes = set(outcomes.values())

        is_consistent = len(unique_outcomes) == 1
        dispute = None

        if not is_consistent:
            dispute = {
                "event_title": event_title,
                "platforms": {
                    p: {"outcome": o.value, "source": resolutions[Platform(p)].resolution_source}
                    for p, o in outcomes.items()
                },
                "detected_at": datetime.now(timezone.utc).isoformat(),
                "severity": "high" if ResolutionOutcome.YES in unique_outcomes and ResolutionOutcome.NO in unique_outcomes else "medium",
            }
            self._disputes.append(dispute)
            logger.warning("resolution_dispute_detected", event=event_title, outcomes=outcomes)

        return {
            "event_title": event_title,
            "is_consistent": is_consistent,
            "outcomes": {p: o.value for p, o in outcomes.items()},
            "platforms_resolved": len(resolutions),
            "dispute": dispute,
        }

    async def scan_pending_resolutions(
        self,
        markets: list[tuple[str, Platform]],
    ) -> list[ResolutionEvent]:
        """Batch scan markets for new resolutions."""
        tasks = [self.check_resolution(mid, p) for mid, p in markets]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        resolved = []
        for result in results:
            if isinstance(result, ResolutionEvent):
                resolved.append(result)

        return resolved

    def get_resolution_stats(self, days: int = 30) -> dict:
        """Get resolution statistics over a time period."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        recent = [r for r in self._resolutions if r.resolved_at >= cutoff]

        outcomes = defaultdict(int)
        platforms = defaultdict(int)
        volumes = []

        for r in recent:
            outcomes[r.outcome.value] += 1
            platforms[r.platform.value] += 1
            volumes.append(r.total_volume)

        return {
            "period_days": days,
            "total_resolutions": len(recent),
            "outcome_distribution": dict(outcomes),
            "platform_distribution": dict(platforms),
            "total_resolved_volume": sum(volumes),
            "avg_volume_per_market": sum(volumes) / len(volumes) if volumes else 0,
            "disputes_detected": len([
                d for d in self._disputes
                if datetime.fromisoformat(d["detected_at"]) >= cutoff
            ]),
        }

    def get_upcoming_resolutions(
        self,
        markets: list[MarketResponse],
        hours: int = 48,
    ) -> list[dict]:
        """Find markets approaching resolution deadline."""
        now = datetime.now(timezone.utc)
        cutoff = now + timedelta(hours=hours)
        upcoming = []

        for m in markets:
            if m.end_date and now < m.end_date <= cutoff and m.status == MarketStatus.ACTIVE:
                hours_remaining = (m.end_date - now).total_seconds() / 3600
                upcoming.append({
                    "market_id": m.id,
                    "title": m.title,
                    "platform": m.platform.value,
                    "end_date": m.end_date.isoformat(),
                    "hours_remaining": round(hours_remaining, 1),
                    "current_yes_price": m.yes_price,
                    "volume": m.volume_total,
                    "confidence": "high" if m.yes_price and (m.yes_price > 0.9 or m.yes_price < 0.1) else "medium",
                })

        upcoming.sort(key=lambda x: x["hours_remaining"])
        return upcoming

    def subscribe(self) -> asyncio.Queue:
        """Subscribe to resolution events."""
        queue = asyncio.Queue()
        self._subscribers.append(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue):
        self._subscribers.remove(queue)
