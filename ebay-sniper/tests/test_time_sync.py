"""Tests for time_sync."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from ebay_sniper.time_sync import ClockOffset, compute_offset


def test_compute_offset_basic() -> None:
    server = datetime(2026, 4, 14, 12, 0, 5, tzinfo=timezone.utc)
    local = datetime(2026, 4, 14, 12, 0, 0, tzinfo=timezone.utc)
    offset = compute_offset(server, local)
    assert offset == timedelta(seconds=5)


def test_compute_offset_accepts_naive_as_utc() -> None:
    server = datetime(2026, 4, 14, 12, 0, 0)
    local = datetime(2026, 4, 14, 11, 59, 57)
    offset = compute_offset(server, local)
    assert offset == timedelta(seconds=3)


def test_clock_offset_ebay_now_applies_offset() -> None:
    clock = ClockOffset(offset=timedelta(seconds=10))
    delta = (clock.ebay_now() - datetime.now(timezone.utc)).total_seconds()
    # Allow a small slop for the two now() calls straddling this assertion.
    assert 9.0 <= delta <= 11.0


def test_local_time_for_ebay_inverts_offset() -> None:
    clock = ClockOffset(offset=timedelta(seconds=5))
    ebay_target = datetime(2026, 4, 14, 18, 0, 0, tzinfo=timezone.utc)
    local = clock.local_time_for_ebay(ebay_target)
    assert local == ebay_target - timedelta(seconds=5)


def test_local_time_for_ebay_normalizes_naive() -> None:
    clock = ClockOffset(offset=timedelta(seconds=-2))
    ebay_target = datetime(2026, 4, 14, 18, 0, 0)
    local = clock.local_time_for_ebay(ebay_target)
    assert local == datetime(2026, 4, 14, 18, 0, 2, tzinfo=timezone.utc)
