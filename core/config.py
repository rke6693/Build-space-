"""Centralised config loaded from .env.

Uses pydantic-settings so we get type coercion, validation, and fail-fast
behaviour the moment the bot starts — a missing key means the bot never
opens a position, rather than crashing mid-trade.
"""
from __future__ import annotations

from pathlib import Path
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Polymarket / Polygon
    polymarket_private_key: str = Field(..., alias="POLYMARKET_PRIVATE_KEY")
    polymarket_proxy_address: str = Field(..., alias="POLYMARKET_PROXY_ADDRESS")
    polymarket_sig_type: int = Field(1, alias="POLYMARKET_SIG_TYPE")
    polymarket_clob_host: str = Field(
        "https://clob.polymarket.com", alias="POLYMARKET_CLOB_HOST"
    )
    polygon_chain_id: int = Field(137, alias="POLYGON_CHAIN_ID")

    # Bankroll / risk
    starting_bankroll_usdc: float = Field(100.0, alias="STARTING_BANKROLL_USDC")
    target_bankroll_usdc: float = Field(1000.0, alias="TARGET_BANKROLL_USDC")
    hard_shutdown_usdc: float = Field(20.0, alias="HARD_SHUTDOWN_USDC")
    daily_drawdown_pct: float = Field(0.35, alias="DAILY_DRAWDOWN_PCT")
    max_position_frac: float = Field(0.40, alias="MAX_POSITION_FRAC")
    max_concurrent_positions: int = Field(3, alias="MAX_CONCURRENT_POSITIONS")
    kelly_fraction: float = Field(1.5, alias="KELLY_FRACTION")
    min_edge_bps: int = Field(400, alias="MIN_EDGE_BPS")

    # Claude
    anthropic_api_key: str = Field("", alias="ANTHROPIC_API_KEY")
    claude_model: str = Field(
        "claude-haiku-4-5-20251001", alias="CLAUDE_MODEL"
    )
    claude_max_spend_usd_daily: float = Field(
        5.0, alias="CLAUDE_MAX_SPEND_USD_DAILY"
    )

    # Telegram
    telegram_bot_token: str = Field("", alias="TELEGRAM_BOT_TOKEN")
    telegram_chat_id: str = Field("", alias="TELEGRAM_CHAT_ID")

    # Feature flags
    enable_crypto_lag: bool = Field(True, alias="ENABLE_CRYPTO_LAG")
    enable_news_reactor: bool = Field(True, alias="ENABLE_NEWS_REACTOR")
    enable_resolver_sniper: bool = Field(True, alias="ENABLE_RESOLVER_SNIPER")
    dry_run: bool = Field(False, alias="DRY_RUN")

    # Feeds
    binance_ws_url: str = Field(
        "wss://stream.binance.com:9443/stream", alias="BINANCE_WS_URL"
    )
    crypto_symbols_raw: str = Field(
        "BTCUSDT,ETHUSDT,SOLUSDT", alias="CRYPTO_SYMBOLS"
    )

    # Runtime
    log_level: str = Field("INFO", alias="LOG_LEVEL")
    state_dir: str = Field("./state", alias="STATE_DIR")
    poll_interval_seconds: int = Field(15, alias="POLL_INTERVAL_SECONDS")

    @field_validator("polymarket_private_key")
    @classmethod
    def _check_pk(cls, v: str) -> str:
        if not v or v.startswith("0xyour"):
            raise ValueError(
                "POLYMARKET_PRIVATE_KEY is not set. Copy .env.example -> .env and fill it in."
            )
        if not v.startswith("0x"):
            v = "0x" + v
        if len(v) != 66:
            raise ValueError("POLYMARKET_PRIVATE_KEY must be 32 bytes hex (0x + 64 chars)")
        return v

    @field_validator("polymarket_proxy_address")
    @classmethod
    def _check_proxy(cls, v: str) -> str:
        if not v or v.startswith("0xyour"):
            raise ValueError(
                "POLYMARKET_PROXY_ADDRESS is not set. Find it on polymarket.com -> deposit."
            )
        return v

    @property
    def crypto_symbols(self) -> List[str]:
        return [s.strip().upper() for s in self.crypto_symbols_raw.split(",") if s.strip()]

    @property
    def state_path(self) -> Path:
        p = Path(self.state_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p


_settings: Settings | None = None


def get_settings() -> Settings:
    """Cached singleton accessor. First call validates the .env file."""
    global _settings
    if _settings is None:
        _settings = Settings()  # type: ignore[call-arg]
    return _settings
