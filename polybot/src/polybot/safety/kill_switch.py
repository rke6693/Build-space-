"""KillSwitch protocol and the manager that aggregates them."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Protocol, runtime_checkable


@runtime_checkable
class KillSwitch(Protocol):
    """A binary halt signal.

    Implementations must be cheap to poll: callers may check on every order
    intent. tripped reads must not perform network I/O.
    """

    name: str

    @property
    def tripped(self) -> bool: ...

    def reason(self) -> str | None: ...


@dataclass(frozen=True)
class TripStatus:
    name: str
    reason: str


class KillSwitchManager:
    """Aggregates kill switches. Any tripped switch halts new orders.

    The manager itself holds no state — it only fans out to its switches —
    so it is safe to share across threads as long as the underlying switches
    are. Tripped order is the registration order, which keeps logs stable.
    """

    def __init__(self, switches: Iterable[KillSwitch] = ()) -> None:
        self._switches: list[KillSwitch] = []
        for s in switches:
            self.register(s)

    def register(self, switch: KillSwitch) -> None:
        if not getattr(switch, "name", None):
            raise ValueError("KillSwitch requires a non-empty name")
        if any(existing.name == switch.name for existing in self._switches):
            raise ValueError(f"duplicate kill switch name: {switch.name!r}")
        self._switches.append(switch)

    @property
    def switches(self) -> tuple[KillSwitch, ...]:
        return tuple(self._switches)

    def should_halt(self) -> bool:
        return any(s.tripped for s in self._switches)

    def tripped(self) -> list[TripStatus]:
        out: list[TripStatus] = []
        for s in self._switches:
            if s.tripped:
                out.append(TripStatus(name=s.name, reason=s.reason() or ""))
        return out
