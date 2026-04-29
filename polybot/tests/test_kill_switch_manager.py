"""KillSwitchManager: aggregation, registration rules, and protocol conformance."""

from __future__ import annotations

from pathlib import Path

import pytest

from polybot.clock import FakeClock
from polybot.safety import (
    DrawdownGuard,
    FileKillSwitch,
    HeartbeatGuard,
    KillSwitch,
    KillSwitchManager,
)


class _StubSwitch:
    def __init__(self, name: str, tripped: bool = False, reason: str | None = None) -> None:
        self.name = name
        self._tripped = tripped
        self._reason = reason

    @property
    def tripped(self) -> bool:
        return self._tripped

    def reason(self) -> str | None:
        return self._reason if self._tripped else None

    def set(self, tripped: bool, reason: str | None = None) -> None:
        self._tripped = tripped
        self._reason = reason


def test_stub_satisfies_protocol() -> None:
    sw: KillSwitch = _StubSwitch("x")
    assert isinstance(sw, KillSwitch)


def test_empty_manager_does_not_halt() -> None:
    m = KillSwitchManager()
    assert m.should_halt() is False
    assert m.tripped() == []


def test_halts_if_any_switch_tripped() -> None:
    a = _StubSwitch("a")
    b = _StubSwitch("b", tripped=True, reason="boom")
    c = _StubSwitch("c")
    m = KillSwitchManager([a, b, c])
    assert m.should_halt() is True
    statuses = m.tripped()
    assert len(statuses) == 1
    assert statuses[0].name == "b"
    assert statuses[0].reason == "boom"


def test_reports_all_tripped_in_registration_order() -> None:
    a = _StubSwitch("a", tripped=True, reason="r_a")
    b = _StubSwitch("b", tripped=True, reason="r_b")
    m = KillSwitchManager([b, a])  # registered b first
    names = [t.name for t in m.tripped()]
    assert names == ["b", "a"]


def test_register_rejects_duplicate_names() -> None:
    m = KillSwitchManager([_StubSwitch("dup")])
    with pytest.raises(ValueError, match="duplicate"):
        m.register(_StubSwitch("dup"))


def test_register_rejects_blank_name() -> None:
    m = KillSwitchManager()
    with pytest.raises(ValueError):
        m.register(_StubSwitch(""))


def test_dynamic_state_changes_visible_to_manager() -> None:
    a = _StubSwitch("a")
    m = KillSwitchManager([a])
    assert m.should_halt() is False
    a.set(True, "now")
    assert m.should_halt() is True


def test_integration_all_three_switches(tmp_path: Path) -> None:
    """File + drawdown + heartbeat together — the production composition."""
    halt = tmp_path / "HALT"
    clock = FakeClock()
    file_sw = FileKillSwitch(halt)
    dd = DrawdownGuard(threshold_pct=-0.05)
    hb = HeartbeatGuard(timeout_s=10.0, clock=clock)
    hb.register("claude_loop")

    m = KillSwitchManager([file_sw, dd, hb])
    assert m.should_halt() is False

    halt.touch()
    assert m.should_halt() is True
    assert {t.name for t in m.tripped()} == {"halt_file"}
    halt.unlink()
    assert m.should_halt() is False

    dd.update(realized_pnl_24h=-1_000.0, nav=10_000.0)
    assert m.should_halt() is True
    assert {t.name for t in m.tripped()} == {"drawdown_24h"}
    dd.reset()
    assert m.should_halt() is False

    clock.advance(11.0)
    assert m.should_halt() is True
    assert {t.name for t in m.tripped()} == {"heartbeat"}
    hb.beat("claude_loop")
    assert m.should_halt() is False


def test_switches_property_returns_tuple() -> None:
    a = _StubSwitch("a")
    m = KillSwitchManager([a])
    assert m.switches == (a,)
    assert isinstance(m.switches, tuple)
