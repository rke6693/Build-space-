"""
Tests for configuration management.
"""

import pytest

from api.config import Settings, get_settings


class TestConfig:
    """Test configuration loading and validation."""

    def test_default_settings(self):
        s = Settings()
        assert s.host == "0.0.0.0"
        assert s.port == 8000
        assert s.env == "development"
        assert s.db.pool_size == 20

    def test_is_production(self):
        s = Settings(env="production")
        assert s.is_production is True
        assert s.is_development is False

    def test_is_development(self):
        s = Settings()
        assert s.is_development is True

    def test_redis_defaults(self):
        s = Settings()
        assert s.redis.max_connections == 50
        assert s.redis.market_ttl == 10

    def test_circuit_breaker_defaults(self):
        s = Settings()
        assert s.circuit_breaker.failure_threshold == 5
        assert s.circuit_breaker.recovery_timeout == 30

    def test_worker_defaults(self):
        s = Settings()
        assert s.worker.ingest_interval == 10.0
        assert s.worker.max_concurrent_fetches == 10

    def test_get_settings_cached(self):
        s1 = get_settings()
        s2 = get_settings()
        assert s1 is s2
