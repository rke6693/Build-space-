"""Heartbeat watchdog.

Each long-running input (Claude analysis loop, CLOB websocket, …) calls
beat(source) on every successful tick. If any registered source is silent
for longer than its timeout the guard trips, halting new orders until the
source resumes.

Unlike the drawdown guard, this is not latched — once a heartbeat resumes
the guard automatically un-trips. A silent source that comes back is
recovery, not a policy decision.
"""

from __future__ import annotations

from collections.abc import Mapping

from polybot.clock import Clock, SystemClock


class HeartbeatGuard:
    def __init__(
        self,
        timeout_s: float,
        clock: Clock | None = None,
        name: str = "heartbeat",
    ) -> None:
        if timeout_s <= 0:
            raise ValueError(f"timeout_s must be positive, got {timeout_s}")
        self.name = name
        self.default_timeout_s = float(timeout_s)
        self._clock: Clock = clock or SystemClock()
        self._last: dict[str, float] = {}
        self._timeouts: dict[str, float] = {}

    def register(self, source: str, timeout_s: float | None = None) -> None:
        """Begin watching source. Without an initial beat, source is considered fresh."""
        if not source:
            raise ValueError("source must be a non-empty string")
        now = self._clock.monotonic()
        self._last[source] = now
        self._timeouts[source] = float(timeout_s) if timeout_s is not None else self.default_timeout_s

    def beat(self, source: str) -> None:
        """Record a tick. Auto-registers an unknown source with the default timeout."""
        if source not in self._timeouts:
            self._timeouts[source] = self.default_timeout_s
        self._last[source] = self._clock.monotonic()

    def stale(self) -> Mapping[str, float]:
        """Map of source -> seconds-since-last-beat for sources past their timeout."""
        now = self._clock.monotonic()
        out: dict[str, float] = {}
        for source, last in self._last.items():
            age = now - last
            if age > self._timeouts[source]:
                out[source] = age
        return out

    @property
    def tripped(self) -> bool:
        return bool(self.stale())

    def reason(self) -> str | None:
        stale = self.stale()
        if not stale:
            return None
        parts = ", ".join(
            f"{src} silent {age:.1f}s (>{self._timeouts[src]:.1f}s)"
            for src, age in sorted(stale.items())
        )
        return f"stale heartbeats: {parts}"
