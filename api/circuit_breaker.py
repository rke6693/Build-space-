"""
OmniSight — Circuit Breaker
Prevents cascading failures when upstream platform APIs go down.
Three states: CLOSED (normal) -> OPEN (failing) -> HALF_OPEN (testing recovery).
"""

from __future__ import annotations

import asyncio
import enum
import time
from typing import Any, Callable, Optional

import structlog

from api.config import get_settings

logger = structlog.get_logger(__name__)


class CircuitState(str, enum.Enum):
    CLOSED = "closed"         # Normal operation
    OPEN = "open"             # Failing — reject calls immediately
    HALF_OPEN = "half_open"   # Testing recovery with limited calls


class CircuitOpenError(Exception):
    """Raised when the circuit breaker is open and rejecting calls."""

    def __init__(self, name: str, remaining_seconds: float):
        self.name = name
        self.remaining_seconds = remaining_seconds
        super().__init__(
            f"Circuit breaker '{name}' is OPEN. "
            f"Retry in {remaining_seconds:.1f}s."
        )


class CircuitBreaker:
    """
    Per-platform circuit breaker.

    - Tracks consecutive failures
    - Opens after `failure_threshold` failures → rejects all calls
    - After `recovery_timeout`, transitions to HALF_OPEN
    - In HALF_OPEN, allows `half_open_max_calls` test requests
    - If test requests succeed → CLOSED; if they fail → back to OPEN
    """

    def __init__(
        self,
        name: str,
        failure_threshold: Optional[int] = None,
        recovery_timeout: Optional[int] = None,
        half_open_max_calls: Optional[int] = None,
    ):
        settings = get_settings().circuit_breaker
        self.name = name
        self.failure_threshold = failure_threshold or settings.failure_threshold
        self.recovery_timeout = recovery_timeout or settings.recovery_timeout
        self.half_open_max_calls = half_open_max_calls or settings.half_open_max_calls

        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._last_failure_time: float = 0
        self._half_open_calls = 0
        self._lock = asyncio.Lock()

        # Metrics
        self._total_calls = 0
        self._total_failures = 0
        self._total_rejections = 0
        self._state_changes: list[tuple[float, CircuitState]] = []

    @property
    def state(self) -> CircuitState:
        if self._state == CircuitState.OPEN:
            # Check if recovery timeout has elapsed
            elapsed = time.monotonic() - self._last_failure_time
            if elapsed >= self.recovery_timeout:
                self._transition_to(CircuitState.HALF_OPEN)
        return self._state

    def _transition_to(self, new_state: CircuitState) -> None:
        old_state = self._state
        self._state = new_state
        self._state_changes.append((time.monotonic(), new_state))

        if new_state == CircuitState.HALF_OPEN:
            self._half_open_calls = 0
            self._success_count = 0

        if new_state == CircuitState.CLOSED:
            self._failure_count = 0

        logger.info(
            "circuit_breaker_transition",
            name=self.name,
            old_state=old_state.value,
            new_state=new_state.value,
        )

    async def __aenter__(self):
        await self._before_call()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            await self._on_failure(exc_val)
        else:
            await self._on_success()
        return False  # Don't suppress exceptions

    async def _before_call(self) -> None:
        """Check if the call is allowed."""
        async with self._lock:
            state = self.state
            self._total_calls += 1

            if state == CircuitState.OPEN:
                self._total_rejections += 1
                remaining = self.recovery_timeout - (time.monotonic() - self._last_failure_time)
                raise CircuitOpenError(self.name, max(0, remaining))

            if state == CircuitState.HALF_OPEN:
                if self._half_open_calls >= self.half_open_max_calls:
                    self._total_rejections += 1
                    raise CircuitOpenError(self.name, 5.0)
                self._half_open_calls += 1

    async def _on_success(self) -> None:
        """Record a successful call."""
        async with self._lock:
            if self._state == CircuitState.HALF_OPEN:
                self._success_count += 1
                if self._success_count >= self.half_open_max_calls:
                    self._transition_to(CircuitState.CLOSED)
            elif self._state == CircuitState.CLOSED:
                # Reset failure count on success
                self._failure_count = 0

    async def _on_failure(self, error: Optional[Exception] = None) -> None:
        """Record a failed call."""
        async with self._lock:
            self._total_failures += 1
            self._failure_count += 1
            self._last_failure_time = time.monotonic()

            if self._state == CircuitState.HALF_OPEN:
                # Any failure in half-open goes back to open
                self._transition_to(CircuitState.OPEN)
            elif self._state == CircuitState.CLOSED:
                if self._failure_count >= self.failure_threshold:
                    self._transition_to(CircuitState.OPEN)

            logger.warning(
                "circuit_breaker_failure",
                name=self.name,
                state=self._state.value,
                failure_count=self._failure_count,
                error=str(error)[:200] if error else None,
            )

    async def call(self, func: Callable, *args: Any, **kwargs: Any) -> Any:
        """Execute a function through the circuit breaker."""
        async with self:
            return await func(*args, **kwargs)

    @property
    def metrics(self) -> dict:
        return {
            "name": self.name,
            "state": self.state.value,
            "failure_count": self._failure_count,
            "total_calls": self._total_calls,
            "total_failures": self._total_failures,
            "total_rejections": self._total_rejections,
            "failure_rate": round(self._total_failures / max(self._total_calls, 1), 4),
        }


# ── Registry ───────────────────────────────────────────────────

_breakers: dict[str, CircuitBreaker] = {}


def get_breaker(name: str, **kwargs) -> CircuitBreaker:
    """Get or create a circuit breaker by name."""
    if name not in _breakers:
        _breakers[name] = CircuitBreaker(name, **kwargs)
    return _breakers[name]


def get_all_breaker_metrics() -> list[dict]:
    """Get metrics for all circuit breakers."""
    return [b.metrics for b in _breakers.values()]
