"""
OmniSight — Whale Tracker & Market Microstructure Analytics
Monitors large trades, tracks wallet behavior, computes market microstructure metrics.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

import numpy as np
import structlog

from api.connectors.base import BaseConnector
from api.models import (
    MarketMicrostructure, OrderBookSnapshot, OrderSide,
    Platform, WhaleAlert,
)

logger = structlog.get_logger(__name__)


# Well-known whale wallets (discovered via on-chain analysis)
KNOWN_WHALES: dict[str, str] = {
    "0x1234...abcd": "Polymarket Whale #1",
    "0x5678...efgh": "Institutional MM Alpha",
    "0x9abc...ijkl": "DeFi Protocol Treasury",
    "0xdef0...mnop": "Quant Fund Beta",
}


class WhaleTracker:
    """
    Real-time whale tracking across prediction market platforms.
    Identifies large trades, tracks wallet patterns, and generates alerts.
    """

    def __init__(
        self,
        connectors: dict[Platform, BaseConnector],
        min_whale_usd: float = 10_000,
        min_mega_whale_usd: float = 100_000,
    ):
        self.connectors = connectors
        self.min_whale_usd = min_whale_usd
        self.min_mega_whale_usd = min_mega_whale_usd

        # In-memory tracking (production: backed by Redis/DB)
        self._recent_alerts: list[WhaleAlert] = []
        self._wallet_history: dict[str, list[WhaleAlert]] = defaultdict(list)
        self._wallet_pnl: dict[str, float] = defaultdict(float)
        self._subscribers: list[asyncio.Queue] = []

    async def scan_market(
        self,
        market_id: str,
        platform: Platform,
        lookback_hours: int = 24,
    ) -> list[WhaleAlert]:
        """Scan a market for whale trades."""
        connector = self.connectors.get(platform)
        if not connector:
            return []

        since = (datetime.now(timezone.utc) - timedelta(hours=lookback_hours)).timestamp()
        whales = await connector.get_whale_trades(market_id, self.min_whale_usd)

        alerts = []
        for whale in whales:
            # Enrich with known wallet labels
            whale.wallet_label = KNOWN_WHALES.get(whale.wallet_address)

            # Tag the trade
            tags = []
            if whale.usd_value >= self.min_mega_whale_usd:
                tags.append("mega_whale")
            if whale.is_new_position:
                tags.append("new_position")
            if whale.wallet_label:
                tags.append("known_wallet")

            # Check for pattern: same wallet trading same direction repeatedly
            history = self._wallet_history.get(whale.wallet_address, [])
            recent_same_side = [
                h for h in history
                if h.side == whale.side and h.market_id == whale.market_id
                and (whale.timestamp - h.timestamp).total_seconds() < 3600
            ]
            if len(recent_same_side) >= 2:
                tags.append("accumulating")

            whale.tags = tags
            alerts.append(whale)
            self._recent_alerts.append(whale)
            self._wallet_history[whale.wallet_address].append(whale)

            # Notify subscribers
            for queue in self._subscribers:
                await queue.put(whale)

        return alerts

    async def scan_all_platforms(
        self,
        market_ids: dict[Platform, list[str]],
        lookback_hours: int = 24,
    ) -> list[WhaleAlert]:
        """Scan for whales across all platforms in parallel."""
        tasks = []
        for platform, mids in market_ids.items():
            for mid in mids:
                tasks.append(self.scan_market(mid, platform, lookback_hours))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        all_alerts = []
        for result in results:
            if isinstance(result, list):
                all_alerts.extend(result)
            elif isinstance(result, Exception):
                logger.error("whale_scan_error", error=str(result))

        # Sort by USD value descending
        all_alerts.sort(key=lambda a: -a.usd_value)
        return all_alerts

    def get_wallet_profile(self, wallet_address: str) -> dict:
        """Get trading profile for a specific wallet."""
        history = self._wallet_history.get(wallet_address, [])
        if not history:
            return {"wallet": wallet_address, "trades": 0}

        total_volume = sum(a.usd_value for a in history)
        buy_volume = sum(a.usd_value for a in history if a.side == OrderSide.BID)
        sell_volume = sum(a.usd_value for a in history if a.side == OrderSide.ASK)
        unique_markets = len(set(a.market_id for a in history))
        platforms = list(set(a.platform.value for a in history))

        return {
            "wallet": wallet_address,
            "label": KNOWN_WHALES.get(wallet_address),
            "trades": len(history),
            "total_volume_usd": total_volume,
            "buy_volume_usd": buy_volume,
            "sell_volume_usd": sell_volume,
            "net_flow_usd": buy_volume - sell_volume,
            "unique_markets": unique_markets,
            "platforms": platforms,
            "first_seen": min(a.timestamp for a in history).isoformat(),
            "last_seen": max(a.timestamp for a in history).isoformat(),
            "avg_trade_size_usd": total_volume / len(history),
            "is_known": wallet_address in KNOWN_WHALES,
        }

    def get_whale_flow_summary(self, hours: int = 24) -> dict:
        """Aggregate whale flow data across all markets."""
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        recent = [a for a in self._recent_alerts if a.timestamp >= cutoff]

        buy_volume = sum(a.usd_value for a in recent if a.side == OrderSide.BID)
        sell_volume = sum(a.usd_value for a in recent if a.side == OrderSide.ASK)
        unique_whales = len(set(a.wallet_address for a in recent))

        # Per-market breakdown
        market_flow = defaultdict(lambda: {"buy": 0, "sell": 0, "title": ""})
        for a in recent:
            flow = market_flow[a.market_id]
            flow["title"] = a.market_title
            if a.side == OrderSide.BID:
                flow["buy"] += a.usd_value
            else:
                flow["sell"] += a.usd_value

        # Top markets by whale activity
        top_markets = sorted(
            market_flow.items(),
            key=lambda x: -(x[1]["buy"] + x[1]["sell"])
        )[:20]

        return {
            "period_hours": hours,
            "total_whale_volume_usd": buy_volume + sell_volume,
            "buy_volume_usd": buy_volume,
            "sell_volume_usd": sell_volume,
            "net_flow_usd": buy_volume - sell_volume,
            "unique_whales": unique_whales,
            "total_alerts": len(recent),
            "mega_whale_alerts": len([a for a in recent if "mega_whale" in a.tags]),
            "top_markets": [
                {
                    "market_id": mid,
                    "title": data["title"],
                    "buy_volume": data["buy"],
                    "sell_volume": data["sell"],
                    "net_flow": data["buy"] - data["sell"],
                }
                for mid, data in top_markets
            ],
        }

    def subscribe(self) -> asyncio.Queue:
        """Subscribe to real-time whale alerts."""
        queue = asyncio.Queue()
        self._subscribers.append(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue):
        """Unsubscribe from whale alerts."""
        self._subscribers.remove(queue)


class MicrostructureAnalyzer:
    """
    Computes market microstructure metrics: spread, depth, fill rates,
    slippage, volume profiles, and order flow toxicity.
    """

    def __init__(self, connectors: dict[Platform, BaseConnector]):
        self.connectors = connectors
        # Historical data cache (production: backed by TimescaleDB)
        self._spread_history: dict[str, list[tuple[datetime, float]]] = defaultdict(list)
        self._trade_history: dict[str, list[dict]] = defaultdict(list)
        self._order_snapshots: dict[str, list[OrderBookSnapshot]] = defaultdict(list)

    async def analyze_market(
        self,
        market_id: str,
        platform: Platform,
    ) -> MarketMicrostructure:
        """Compute full microstructure analytics for a market."""
        connector = self.connectors.get(platform)
        if not connector:
            raise ValueError(f"No connector for platform {platform}")

        # Fetch current data
        order_book = await connector.get_order_book(market_id)
        trades = await connector.get_trades(market_id, limit=500)

        # Store for historical analysis
        self._order_snapshots[market_id].append(order_book)
        self._trade_history[market_id].extend(trades)

        # Spread analytics
        current_spread = order_book.spread
        spread_history = self._spread_history[market_id]
        spread_history.append((datetime.now(timezone.utc), current_spread))
        recent_spreads = [s for t, s in spread_history if t > datetime.now(timezone.utc) - timedelta(hours=1)]
        day_spreads = [s for t, s in spread_history if t > datetime.now(timezone.utc) - timedelta(hours=24)]

        avg_spread_1h = float(np.mean(recent_spreads)) if recent_spreads else current_spread
        avg_spread_24h = float(np.mean(day_spreads)) if day_spreads else current_spread
        spread_vol = float(np.std(day_spreads)) if len(day_spreads) >= 2 else 0

        # Depth analytics
        bid_depth_10 = self._depth_within_bps(order_book.bids, order_book.mid_price, 10)
        ask_depth_10 = self._depth_within_bps(order_book.asks, order_book.mid_price, 10)
        bid_depth_50 = self._depth_within_bps(order_book.bids, order_book.mid_price, 50)
        ask_depth_50 = self._depth_within_bps(order_book.asks, order_book.mid_price, 50)
        total_near = bid_depth_10 + ask_depth_10
        depth_imbalance = (bid_depth_10 - ask_depth_10) / total_near if total_near > 0 else 0

        # Volume analytics
        now = datetime.now(timezone.utc)
        trades_1h = [t for t in trades if (now - t.get("timestamp", now)).total_seconds() < 3600]
        trades_24h = trades  # Assume fetched trades cover 24h

        volume_1h = sum(t.get("usd_value", 0) for t in trades_1h)
        volume_24h = sum(t.get("usd_value", 0) for t in trades_24h)
        trade_count = len(trades_1h)
        avg_trade = volume_1h / trade_count if trade_count > 0 else 0

        # VWAP
        if trades_1h:
            total_pv = sum(t.get("price", 0) * t.get("size", 0) for t in trades_1h)
            total_v = sum(t.get("size", 0) for t in trades_1h)
            vwap = total_pv / total_v if total_v > 0 else order_book.mid_price
        else:
            vwap = order_book.mid_price

        # Slippage estimation (for $1000 order)
        slippage = self._estimate_slippage(order_book, 1000)

        # Whale flow
        whale_threshold = 10000
        whale_buys = sum(
            t.get("usd_value", 0) for t in trades_24h
            if t.get("usd_value", 0) >= whale_threshold and t.get("side") == "bid"
        )
        whale_sells = sum(
            t.get("usd_value", 0) for t in trades_24h
            if t.get("usd_value", 0) >= whale_threshold and t.get("side") == "ask"
        )
        unique_whales = len(set(
            t.get("wallet", t.get("user_id", ""))
            for t in trades_24h if t.get("usd_value", 0) >= whale_threshold
        ))

        return MarketMicrostructure(
            market_id=market_id,
            platform=platform,
            timestamp=now,
            current_spread=round(current_spread, 6),
            avg_spread_1h=round(avg_spread_1h, 6),
            avg_spread_24h=round(avg_spread_24h, 6),
            spread_volatility=round(spread_vol, 6),
            bid_depth_10bps=round(bid_depth_10, 2),
            ask_depth_10bps=round(ask_depth_10, 2),
            bid_depth_50bps=round(bid_depth_50, 2),
            ask_depth_50bps=round(ask_depth_50, 2),
            depth_imbalance=round(depth_imbalance, 4),
            volume_1h=round(volume_1h, 2),
            volume_24h=round(volume_24h, 2),
            vwap_1h=round(vwap, 4),
            trade_count_1h=trade_count,
            avg_trade_size=round(avg_trade, 2),
            fill_rate=0.85,  # Placeholder — requires order tracking
            avg_fill_time_ms=250.0,  # Placeholder
            slippage_1k=round(slippage, 2),
            whale_buy_volume_24h=round(whale_buys, 2),
            whale_sell_volume_24h=round(whale_sells, 2),
            whale_net_flow=round(whale_buys - whale_sells, 2),
            unique_whales_24h=unique_whales,
        )

    @staticmethod
    def _depth_within_bps(levels: list, mid_price: float, bps: int) -> float:
        """Calculate total depth within N basis points of mid price."""
        threshold = mid_price * (bps / 10000)
        total = 0.0
        for level in levels:
            if abs(level.price - mid_price) <= threshold:
                total += level.size
        return total

    @staticmethod
    def _estimate_slippage(order_book: OrderBookSnapshot, usd_amount: float) -> float:
        """Estimate slippage in bps for a given order size."""
        remaining = usd_amount
        weighted_price = 0.0
        total_filled = 0.0

        for level in order_book.asks:
            level_value = level.size * level.price
            fill = min(remaining, level_value)
            weighted_price += (fill / level.price) * level.price
            total_filled += fill
            remaining -= fill
            if remaining <= 0:
                break

        if total_filled == 0:
            return 0

        avg_fill_price = weighted_price / (total_filled / order_book.asks[0].price) if order_book.asks else order_book.mid_price
        slippage_bps = abs(avg_fill_price - order_book.mid_price) / order_book.mid_price * 10000
        return slippage_bps
