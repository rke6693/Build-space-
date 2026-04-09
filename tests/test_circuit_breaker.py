"""
Tests for the circuit breaker implementation.
"""

import asyncio

import pytest

from api.circuit_breaker import CircuitBreaker, CircuitOpenError, CircuitState


class TestCircuitBreaker:
    """Test circuit breaker state machine."""

    @pytest.mark.asyncio
    async def test_starts_closed(self):
        cb = CircuitBreaker("test", failure_threshold=3, recovery_timeout=1)
        assert cb.state == CircuitState.CLOSED

    @pytest.mark.asyncio
    async def test_opens_after_threshold_failures(self):
        cb = CircuitBreaker("test", failure_threshold=3, recovery_timeout=10)

        for _ in range(3):
            try:
                async with cb:
                    raise ConnectionError("simulated failure")
            except ConnectionError:
                pass

        assert cb.state == CircuitState.OPEN

    @pytest.mark.asyncio
    async def test_rejects_calls_when_open(self):
        cb = CircuitBreaker("test", failure_threshold=1, recovery_timeout=60)

        try:
            async with cb:
                raise ConnectionError("fail")
        except ConnectionError:
            pass

        with pytest.raises(CircuitOpenError):
            async with cb:
                pass  # Should never reach here

    @pytest.mark.asyncio
    async def test_transitions_to_half_open_after_timeout(self):
        cb = CircuitBreaker("test", failure_threshold=1, recovery_timeout=0)  # 0 = immediate

        try:
            async with cb:
                raise ConnectionError("fail")
        except ConnectionError:
            pass

        assert cb.state == CircuitState.OPEN

        # Wait for recovery timeout
        await asyncio.sleep(0.1)
        assert cb.state == CircuitState.HALF_OPEN

    @pytest.mark.asyncio
    async def test_closes_after_successful_half_open(self):
        cb = CircuitBreaker("test", failure_threshold=1, recovery_timeout=0, half_open_max_calls=1)

        # Open the circuit
        try:
            async with cb:
                raise ConnectionError("fail")
        except ConnectionError:
            pass

        await asyncio.sleep(0.1)
        assert cb.state == CircuitState.HALF_OPEN

        # Successful call in half-open
        async with cb:
            pass

        assert cb.state == CircuitState.CLOSED

    @pytest.mark.asyncio
    async def test_reopens_on_half_open_failure(self):
        cb = CircuitBreaker("test", failure_threshold=1, recovery_timeout=0, half_open_max_calls=2)

        # Open the circuit
        try:
            async with cb:
                raise ConnectionError("fail")
        except ConnectionError:
            pass

        await asyncio.sleep(0.1)

        # Fail in half-open
        try:
            async with cb:
                raise ConnectionError("still failing")
        except ConnectionError:
            pass

        assert cb.state == CircuitState.OPEN

    @pytest.mark.asyncio
    async def test_resets_failure_count_on_success(self):
        cb = CircuitBreaker("test", failure_threshold=3, recovery_timeout=10)

        # Two failures
        for _ in range(2):
            try:
                async with cb:
                    raise ConnectionError("fail")
            except ConnectionError:
                pass

        assert cb._failure_count == 2

        # Success resets
        async with cb:
            pass

        assert cb._failure_count == 0

    @pytest.mark.asyncio
    async def test_metrics_tracking(self):
        cb = CircuitBreaker("test-metrics", failure_threshold=5, recovery_timeout=60)

        # 3 successes, 2 failures
        for _ in range(3):
            async with cb:
                pass

        for _ in range(2):
            try:
                async with cb:
                    raise ValueError("err")
            except ValueError:
                pass

        metrics = cb.metrics
        assert metrics["total_calls"] == 5
        assert metrics["total_failures"] == 2
        assert metrics["name"] == "test-metrics"

    @pytest.mark.asyncio
    async def test_call_helper_method(self):
        cb = CircuitBreaker("test", failure_threshold=5, recovery_timeout=60)

        async def my_func(x: int) -> int:
            return x * 2

        result = await cb.call(my_func, 21)
        assert result == 42
