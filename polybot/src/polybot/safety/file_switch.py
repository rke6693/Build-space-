"""File-based manual kill switch.

Operators trip this from outside the bot process — touch the HALT file and
the next pre-trade check refuses new orders. Default detection latency is
bounded by how often callers poll the manager; the prompt requires < 1s, so
order paths must consult should_halt() on every intent.
"""

from __future__ import annotations

from pathlib import Path


class FileKillSwitch:
    """Tripped while the configured path exists on disk.

    Default path: /var/run/polybot/HALT (per the prompt). Override for tests
    or non-standard deployments. Removing the file un-trips the switch on
    the next read; this is intentional — operator removes file = resume.
    """

    DEFAULT_PATH = Path("/var/run/polybot/HALT")

    def __init__(self, path: str | Path | None = None, name: str = "halt_file") -> None:
        self.path = Path(path) if path is not None else self.DEFAULT_PATH
        self.name = name

    @property
    def tripped(self) -> bool:
        try:
            return self.path.is_file()
        except OSError:
            # Treat unreadable parent dirs as "we can't be sure" → fail closed.
            return True

    def reason(self) -> str | None:
        return f"halt file present at {self.path}" if self.tripped else None
