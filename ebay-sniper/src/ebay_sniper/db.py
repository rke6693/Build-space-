"""SQLite storage for watched auctions and snipe history."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

SCHEMA = """
CREATE TABLE IF NOT EXISTS auctions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id        TEXT    NOT NULL UNIQUE,
    host           TEXT    NOT NULL,
    url            TEXT    NOT NULL,
    title          TEXT,
    max_bid_cents  INTEGER NOT NULL,
    currency       TEXT    NOT NULL DEFAULT 'USD',
    lead_time_s    INTEGER NOT NULL,
    end_time_utc   TEXT,
    status         TEXT    NOT NULL DEFAULT 'watching',
    note           TEXT,
    created_at     TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auctions_status ON auctions(status);
CREATE INDEX IF NOT EXISTS idx_auctions_end ON auctions(end_time_utc);

CREATE TABLE IF NOT EXISTS snipes (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    auction_id        INTEGER NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
    fired_at_utc      TEXT    NOT NULL,
    final_price_cents INTEGER,
    outcome           TEXT    NOT NULL,
    error             TEXT,
    dry_run           INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_snipes_auction ON snipes(auction_id);

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);
"""


# Auction statuses
STATUS_WATCHING = "watching"
STATUS_SCHEDULED = "scheduled"
STATUS_SKIPPED_COLLISION = "skipped_collision"
STATUS_FIRED = "fired"
STATUS_WON = "won"
STATUS_LOST = "lost"
STATUS_ERRORED = "errored"
STATUS_ENDED = "ended"

# Snipe outcomes
OUTCOME_SUCCESS = "success"
OUTCOME_DRY_RUN = "dry_run"
OUTCOME_ERROR = "error"


@dataclass
class Auction:
    id: int
    item_id: str
    host: str
    url: str
    title: str | None
    max_bid_cents: int
    currency: str
    lead_time_s: int
    end_time_utc: datetime | None
    status: str
    note: str | None
    created_at: datetime


@dataclass
class Snipe:
    id: int
    auction_id: int
    fired_at_utc: datetime
    final_price_cents: int | None
    outcome: str
    error: str | None
    dry_run: bool


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value)


def _row_to_auction(row: sqlite3.Row) -> Auction:
    return Auction(
        id=row["id"],
        item_id=row["item_id"],
        host=row["host"],
        url=row["url"],
        title=row["title"],
        max_bid_cents=row["max_bid_cents"],
        currency=row["currency"],
        lead_time_s=row["lead_time_s"],
        end_time_utc=_parse_dt(row["end_time_utc"]),
        status=row["status"],
        note=row["note"],
        created_at=_parse_dt(row["created_at"]),  # type: ignore[arg-type]
    )


def _row_to_snipe(row: sqlite3.Row) -> Snipe:
    return Snipe(
        id=row["id"],
        auction_id=row["auction_id"],
        fired_at_utc=_parse_dt(row["fired_at_utc"]),  # type: ignore[arg-type]
        final_price_cents=row["final_price_cents"],
        outcome=row["outcome"],
        error=row["error"],
        dry_run=bool(row["dry_run"]),
    )


class Database:
    """Thin wrapper around sqlite3 with typed helpers."""

    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self.path, isolation_level=None)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._conn.executescript(SCHEMA)

    def close(self) -> None:
        self._conn.close()

    def __enter__(self) -> "Database":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # ---- auctions ----

    def add_auction(
        self,
        *,
        item_id: str,
        host: str,
        url: str,
        max_bid_cents: int,
        lead_time_s: int,
        currency: str = "USD",
        title: str | None = None,
        note: str | None = None,
    ) -> int:
        cur = self._conn.execute(
            """
            INSERT INTO auctions (item_id, host, url, title, max_bid_cents,
                                  currency, lead_time_s, status, note, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item_id,
                host,
                url,
                title,
                max_bid_cents,
                currency,
                lead_time_s,
                STATUS_WATCHING,
                note,
                _iso(datetime.now(timezone.utc)),
            ),
        )
        return int(cur.lastrowid)

    def remove_auction(self, auction_id: int) -> bool:
        cur = self._conn.execute("DELETE FROM auctions WHERE id = ?", (auction_id,))
        return cur.rowcount > 0

    def list_auctions(self, *, active_only: bool = False) -> list[Auction]:
        if active_only:
            rows = self._conn.execute(
                "SELECT * FROM auctions WHERE status IN (?, ?) ORDER BY end_time_utc ASC",
                (STATUS_WATCHING, STATUS_SCHEDULED),
            ).fetchall()
        else:
            rows = self._conn.execute(
                "SELECT * FROM auctions ORDER BY created_at DESC"
            ).fetchall()
        return [_row_to_auction(r) for r in rows]

    def get_auction(self, auction_id: int) -> Auction | None:
        row = self._conn.execute(
            "SELECT * FROM auctions WHERE id = ?", (auction_id,)
        ).fetchone()
        return _row_to_auction(row) if row else None

    def update_auction_end_and_title(
        self, auction_id: int, end_time_utc: datetime | None, title: str | None
    ) -> None:
        self._conn.execute(
            "UPDATE auctions SET end_time_utc = ?, title = COALESCE(?, title) WHERE id = ?",
            (_iso(end_time_utc), title, auction_id),
        )

    def set_status(self, auction_id: int, status: str) -> None:
        self._conn.execute(
            "UPDATE auctions SET status = ? WHERE id = ?", (status, auction_id)
        )

    # ---- snipes ----

    def record_snipe(
        self,
        *,
        auction_id: int,
        fired_at_utc: datetime,
        outcome: str,
        final_price_cents: int | None = None,
        error: str | None = None,
        dry_run: bool = False,
    ) -> int:
        cur = self._conn.execute(
            """
            INSERT INTO snipes (auction_id, fired_at_utc, final_price_cents,
                                outcome, error, dry_run)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                auction_id,
                _iso(fired_at_utc),
                final_price_cents,
                outcome,
                error,
                1 if dry_run else 0,
            ),
        )
        return int(cur.lastrowid)

    def list_snipes(self, *, auction_id: int | None = None) -> list[Snipe]:
        if auction_id is None:
            rows = self._conn.execute(
                "SELECT * FROM snipes ORDER BY fired_at_utc DESC"
            ).fetchall()
        else:
            rows = self._conn.execute(
                "SELECT * FROM snipes WHERE auction_id = ? ORDER BY fired_at_utc DESC",
                (auction_id,),
            ).fetchall()
        return [_row_to_snipe(r) for r in rows]

    # ---- meta ----

    def set_meta(self, key: str, value: str) -> None:
        self._conn.execute(
            "INSERT INTO meta (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )

    def get_meta(self, key: str) -> str | None:
        row = self._conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else None
