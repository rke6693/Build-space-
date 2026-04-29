"""DrawdownGuard behavior."""

from __future__ import annotations

import pytest

from polybot.safety import DrawdownGuard


def test_untripped_at_construction() -> None:
    g = DrawdownGuard(threshold_pct=-0.05)
    assert g.tripped is False
    assert g.reason() is None
    assert g.last_ratio is None


def test_does_not_trip_above_threshold() -> None:
    g = DrawdownGuard(threshold_pct=-0.05)
    g.update(realized_pnl_24h=-100.0, nav=10_000.0)  # -1.00%
    assert g.tripped is False
    assert g.last_ratio == pytest.approx(-0.01)


def test_trips_at_exact_threshold() -> None:
    g = DrawdownGuard(threshold_pct=-0.05)
    g.update(realized_pnl_24h=-500.0, nav=10_000.0)  # exactly -5.00%
    assert g.tripped is True
    assert g.reason() is not None


def test_trips_below_threshold() -> None:
    g = DrawdownGuard(threshold_pct=-0.05)
    g.update(realized_pnl_24h=-600.0, nav=10_000.0)
    assert g.tripped is True
    assert "-6" in g.reason()


def test_latches_until_reset() -> None:
    g = DrawdownGuard(threshold_pct=-0.05)
    g.update(realized_pnl_24h=-1_000.0, nav=10_000.0)
    assert g.tripped is True
    g.update(realized_pnl_24h=+5_000.0, nav=10_000.0)  # PnL recovers...
    assert g.tripped is True  # ...but the latch holds
    g.reset()
    assert g.tripped is False
    assert g.reason() is None


def test_zero_or_negative_nav_is_noop() -> None:
    g = DrawdownGuard(threshold_pct=-0.05)
    g.update(realized_pnl_24h=-1_000.0, nav=0.0)
    assert g.tripped is False
    g.update(realized_pnl_24h=-1_000.0, nav=-100.0)
    assert g.tripped is False


def test_positive_threshold_rejected() -> None:
    with pytest.raises(ValueError):
        DrawdownGuard(threshold_pct=0.05)
    with pytest.raises(ValueError):
        DrawdownGuard(threshold_pct=0.0)


def test_default_threshold_is_minus_five_pct() -> None:
    g = DrawdownGuard()
    g.update(realized_pnl_24h=-499.0, nav=10_000.0)
    assert g.tripped is False
    g.update(realized_pnl_24h=-501.0, nav=10_000.0)
    assert g.tripped is True
