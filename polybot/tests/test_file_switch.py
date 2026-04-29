"""FileKillSwitch behavior."""

from __future__ import annotations

from pathlib import Path

import pytest

from polybot.safety import FileKillSwitch


def test_untripped_when_file_absent(tmp_path: Path) -> None:
    sw = FileKillSwitch(tmp_path / "HALT")
    assert sw.tripped is False
    assert sw.reason() is None


def test_tripped_when_file_present(tmp_path: Path) -> None:
    halt = tmp_path / "HALT"
    halt.touch()
    sw = FileKillSwitch(halt)
    assert sw.tripped is True
    assert sw.reason() is not None
    assert str(halt) in sw.reason()


def test_round_trip_un_trips(tmp_path: Path) -> None:
    halt = tmp_path / "HALT"
    sw = FileKillSwitch(halt)
    assert sw.tripped is False
    halt.touch()
    assert sw.tripped is True
    halt.unlink()
    assert sw.tripped is False


def test_directory_at_path_does_not_trip(tmp_path: Path) -> None:
    """Defensive: only a regular file should trip — a leftover dir of the same
    name is operator error, not an intentional halt."""
    p = tmp_path / "HALT"
    p.mkdir()
    sw = FileKillSwitch(p)
    assert sw.tripped is False


def test_default_path_used_when_omitted() -> None:
    sw = FileKillSwitch()
    assert sw.path == FileKillSwitch.DEFAULT_PATH


def test_custom_name_propagates(tmp_path: Path) -> None:
    sw = FileKillSwitch(tmp_path / "HALT", name="manual_halt")
    assert sw.name == "manual_halt"


def test_unreadable_path_fails_closed(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """If the FS check raises, treat as tripped — fail-closed for safety."""
    sw = FileKillSwitch(tmp_path / "HALT")

    def boom(self: Path) -> bool:
        raise OSError("permission denied")

    monkeypatch.setattr(Path, "is_file", boom)
    assert sw.tripped is True
