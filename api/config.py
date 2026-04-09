"""
OmniSight — Configuration Management
Pydantic Settings with validation, environment parsing, and sensible defaults.
All config flows through here — no raw os.getenv() anywhere else.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings


class DatabaseSettings(BaseSettings):
    url: str = Field(
        default="postgresql+asyncpg://omnisight:omnisight@localhost:5432/omnisight",
        alias="DATABASE_URL",
    )
    pool_size: int = Field(default=20, alias="DB_POOL_SIZE")
    max_overflow: int = Field(default=10, alias="DB_MAX_OVERFLOW")
    pool_timeout: int = Field(default=30, alias="DB_POOL_TIMEOUT")
    pool_recycle: int = Field(default=1800, alias="DB_POOL_RECYCLE")
    echo: bool = Field(default=False, alias="DB_ECHO")

    model_config = {"env_prefix": "", "extra": "ignore"}


class RedisSettings(BaseSettings):
    url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")
    max_connections: int = Field(default=50, alias="REDIS_MAX_CONNECTIONS")
    socket_timeout: float = Field(default=5.0, alias="REDIS_SOCKET_TIMEOUT")
    decode_responses: bool = True

    # Cache TTLs in seconds
    market_ttl: int = Field(default=10, description="Market data cache TTL")
    order_book_ttl: int = Field(default=2, description="Order book cache TTL")
    odds_ttl: int = Field(default=15, description="Normalized odds cache TTL")
    whale_ttl: int = Field(default=30, description="Whale alerts cache TTL")
    microstructure_ttl: int = Field(default=5, description="Microstructure cache TTL")

    model_config = {"env_prefix": "", "extra": "ignore"}


class PlatformCredentials(BaseSettings):
    polymarket_api_key: Optional[str] = Field(default=None, alias="POLYMARKET_API_KEY")
    polymarket_api_secret: Optional[str] = Field(default=None, alias="POLYMARKET_API_SECRET")
    kalshi_api_key: Optional[str] = Field(default=None, alias="KALSHI_API_KEY")
    kalshi_api_secret: Optional[str] = Field(default=None, alias="KALSHI_API_SECRET")
    pinnacle_api_key: Optional[str] = Field(default=None, alias="PINNACLE_API_KEY")
    betfair_api_key: Optional[str] = Field(default=None, alias="BETFAIR_API_KEY")
    betfair_session_token: Optional[str] = Field(default=None, alias="BETFAIR_SESSION_TOKEN")

    model_config = {"env_prefix": "", "extra": "ignore"}


class AuthSettings(BaseSettings):
    jwt_secret: str = Field(default="change-me-in-production", alias="JWT_SECRET")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    access_token_expire_minutes: int = Field(default=30, alias="ACCESS_TOKEN_EXPIRE_MINUTES")

    free_rate_limit: int = Field(default=60, alias="FREE_TIER_RATE_LIMIT")
    pro_rate_limit: int = Field(default=600, alias="PRO_TIER_RATE_LIMIT")
    institutional_rate_limit: int = Field(default=6000, alias="INSTITUTIONAL_TIER_RATE_LIMIT")

    model_config = {"env_prefix": "", "extra": "ignore"}

    @field_validator("jwt_secret")
    @classmethod
    def warn_default_secret(cls, v: str) -> str:
        if v == "change-me-in-production":
            import warnings
            warnings.warn(
                "JWT_SECRET is using default value. Set a secure secret in production.",
                stacklevel=2,
            )
        return v


class CircuitBreakerSettings(BaseSettings):
    failure_threshold: int = Field(default=5, description="Failures before circuit opens")
    recovery_timeout: int = Field(default=30, description="Seconds before half-open retry")
    half_open_max_calls: int = Field(default=3, description="Test calls in half-open state")

    model_config = {"env_prefix": "CB_", "extra": "ignore"}


class WorkerSettings(BaseSettings):
    ingest_interval: float = Field(default=10.0, description="Seconds between ingestion cycles")
    whale_scan_interval: float = Field(default=30.0, description="Seconds between whale scans")
    resolution_scan_interval: float = Field(default=300.0, description="Seconds between resolution scans")
    snapshot_interval: float = Field(default=60.0, description="Seconds between price snapshots")
    max_concurrent_fetches: int = Field(default=10, description="Max concurrent platform API calls")

    model_config = {"env_prefix": "WORKER_", "extra": "ignore"}


class Settings(BaseSettings):
    """Root settings — aggregates all sub-configs."""

    # Server
    host: str = Field(default="0.0.0.0", alias="HOST")
    port: int = Field(default=8000, alias="PORT")
    env: str = Field(default="development", alias="ENV")
    debug: bool = Field(default=False, alias="DEBUG")
    workers: int = Field(default=4, alias="WORKERS")
    log_level: str = Field(default="info", alias="LOG_LEVEL")

    # Sub-configs
    db: DatabaseSettings = Field(default_factory=DatabaseSettings)
    redis: RedisSettings = Field(default_factory=RedisSettings)
    platforms: PlatformCredentials = Field(default_factory=PlatformCredentials)
    auth: AuthSettings = Field(default_factory=AuthSettings)
    circuit_breaker: CircuitBreakerSettings = Field(default_factory=CircuitBreakerSettings)
    worker: WorkerSettings = Field(default_factory=WorkerSettings)

    # Stripe (billing)
    stripe_secret_key: Optional[str] = Field(default=None, alias="STRIPE_SECRET_KEY")
    stripe_webhook_secret: Optional[str] = Field(default=None, alias="STRIPE_WEBHOOK_SECRET")

    model_config = {"env_prefix": "", "extra": "ignore", "env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    @property
    def is_development(self) -> bool:
        return self.env == "development"


@lru_cache
def get_settings() -> Settings:
    """Singleton settings instance, cached after first call."""
    return Settings()
