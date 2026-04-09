"""
OmniSight - Core Data Models
Unified schema for cross-platform prediction market data.
"""

from __future__ import annotations

import enum
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field
from sqlalchemy import (
    Column, String, Float, Integer, DateTime, Boolean, JSON, Enum as SAEnum,
    ForeignKey, Text, BigInteger, Index
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

Base = declarative_base()


# ── Enums ──────────────────────────────────────────────────────

class Platform(str, enum.Enum):
    POLYMARKET = "polymarket"
    KALSHI = "kalshi"
    PINNACLE = "pinnacle"
    BETFAIR = "betfair"
    DRAFTKINGS = "draftkings"
    FANDUEL = "fanduel"


class MarketStatus(str, enum.Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    CLOSED = "closed"
    RESOLVED = "resolved"
    DISPUTED = "disputed"


class ResolutionOutcome(str, enum.Enum):
    YES = "yes"
    NO = "no"
    PARTIAL = "partial"
    VOIDED = "voided"
    PENDING = "pending"


class OrderSide(str, enum.Enum):
    BID = "bid"
    ASK = "ask"


class TierLevel(str, enum.Enum):
    FREE = "free"
    PRO = "pro"
    INSTITUTIONAL = "institutional"
    ENTERPRISE = "enterprise"


# ── SQLAlchemy ORM Models ──────────────────────────────────────

class MarketDB(Base):
    __tablename__ = "markets"

    id = Column(String(64), primary_key=True)
    platform = Column(SAEnum(Platform), nullable=False, index=True)
    platform_market_id = Column(String(256), nullable=False)
    title = Column(Text, nullable=False)
    description = Column(Text)
    category = Column(String(128), index=True)
    subcategory = Column(String(128))

    # Normalized odds (0.0 - 1.0)
    yes_price = Column(Float)
    no_price = Column(Float)
    last_trade_price = Column(Float)

    # Volume & liquidity
    volume_24h = Column(Float, default=0)
    volume_total = Column(Float, default=0)
    liquidity = Column(Float, default=0)
    open_interest = Column(Float, default=0)

    # Status & resolution
    status = Column(SAEnum(MarketStatus), default=MarketStatus.ACTIVE, index=True)
    resolution = Column(SAEnum(ResolutionOutcome), default=ResolutionOutcome.PENDING)
    resolution_source = Column(Text)
    end_date = Column(DateTime)
    resolved_at = Column(DateTime)

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    tags = Column(JSONB, default=list)
    metadata = Column(JSONB, default=dict)

    # Relationships
    snapshots = relationship("PriceSnapshotDB", back_populates="market")
    order_book_entries = relationship("OrderBookEntryDB", back_populates="market")
    whale_trades = relationship("WhaleTradeDB", back_populates="market")

    __table_args__ = (
        Index("ix_platform_market", "platform", "platform_market_id", unique=True),
        Index("ix_category_status", "category", "status"),
    )


class PriceSnapshotDB(Base):
    __tablename__ = "price_snapshots"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    market_id = Column(String(64), ForeignKey("markets.id"), nullable=False, index=True)
    timestamp = Column(DateTime, nullable=False, index=True)
    yes_price = Column(Float)
    no_price = Column(Float)
    mid_price = Column(Float)
    spread = Column(Float)
    volume = Column(Float)
    liquidity = Column(Float)
    platform = Column(SAEnum(Platform))

    market = relationship("MarketDB", back_populates="snapshots")

    __table_args__ = (
        Index("ix_snapshot_market_time", "market_id", "timestamp"),
    )


class OrderBookEntryDB(Base):
    __tablename__ = "order_book_entries"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    market_id = Column(String(64), ForeignKey("markets.id"), nullable=False, index=True)
    timestamp = Column(DateTime, nullable=False)
    side = Column(SAEnum(OrderSide), nullable=False)
    price = Column(Float, nullable=False)
    size = Column(Float, nullable=False)
    platform = Column(SAEnum(Platform))

    market = relationship("MarketDB", back_populates="order_book_entries")


class WhaleTradeDB(Base):
    __tablename__ = "whale_trades"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    market_id = Column(String(64), ForeignKey("markets.id"), nullable=False, index=True)
    timestamp = Column(DateTime, nullable=False, index=True)
    wallet_address = Column(String(256), index=True)
    side = Column(SAEnum(OrderSide), nullable=False)
    price = Column(Float, nullable=False)
    size = Column(Float, nullable=False)
    usd_value = Column(Float, nullable=False)
    platform = Column(SAEnum(Platform))
    is_new_position = Column(Boolean, default=False)
    tags = Column(JSONB, default=list)

    market = relationship("MarketDB", back_populates="whale_trades")

    __table_args__ = (
        Index("ix_whale_wallet_time", "wallet_address", "timestamp"),
    )


class ArbitrageOpportunityDB(Base):
    __tablename__ = "arbitrage_opportunities"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    market_a_id = Column(String(64), ForeignKey("markets.id"), nullable=False)
    market_b_id = Column(String(64), ForeignKey("markets.id"), nullable=False)
    platform_a = Column(SAEnum(Platform))
    platform_b = Column(SAEnum(Platform))
    price_a = Column(Float, nullable=False)
    price_b = Column(Float, nullable=False)
    spread_pct = Column(Float, nullable=False)
    detected_at = Column(DateTime, default=datetime.utcnow)
    expired_at = Column(DateTime)
    estimated_profit_bps = Column(Float)
    is_active = Column(Boolean, default=True, index=True)


class APIKeyDB(Base):
    __tablename__ = "api_keys"

    id = Column(String(64), primary_key=True)
    user_id = Column(String(64), nullable=False, index=True)
    key_hash = Column(String(256), nullable=False, unique=True)
    tier = Column(SAEnum(TierLevel), default=TierLevel.FREE)
    rate_limit = Column(Integer, default=60)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime)
    last_used_at = Column(DateTime)
    request_count = Column(BigInteger, default=0)
    metadata = Column(JSONB, default=dict)


# ── Pydantic API Schemas ──────────────────────────────────────

class MarketResponse(BaseModel):
    id: str
    platform: Platform
    platform_market_id: str
    title: str
    description: Optional[str] = None
    category: Optional[str] = None
    yes_price: Optional[float] = None
    no_price: Optional[float] = None
    last_trade_price: Optional[float] = None
    volume_24h: float = 0
    volume_total: float = 0
    liquidity: float = 0
    open_interest: float = 0
    status: MarketStatus = MarketStatus.ACTIVE
    resolution: ResolutionOutcome = ResolutionOutcome.PENDING
    end_date: Optional[datetime] = None
    tags: list[str] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class NormalizedOdds(BaseModel):
    """Cross-platform normalized odds for a single event."""
    event_id: str
    event_title: str
    category: str
    platforms: dict[str, PlatformOdds] = {}
    consensus_probability: float = Field(ge=0, le=1)
    max_spread: float = Field(ge=0, description="Max spread across platforms in basis points")
    arbitrage_opportunity: bool = False
    arbitrage_profit_bps: Optional[float] = None
    updated_at: datetime


class PlatformOdds(BaseModel):
    platform: Platform
    market_id: str
    yes_price: float = Field(ge=0, le=1)
    no_price: float = Field(ge=0, le=1)
    mid_price: float = Field(ge=0, le=1)
    spread: float = Field(ge=0)
    volume_24h: float = 0
    liquidity: float = 0
    last_updated: datetime


class OrderBookSnapshot(BaseModel):
    market_id: str
    platform: Platform
    timestamp: datetime
    bids: list[OrderLevel]
    asks: list[OrderLevel]
    bid_depth: float = 0
    ask_depth: float = 0
    mid_price: float
    spread: float
    imbalance: float = Field(description="Order book imbalance ratio (-1 to 1)")


class OrderLevel(BaseModel):
    price: float
    size: float
    cumulative_size: float = 0
    num_orders: int = 1


class WhaleAlert(BaseModel):
    id: str
    market_id: str
    market_title: str
    platform: Platform
    wallet_address: str
    wallet_label: Optional[str] = None
    side: OrderSide
    price: float
    size: float
    usd_value: float
    is_new_position: bool = False
    timestamp: datetime
    tags: list[str] = []


class MarketMicrostructure(BaseModel):
    """Full microstructure analytics for a market."""
    market_id: str
    platform: Platform
    timestamp: datetime

    # Spread analytics
    current_spread: float
    avg_spread_1h: float
    avg_spread_24h: float
    spread_volatility: float

    # Depth analytics
    bid_depth_10bps: float
    ask_depth_10bps: float
    bid_depth_50bps: float
    ask_depth_50bps: float
    depth_imbalance: float

    # Volume analytics
    volume_1h: float
    volume_24h: float
    vwap_1h: float
    trade_count_1h: int
    avg_trade_size: float

    # Fill analytics
    fill_rate: float = Field(description="Percentage of orders filled within 60s")
    avg_fill_time_ms: float
    slippage_1k: float = Field(description="Expected slippage for $1000 order in bps")

    # Whale flow
    whale_buy_volume_24h: float
    whale_sell_volume_24h: float
    whale_net_flow: float
    unique_whales_24h: int


class ArbitrageOpportunity(BaseModel):
    id: str
    event_title: str
    platform_a: Platform
    platform_b: Platform
    market_a_id: str
    market_b_id: str
    price_a: float
    price_b: float
    spread_bps: float
    estimated_profit_bps: float
    liquidity_available: float
    detected_at: datetime
    is_active: bool = True


class ResolutionEvent(BaseModel):
    market_id: str
    platform: Platform
    title: str
    outcome: ResolutionOutcome
    resolution_source: str
    resolved_at: datetime
    final_price: float
    total_volume: float
    payout_info: Optional[dict] = None


class HistoricalSpread(BaseModel):
    market_id: str
    platform_a: Platform
    platform_b: Platform
    data_points: list[SpreadDataPoint]
    avg_spread: float
    max_spread: float
    min_spread: float
    correlation: float


class SpreadDataPoint(BaseModel):
    timestamp: datetime
    price_a: float
    price_b: float
    spread_bps: float


class APIUsageStats(BaseModel):
    user_id: str
    tier: TierLevel
    requests_today: int
    requests_this_month: int
    rate_limit: int
    websocket_connections: int
    last_request: Optional[datetime] = None


# Forward references
NormalizedOdds.model_rebuild()
OrderBookSnapshot.model_rebuild()
HistoricalSpread.model_rebuild()
