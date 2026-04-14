"""Tests for the SQLite db layer."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from ebay_sniper.db import Database, STATUS_ENDED, STATUS_WATCHING


@pytest.fixture()
def db(tmp_path: Path) -> Database:
    return Database(tmp_path / "sniper.db")


def test_add_and_list_auction(db: Database) -> None:
    auction_id = db.add_auction(
        item_id="123456789012",
        host="www.ebay.com",
        url="https://www.ebay.com/itm/123456789012",
        max_bid_cents=4250,
        lead_time_s=6,
        note="test",
    )
    assert auction_id > 0

    auctions = db.list_auctions()
    assert len(auctions) == 1
    a = auctions[0]
    assert a.item_id == "123456789012"
    assert a.max_bid_cents == 4250
    assert a.lead_time_s == 6
    assert a.status == STATUS_WATCHING


def test_unique_item_id(db: Database) -> None:
    db.add_auction(
        item_id="111",
        host="www.ebay.com",
        url="x",
        max_bid_cents=100,
        lead_time_s=6,
    )
    with pytest.raises(Exception):
        db.add_auction(
            item_id="111",
            host="www.ebay.com",
            url="x",
            max_bid_cents=100,
            lead_time_s=6,
        )


def test_update_end_and_title(db: Database) -> None:
    aid = db.add_auction(
        item_id="222",
        host="www.ebay.com",
        url="x",
        max_bid_cents=100,
        lead_time_s=6,
    )
    end = datetime.now(timezone.utc) + timedelta(hours=1)
    db.update_auction_end_and_title(aid, end, "Widget")

    a = db.get_auction(aid)
    assert a is not None
    assert a.title == "Widget"
    assert a.end_time_utc is not None
    assert abs((a.end_time_utc - end).total_seconds()) < 1


def test_record_snipe_and_list(db: Database) -> None:
    aid = db.add_auction(
        item_id="333",
        host="www.ebay.com",
        url="x",
        max_bid_cents=500,
        lead_time_s=6,
    )
    now = datetime.now(timezone.utc)
    db.record_snipe(
        auction_id=aid,
        fired_at_utc=now,
        outcome="success",
        final_price_cents=500,
    )
    db.record_snipe(
        auction_id=aid,
        fired_at_utc=now,
        outcome="dry_run",
        final_price_cents=500,
        dry_run=True,
    )
    snipes = db.list_snipes(auction_id=aid)
    assert len(snipes) == 2
    assert {s.outcome for s in snipes} == {"success", "dry_run"}
    assert any(s.dry_run for s in snipes)


def test_remove_auction_cascades_snipes(db: Database) -> None:
    aid = db.add_auction(
        item_id="444",
        host="www.ebay.com",
        url="x",
        max_bid_cents=100,
        lead_time_s=6,
    )
    db.record_snipe(
        auction_id=aid,
        fired_at_utc=datetime.now(timezone.utc),
        outcome="success",
    )
    assert db.remove_auction(aid) is True
    assert db.list_snipes() == []


def test_active_only_filter(db: Database) -> None:
    aid1 = db.add_auction(
        item_id="555", host="www.ebay.com", url="x",
        max_bid_cents=100, lead_time_s=6,
    )
    aid2 = db.add_auction(
        item_id="666", host="www.ebay.com", url="x",
        max_bid_cents=100, lead_time_s=6,
    )
    db.set_status(aid2, STATUS_ENDED)
    active = db.list_auctions(active_only=True)
    assert [a.id for a in active] == [aid1]
