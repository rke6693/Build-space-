"""HeartbeatGuard behavior, with an injected FakeClock."""

from __future__ import annotations

import pytest

from polybot.clock import FakeClock
from polybot.safety import HeartbeatGuard


def test_fresh_after_register() -> None:
    clock = FakeClock()
    g = HeartbeatGuard(timeout_s=10.0, clock=clock)
    g.register("claude_loop")
    assert g.tripped is False
    assert g.reason() is None


def test_trips_when_silent_past_timeout() -> None:
    clock = FakeClock()
    g = HeartbeatGuard(timeout_s=10.0, clock=clock)
    g.register("clob_ws")
    clock.advance(10.5)
    assert g.tripped is True
    assert "clob_ws" in g.reason()


def test_does_not_trip_at_exactly_timeout() -> None:
    """Must be strictly past the timeout."""
    clock = FakeClock()
    g = HeartbeatGuard(timeout_s=10.0, clock=clock)
    g.register("claude_loop")
    clock.advance(10.0)
    assert g.tripped is False


def test_beat_resets_freshness() -> None:
    clock = FakeClock()
    g = HeartbeatGuard(timeout_s=10.0, clock=clock)
    g.register("claude_loop")
    clock.advance(9.0)
    g.beat("claude_loop")
    clock.advance(9.0)
    assert g.tripped is False


def test_recovery_un_trips_automatically() -> None:
    """Heartbeat guard is not latched — resumed beats clear the trip."""
    clock = FakeClock()
    g = HeartbeatGuard(timeout_s=5.0, clock=clock)
    g.register("clob_ws")
    clock.advance(10.0)
    assert g.tripped is True
    g.beat("clob_ws")
    assert g.tripped is False


def test_per_source_timeout_overrides_default() -> None:
    clock = FakeClock()
    g = HeartbeatGuard(timeout_s=10.0, clock=clock)
    g.register("claude_loop", timeout_s=60.0)
    g.register("clob_ws")  # default 10s
    clock.advance(15.0)
    stale = g.stale()
    assert "clob_ws" in stale
    assert "claude_loop" not in stale


def test_multiple_stale_sources_listed() -> None:
    clock = FakeClock()
    g = HeartbeatGuard(timeout_s=5.0, clock=clock)
    g.register("a")
    g.register("b")
    clock.advance(6.0)
    reason = g.reason()
    assert reason is not None
    assert "a" in reason and "b" in reason


def test_unregistered_beat_auto_registers() -> None:
    clock = FakeClock()
    g = HeartbeatGuard(timeout_s=5.0, clock=clock)
    g.beat("late_starter")
    clock.advance(10.0)
    assert g.tripped is True


def test_invalid_timeout_rejected() -> None:
    with pytest.raises(ValueError):
        HeartbeatGuard(timeout_s=0)
    with pytest.raises(ValueError):
        HeartbeatGuard(timeout_s=-1)


def test_empty_source_rejected() -> None:
    g = HeartbeatGuard(timeout_s=5.0, clock=FakeClock())
    with pytest.raises(ValueError):
        g.register("")


def test_fake_clock_rejects_backwards_movement() -> None:
    clock = FakeClock()
    with pytest.raises(ValueError):
        clock.advance(-1.0)
