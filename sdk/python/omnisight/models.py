"""OmniSight SDK — Data models."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class Market:
    id: str
    platform: str
    title: str
    yes_price: Optional[float] = None
    no_price: Optional[float] = None
    volume_24h: float = 0
    volume_total: float = 0
    liquidity: float = 0
    open_interest: float = 0
    status: str = "active"
    category: Optional[str] = None
    end_date: Optional[datetime] = None
    tags: list[str] = field(default_factory=list)


@dataclass
class PlatformOdds:
    platform: str
    market_id: str
    yes_price: float
    no_price: float
    mid_price: float
    spread: float
    volume_24h: float = 0
    liquidity: float = 0


@dataclass
class NormalizedOdds:
    event_id: str
    event_title: str
    category: str
    platforms: dict[str, PlatformOdds]
    consensus_probability: float
    max_spread: float
    arbitrage_opportunity: bool = False
    arbitrage_profit_bps: Optional[float] = None


@dataclass
class OrderLevel:
    price: float
    size: float
    cumulative_size: float = 0


@dataclass
class OrderBook:
    market_id: str
    platform: str
    bids: list[OrderLevel]
    asks: list[OrderLevel]
    bid_depth: float = 0
    ask_depth: float = 0
    mid_price: float = 0
    spread: float = 0
    imbalance: float = 0


@dataclass
class WhaleAlert:
    id: str
    market_id: str
    market_title: str
    platform: str
    wallet_address: str
    side: str
    price: float
    size: float
    usd_value: float
    wallet_label: Optional[str] = None
    is_new_position: bool = False
    tags: list[str] = field(default_factory=list)
    timestamp: Optional[datetime] = None


@dataclass
class ArbitrageOpportunity:
    id: str
    event_title: str
    platform_a: str
    platform_b: str
    market_a_id: str
    market_b_id: str
    price_a: float
    price_b: float
    spread_bps: float
    estimated_profit_bps: float
    liquidity_available: float
    is_active: bool = True


@dataclass
class MarketMicrostructure:
    market_id: str
    platform: str
    current_spread: float
    avg_spread_1h: float
    avg_spread_24h: float
    spread_volatility: float
    bid_depth_10bps: float
    ask_depth_10bps: float
    volume_1h: float
    volume_24h: float
    vwap_1h: float
    trade_count_1h: int
    fill_rate: float
    slippage_1k: float
    whale_buy_volume_24h: float
    whale_sell_volume_24h: float
    whale_net_flow: float


@dataclass
class Resolution:
    market_id: str
    platform: str
    title: str
    outcome: str
    resolution_source: str
    resolved_at: datetime
    final_price: float
    total_volume: float


@dataclass
class PriceUpdate:
    market_id: str
    platform: str
    yes_price: float
    no_price: float
    timestamp: datetime
