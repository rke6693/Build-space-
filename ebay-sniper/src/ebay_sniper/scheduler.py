"""Snipe scheduler with collision detection.

High-level flow:

1. Call :meth:`plan` to turn a list of DB :class:`Auction` rows into a list of
   :class:`Snipe` plans, detecting collisions and marking collided ones as
   skipped. A collision means auction B's scheduled bid time falls inside the
   window `[bid_A, end_A]` of some other auction A. Since we only drive one
   browser context at a time, B is skipped with a warning.
2. :meth:`run` awaits each plan's scheduled local time and calls the provided
   bid callback. The callback itself handles the bid flow; the scheduler
   handles retries on failure.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable

from .db import Auction, Database, STATUS_ENDED, STATUS_SCHEDULED, STATUS_SKIPPED_COLLISION
from .ebay_client import BidResult
from .time_sync import ClockOffset

logger = logging.getLogger(__name__)


@dataclass
class SnipePlan:
    auction: Auction
    ebay_bid_at: datetime  # when to bid, in eBay server time
    ebay_end_at: datetime  # when the auction closes
    collided_with: int | None = None  # auction id we collided with, if skipped

    @property
    def skipped(self) -> bool:
        return self.collided_with is not None


@dataclass
class PlanResult:
    plans: list[SnipePlan] = field(default_factory=list)
    skipped: list[SnipePlan] = field(default_factory=list)


def plan_snipes(auctions: list[Auction], *, now_ebay: datetime) -> PlanResult:
    """Return a sorted plan for bidding on `auctions`, skipping collisions.

    Auctions without an `end_time_utc` are ignored (the runner will try to
    refresh item details before scheduling).
    """
    schedulable: list[SnipePlan] = []
    for a in auctions:
        if a.end_time_utc is None:
            logger.warning(
                "auction id=%s item=%s has no end time; refresh before scheduling",
                a.id,
                a.item_id,
            )
            continue
        if a.end_time_utc <= now_ebay:
            logger.info(
                "auction id=%s item=%s already ended; skipping", a.id, a.item_id
            )
            continue
        bid_at = a.end_time_utc - timedelta(seconds=a.lead_time_s)
        schedulable.append(
            SnipePlan(auction=a, ebay_bid_at=bid_at, ebay_end_at=a.end_time_utc)
        )

    # Sort by bid time ascending.
    schedulable.sort(key=lambda p: p.ebay_bid_at)

    result = PlanResult()
    for plan in schedulable:
        collision = _find_collision(plan, result.plans)
        if collision is not None:
            plan.collided_with = collision.auction.id
            result.skipped.append(plan)
            logger.warning(
                "collision: auction id=%s (bid_at=%s) overlaps id=%s (end_at=%s); skipping",
                plan.auction.id,
                plan.ebay_bid_at.isoformat(),
                collision.auction.id,
                collision.ebay_end_at.isoformat(),
            )
        else:
            result.plans.append(plan)
    return result


def _find_collision(candidate: SnipePlan, accepted: list[SnipePlan]) -> SnipePlan | None:
    """Return an accepted plan whose [bid_at, end_at] window overlaps `candidate`.

    We count a collision as any temporal overlap between the two windows
    `[bid_at_i, end_at_i]`, since Playwright can only run one bid flow at a
    time cleanly.
    """
    c_start = candidate.ebay_bid_at
    c_end = candidate.ebay_end_at
    for p in accepted:
        p_start = p.ebay_bid_at
        p_end = p.ebay_end_at
        if c_start <= p_end and p_start <= c_end:
            return p
    return None


# Callback signature: given a plan and a dry-run flag, place the bid and
# return the result. Runner handles retries.
BidCallback = Callable[[SnipePlan, bool], Awaitable[BidResult]]
NoticeCallback = Callable[[str, str], None]  # (subject, body)


class SniperRunner:
    def __init__(
        self,
        *,
        db: Database,
        clock: ClockOffset,
        bid_callback: BidCallback,
        notice_callback: NoticeCallback,
        dry_run: bool = False,
        retry_delay_s: float = 0.25,
    ) -> None:
        self.db = db
        self.clock = clock
        self.bid_callback = bid_callback
        self.notice_callback = notice_callback
        self.dry_run = dry_run
        self.retry_delay_s = retry_delay_s

    async def run(self, plans: list[SnipePlan]) -> None:
        for plan in plans:
            await self._await_and_fire(plan)

    async def _await_and_fire(self, plan: SnipePlan) -> None:
        local_bid_at = self.clock.local_time_for_ebay(plan.ebay_bid_at)
        wait_s = (local_bid_at - datetime.now(timezone.utc)).total_seconds()
        if wait_s > 0:
            logger.info(
                "sleeping %.2fs until bid for auction id=%s (item=%s, ebay_bid_at=%s)",
                wait_s,
                plan.auction.id,
                plan.auction.item_id,
                plan.ebay_bid_at.isoformat(),
            )
            await asyncio.sleep(wait_s)
        else:
            logger.warning(
                "bid time for auction id=%s is already in the past (%.2fs); firing immediately",
                plan.auction.id,
                -wait_s,
            )

        self.db.set_status(plan.auction.id, STATUS_SCHEDULED)
        result = await self._fire_with_retry(plan)
        await self._handle_result(plan, result)

    async def _fire_with_retry(self, plan: SnipePlan) -> BidResult:
        result = await self.bid_callback(plan, self.dry_run)
        if result.ok:
            return result
        logger.warning(
            "bid failed for auction id=%s: %s; retrying once",
            plan.auction.id,
            result.error,
        )
        await asyncio.sleep(self.retry_delay_s)
        return await self.bid_callback(plan, self.dry_run)

    async def _handle_result(self, plan: SnipePlan, result: BidResult) -> None:
        now = datetime.now(timezone.utc)
        if result.ok and result.dry_run:
            self.db.record_snipe(
                auction_id=plan.auction.id,
                fired_at_utc=now,
                outcome="dry_run",
                final_price_cents=result.final_price_cents,
                dry_run=True,
            )
            self.db.set_status(plan.auction.id, STATUS_ENDED)
            self.notice_callback(
                f"[ebay-sniper] DRY RUN fired for {plan.auction.item_id}",
                _format_body(plan, result),
            )
            return
        if result.ok:
            self.db.record_snipe(
                auction_id=plan.auction.id,
                fired_at_utc=now,
                outcome="success",
                final_price_cents=result.final_price_cents,
            )
            self.db.set_status(plan.auction.id, STATUS_ENDED)
            self.notice_callback(
                f"[ebay-sniper] Bid placed on {plan.auction.item_id}",
                _format_body(plan, result),
            )
            return
        self.db.record_snipe(
            auction_id=plan.auction.id,
            fired_at_utc=now,
            outcome="error",
            error=result.error,
        )
        self.db.set_status(plan.auction.id, "errored")
        self.notice_callback(
            f"[ebay-sniper] ERROR on {plan.auction.item_id}",
            _format_body(plan, result),
        )


def _format_body(plan: SnipePlan, result: BidResult) -> str:
    a = plan.auction
    lines = [
        f"Auction:    {a.title or a.item_id}",
        f"URL:        {a.url}",
        f"Item id:    {a.item_id}",
        f"Max bid:    {a.max_bid_cents / 100:.2f} {a.currency}",
        f"Lead time:  {a.lead_time_s}s",
        f"Bid at:     {plan.ebay_bid_at.isoformat()}",
        f"End at:     {plan.ebay_end_at.isoformat()}",
        f"Dry run:    {result.dry_run}",
        f"Result:     {'OK' if result.ok else 'FAIL'}",
    ]
    if result.error:
        lines.append(f"Error:      {result.error}")
    return "\n".join(lines)


def mark_collisions_in_db(db: Database, skipped: list[SnipePlan]) -> None:
    for s in skipped:
        db.set_status(s.auction.id, STATUS_SKIPPED_COLLISION)
