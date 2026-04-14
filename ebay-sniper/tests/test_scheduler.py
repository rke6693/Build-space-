"""Tests for the snipe planner / scheduler collision logic."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pytest

from ebay_sniper.db import (
    Auction,
    Database,
    STATUS_ENDED,
    STATUS_SKIPPED_COLLISION,
    STATUS_WATCHING,
)
from ebay_sniper.ebay_client import BidResult
from ebay_sniper.scheduler import (
    SniperRunner,
    SnipePlan,
    mark_collisions_in_db,
    plan_snipes,
)
from ebay_sniper.time_sync import ClockOffset


def _mk(
    *,
    id: int,
    item_id: str,
    end_time: datetime | None,
    lead: int = 6,
    max_cents: int = 1000,
) -> Auction:
    return Auction(
        id=id,
        item_id=item_id,
        host="www.ebay.com",
        url=f"https://www.ebay.com/itm/{item_id}",
        title=item_id,
        max_bid_cents=max_cents,
        currency="USD",
        lead_time_s=lead,
        end_time_utc=end_time,
        status=STATUS_WATCHING,
        note=None,
        created_at=datetime.now(timezone.utc),
    )


def test_plan_skips_past_and_missing_end() -> None:
    now = datetime(2026, 4, 14, 12, 0, 0, tzinfo=timezone.utc)
    past = _mk(id=1, item_id="a", end_time=now - timedelta(seconds=1))
    missing = _mk(id=2, item_id="b", end_time=None)
    future = _mk(id=3, item_id="c", end_time=now + timedelta(minutes=10))

    result = plan_snipes([past, missing, future], now_ebay=now)
    assert [p.auction.id for p in result.plans] == [3]
    assert result.skipped == []


def test_plan_no_collisions_when_spaced_out() -> None:
    now = datetime(2026, 4, 14, 12, 0, 0, tzinfo=timezone.utc)
    a = _mk(id=1, item_id="a", end_time=now + timedelta(minutes=5), lead=6)
    b = _mk(id=2, item_id="b", end_time=now + timedelta(minutes=10), lead=6)
    result = plan_snipes([a, b], now_ebay=now)
    assert [p.auction.id for p in result.plans] == [1, 2]
    assert result.skipped == []


def test_plan_detects_collision_within_lead_time() -> None:
    now = datetime(2026, 4, 14, 12, 0, 0, tzinfo=timezone.utc)
    # a ends at now+60s, bid at now+54s, window [now+54, now+60]
    # b ends at now+62s, bid at now+56s, window [now+56, now+62]
    # -> b.bid_at (now+56) is inside a.window, so collision.
    a = _mk(id=1, item_id="a", end_time=now + timedelta(seconds=60), lead=6)
    b = _mk(id=2, item_id="b", end_time=now + timedelta(seconds=62), lead=6)
    result = plan_snipes([a, b], now_ebay=now)
    assert [p.auction.id for p in result.plans] == [1]
    assert [p.auction.id for p in result.skipped] == [2]
    assert result.skipped[0].collided_with == 1


def test_plan_sorts_by_bid_at() -> None:
    now = datetime(2026, 4, 14, 12, 0, 0, tzinfo=timezone.utc)
    late = _mk(id=1, item_id="late", end_time=now + timedelta(minutes=30))
    early = _mk(id=2, item_id="early", end_time=now + timedelta(minutes=1))
    result = plan_snipes([late, early], now_ebay=now)
    assert [p.auction.id for p in result.plans] == [2, 1]


def test_mark_collisions_in_db_sets_status(tmp_path: Path) -> None:
    db = Database(tmp_path / "t.db")
    aid1 = db.add_auction(
        item_id="1", host="h", url="u", max_bid_cents=1, lead_time_s=6
    )
    aid2 = db.add_auction(
        item_id="2", host="h", url="u", max_bid_cents=1, lead_time_s=6
    )
    future = datetime.now(timezone.utc) + timedelta(minutes=5)
    a1 = db.get_auction(aid1)
    a2 = db.get_auction(aid2)
    assert a1 and a2
    skipped = [
        SnipePlan(auction=a2, ebay_bid_at=future, ebay_end_at=future, collided_with=aid1)
    ]
    mark_collisions_in_db(db, skipped)
    refreshed = db.get_auction(aid2)
    assert refreshed is not None
    assert refreshed.status == STATUS_SKIPPED_COLLISION
    db.close()


class _StubBid:
    """Callable that returns a queued sequence of BidResults."""

    def __init__(self, results: list[BidResult]) -> None:
        self._results = list(results)
        self.calls: list[tuple[int, bool]] = []

    async def __call__(self, plan: SnipePlan, is_dry: bool) -> BidResult:
        self.calls.append((plan.auction.id, is_dry))
        return self._results.pop(0)


async def _run_single(tmp_path: Path, results: list[BidResult], *, dry_run: bool = False) -> tuple[Database, _StubBid, list[tuple[str, str]]]:
    db = Database(tmp_path / "runner.db")
    aid = db.add_auction(
        item_id="999",
        host="www.ebay.com",
        url="https://www.ebay.com/itm/999",
        max_bid_cents=4200,
        lead_time_s=6,
    )
    # end_time is a few ms in the past so the runner fires immediately.
    past = datetime.now(timezone.utc) - timedelta(milliseconds=10)
    db.update_auction_end_and_title(aid, past + timedelta(seconds=6), None)
    a = db.get_auction(aid)
    assert a is not None

    plan = SnipePlan(auction=a, ebay_bid_at=past, ebay_end_at=past + timedelta(seconds=6))
    clock = ClockOffset()

    stub = _StubBid(results)
    notices: list[tuple[str, str]] = []

    def notice(subject: str, body: str) -> None:
        notices.append((subject, body))

    runner = SniperRunner(
        db=db,
        clock=clock,
        bid_callback=stub,
        notice_callback=notice,
        dry_run=dry_run,
        retry_delay_s=0,
    )
    await runner.run([plan])
    return db, stub, notices


@pytest.mark.asyncio
async def test_runner_success_records_and_notifies(tmp_path: Path) -> None:
    db, stub, notices = await _run_single(
        tmp_path,
        [BidResult(ok=True, dry_run=False, final_price_cents=4200, error=None)],
    )
    assert len(stub.calls) == 1
    snipes = db.list_snipes()
    assert len(snipes) == 1
    assert snipes[0].outcome == "success"
    assert snipes[0].final_price_cents == 4200
    assert notices and "placed" in notices[0][0].lower()
    db.close()


@pytest.mark.asyncio
async def test_runner_retries_once_on_failure(tmp_path: Path) -> None:
    db, stub, notices = await _run_single(
        tmp_path,
        [
            BidResult(ok=False, dry_run=False, final_price_cents=None, error="boom"),
            BidResult(ok=True, dry_run=False, final_price_cents=4200, error=None),
        ],
    )
    assert len(stub.calls) == 2
    snipes = db.list_snipes()
    assert len(snipes) == 1
    assert snipes[0].outcome == "success"
    db.close()


@pytest.mark.asyncio
async def test_runner_both_failures_record_error(tmp_path: Path) -> None:
    db, stub, notices = await _run_single(
        tmp_path,
        [
            BidResult(ok=False, dry_run=False, final_price_cents=None, error="boom1"),
            BidResult(ok=False, dry_run=False, final_price_cents=None, error="boom2"),
        ],
    )
    assert len(stub.calls) == 2
    snipes = db.list_snipes()
    assert len(snipes) == 1
    assert snipes[0].outcome == "error"
    assert snipes[0].error == "boom2"
    assert notices and "error" in notices[0][0].lower()
    db.close()


@pytest.mark.asyncio
async def test_runner_dry_run_records_dry_run(tmp_path: Path) -> None:
    db, stub, notices = await _run_single(
        tmp_path,
        [BidResult(ok=True, dry_run=True, final_price_cents=4200, error=None)],
        dry_run=True,
    )
    assert stub.calls == [(1, True)]
    snipes = db.list_snipes()
    assert len(snipes) == 1
    assert snipes[0].outcome == "dry_run"
    assert snipes[0].dry_run is True
    db.close()
