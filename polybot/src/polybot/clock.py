"""Injectable monotonic clock for testability.

Heartbeat staleness must use a monotonic source, not wall-clock, so a system
NTP correction or DST shift cannot accidentally trip — or untrip — the guard.
"""

from __future__ import annotations

import time
from typing import Protocol


class Clock(Protocol):
    def monotonic(self) -> float: ...


class SystemClock:
    def monotonic(self) -> float:
        return time.monotonic()


class FakeClock:
    """Deterministic clock for tests. Time only advances when advance() is called."""

    def __init__(self, start: float = 0.0) -> None:
        self._t = float(start)

    def monotonic(self) -> float:
        return self._t

    def advance(self, seconds: float) -> None:
        if seconds < 0:
            raise ValueError("FakeClock cannot move backwards")
        self._t += float(seconds)
