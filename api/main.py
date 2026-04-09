"""
OmniSight — Prediction Market Infrastructure API
The Bloomberg Terminal for prediction markets.

REST + WebSocket API providing:
- Cross-platform odds normalization (Polymarket, Kalshi, Pinnacle, Betfair)
- Real-time price streaming
- Market microstructure analytics
- Whale tracking & flow analysis
- Arbitrage detection
- Resolution tracking
- Historical spread data
"""

from __future__ import annotations

import asyncio
import json
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

import structlog
from fastapi import Depends, FastAPI, Query, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

from api.cache import cache, check_redis_health, init_redis, close_redis
from api.circuit_breaker import get_all_breaker_metrics
from api.config import get_settings
from api.connectors.base import BaseConnector
from api.connectors.kalshi import KalshiConnector
from api.connectors.polymarket import PolymarketConnector
from api.connectors.sportsbook import BetfairConnector, PinnacleConnector
from api.database import check_db_health, close_db, init_db
from api.metrics import (
    HTTP_REQUESTS_TOTAL,
    HTTP_REQUEST_DURATION,
    HTTP_REQUESTS_IN_PROGRESS,
    WS_CONNECTIONS_ACTIVE,
    WS_MESSAGES_SENT,
)
from api.middleware.auth import (
    AuthManager, get_api_key, require_tier, TIER_CONFIG,
)
from api.models import (
    ArbitrageOpportunity, MarketMicrostructure, MarketResponse,
    MarketStatus, NormalizedOdds, OrderBookSnapshot, Platform,
    ResolutionEvent, TierLevel, WhaleAlert,
)
from api.services.normalizer import OddsNormalizer
from api.services.resolution import ResolutionTracker
from api.services.whale_tracker import MicrostructureAnalyzer, WhaleTracker

logger = structlog.get_logger(__name__)

# ── Structured Logging Setup ──────────────────────────────────

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer() if get_settings().is_production
        else structlog.dev.ConsoleRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(
        {"debug": 10, "info": 20, "warning": 30, "error": 40, "critical": 50}[
            get_settings().log_level.lower()
        ]
    ),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)

# ── Globals ───────────────────────────────────────────────────

connectors: dict[Platform, BaseConnector] = {}
normalizer: Optional[OddsNormalizer] = None
whale_tracker: Optional[WhaleTracker] = None
microstructure: Optional[MicrostructureAnalyzer] = None
resolution_tracker: Optional[ResolutionTracker] = None
auth_manager = AuthManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize all dependencies on startup, tear down on shutdown."""
    global connectors, normalizer, whale_tracker, microstructure, resolution_tracker
    settings = get_settings()

    # Initialize infrastructure
    try:
        await init_db()
    except Exception as e:
        logger.warning("database_init_skipped", error=str(e))

    try:
        await init_redis()
    except Exception as e:
        logger.warning("redis_init_skipped", error=str(e))

    # Initialize platform connectors (from validated config, not raw env)
    creds = settings.platforms
    connectors[Platform.POLYMARKET] = PolymarketConnector(
        api_key=creds.polymarket_api_key,
        api_secret=creds.polymarket_api_secret,
    )
    connectors[Platform.KALSHI] = KalshiConnector(
        api_key=creds.kalshi_api_key,
        api_secret=creds.kalshi_api_secret,
    )
    connectors[Platform.PINNACLE] = PinnacleConnector(
        api_key=creds.pinnacle_api_key,
    )
    connectors[Platform.BETFAIR] = BetfairConnector(
        api_key=creds.betfair_api_key,
        session_token=creds.betfair_session_token,
    )

    # Initialize services
    normalizer = OddsNormalizer(connectors)
    whale_tracker = WhaleTracker(connectors)
    microstructure = MicrostructureAnalyzer(connectors)
    resolution_tracker = ResolutionTracker(connectors)

    logger.info("omnisight_started", platforms=list(connectors.keys()), env=settings.env)
    yield

    # Cleanup — orderly teardown
    for connector in connectors.values():
        await connector.close()
    try:
        await close_redis()
    except Exception:
        pass
    try:
        await close_db()
    except Exception:
        pass
    logger.info("omnisight_shutdown")


# ── App ───────────────────────────────────────────────────────

app = FastAPI(
    title="OmniSight",
    description="The Bloomberg Terminal for Prediction Markets — Unified cross-platform data infrastructure",
    version="1.0.0",
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request Metrics Middleware ─────────────────────────────────

@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    """Record HTTP request metrics for every request."""
    method = request.method
    path = request.url.path

    # Skip metrics endpoint to avoid recursion
    if path == "/metrics":
        return await call_next(request)

    HTTP_REQUESTS_IN_PROGRESS.labels(method=method).inc()
    start = time.monotonic()

    try:
        response = await call_next(request)
        duration = time.monotonic() - start

        HTTP_REQUEST_DURATION.labels(method=method, endpoint=path).observe(duration)
        HTTP_REQUESTS_TOTAL.labels(method=method, endpoint=path, status_code=response.status_code).inc()

        # Add server timing header
        response.headers["Server-Timing"] = f"total;dur={duration * 1000:.1f}"
        return response
    finally:
        HTTP_REQUESTS_IN_PROGRESS.labels(method=method).dec()


# ── Health (deep check — verifies all dependencies) ───────────

@app.get("/health")
async def health():
    db_health = await check_db_health()
    redis_health = await check_redis_health()
    breakers = get_all_breaker_metrics()

    overall = "healthy" if db_health.get("healthy", False) or redis_health.get("healthy", False) else "degraded"

    return {
        "status": overall,
        "version": "1.0.0",
        "env": get_settings().env,
        "platforms": [p.value for p in connectors],
        "dependencies": {
            "database": db_health,
            "redis": redis_health,
        },
        "circuit_breakers": breakers,
        "cache_stats": cache.stats,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/metrics")
async def prometheus_metrics():
    """Prometheus metrics endpoint."""
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


# ── Markets ───────────────────────────────────────────────────

@app.get("/v1/markets", response_model=list[MarketResponse], tags=["Markets"])
async def list_markets(
    platform: Optional[Platform] = None,
    category: Optional[str] = None,
    status: MarketStatus = MarketStatus.ACTIVE,
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0, ge=0),
    key_data: dict = Depends(get_api_key),
):
    """
    List markets across all platforms or filter by platform.
    Free tier: basic market data. Pro+: full metadata.
    """
    if platform:
        connector = connectors.get(platform)
        if not connector:
            return []
        return await connector.get_markets(category=category, status=status, limit=limit, offset=offset)

    # Fetch from all platforms in parallel
    tasks = {
        p: asyncio.create_task(c.get_markets(category=category, status=status, limit=limit, offset=offset))
        for p, c in connectors.items()
    }
    all_markets = []
    for p, task in tasks.items():
        try:
            all_markets.extend(await task)
        except Exception as e:
            logger.error("fetch_error", platform=p, error=str(e))

    return all_markets[:limit]


@app.get("/v1/markets/{market_id}", response_model=MarketResponse, tags=["Markets"])
async def get_market(
    market_id: str,
    platform: Platform = Query(...),
    key_data: dict = Depends(get_api_key),
):
    """Get detailed data for a single market."""
    connector = connectors.get(platform)
    if not connector:
        return ORJSONResponse(status_code=404, content={"error": "Platform not found"})
    return await connector.get_market(market_id)


# ── Normalized Odds ───────────────────────────────────────────

@app.get("/v1/odds/normalized", response_model=list[NormalizedOdds], tags=["Odds"])
async def get_normalized_odds(
    category: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    key_data: dict = Depends(get_api_key),
):
    """
    Get cross-platform normalized odds with consensus probability.
    Matches equivalent events across Polymarket, Kalshi, and sportsbooks.
    """
    events = await normalizer.find_cross_platform_events(category=category, limit=limit)
    return events[:limit]


@app.get("/v1/odds/{event_id}", tags=["Odds"])
async def get_event_odds(
    event_id: str,
    key_data: dict = Depends(get_api_key),
):
    """Get normalized odds for a specific cross-platform event."""
    events = await normalizer.find_cross_platform_events(limit=500)
    for event in events:
        if event.event_id == event_id:
            return event
    return ORJSONResponse(status_code=404, content={"error": "Event not found"})


# ── Order Book ────────────────────────────────────────────────

@app.get("/v1/orderbook/{market_id}", response_model=OrderBookSnapshot, tags=["Order Book"])
async def get_order_book(
    market_id: str,
    platform: Platform = Query(...),
    key_data: dict = Depends(require_tier(TierLevel.PRO)),
):
    """
    Get real-time order book snapshot. Pro tier required.
    Includes bid/ask depth, imbalance, and spread.
    """
    connector = connectors.get(platform)
    if not connector:
        return ORJSONResponse(status_code=404, content={"error": "Platform not found"})
    return await connector.get_order_book(market_id)


# ── Market Microstructure ─────────────────────────────────────

@app.get("/v1/microstructure/{market_id}", response_model=MarketMicrostructure, tags=["Analytics"])
async def get_microstructure(
    market_id: str,
    platform: Platform = Query(...),
    key_data: dict = Depends(require_tier(TierLevel.PRO)),
):
    """
    Full market microstructure analytics. Pro tier required.
    Includes spread analytics, depth profiles, volume analysis,
    fill rates, slippage estimates, and whale flow.
    """
    return await microstructure.analyze_market(market_id, platform)


# ── Whale Tracking ────────────────────────────────────────────

@app.get("/v1/whales/alerts", response_model=list[WhaleAlert], tags=["Whale Tracking"])
async def get_whale_alerts(
    market_id: Optional[str] = None,
    platform: Optional[Platform] = None,
    min_usd: float = Query(default=10000, ge=1000),
    hours: int = Query(default=24, le=168),
    limit: int = Query(default=50, le=500),
    key_data: dict = Depends(require_tier(TierLevel.PRO)),
):
    """
    Get recent whale trade alerts. Pro tier required.
    Filter by market, platform, or minimum USD value.
    """
    if market_id and platform:
        alerts = await whale_tracker.scan_market(market_id, platform, hours)
    else:
        # Scan recent alerts from cache
        alerts = whale_tracker._recent_alerts[-limit:]

    alerts = [a for a in alerts if a.usd_value >= min_usd]
    return alerts[:limit]


@app.get("/v1/whales/flow", tags=["Whale Tracking"])
async def get_whale_flow(
    hours: int = Query(default=24, le=168),
    key_data: dict = Depends(require_tier(TierLevel.PRO)),
):
    """Get aggregated whale flow summary."""
    return whale_tracker.get_whale_flow_summary(hours)


@app.get("/v1/whales/wallet/{wallet_address}", tags=["Whale Tracking"])
async def get_wallet_profile(
    wallet_address: str,
    key_data: dict = Depends(require_tier(TierLevel.INSTITUTIONAL)),
):
    """Get trading profile for a specific wallet. Institutional tier required."""
    return whale_tracker.get_wallet_profile(wallet_address)


# ── Arbitrage Detection ──────────────────────────────────────

@app.get("/v1/arbitrage", response_model=list[ArbitrageOpportunity], tags=["Arbitrage"])
async def get_arbitrage_opportunities(
    category: Optional[str] = None,
    min_profit_bps: float = Query(default=10, ge=1),
    limit: int = Query(default=20, le=100),
    key_data: dict = Depends(require_tier(TierLevel.PRO)),
):
    """
    Scan for cross-platform arbitrage opportunities. Pro tier required.
    Returns opportunities sorted by estimated profit in basis points.
    """
    opportunities = await normalizer.detect_arbitrage(category, min_profit_bps)
    return opportunities[:limit]


# ── Resolution Tracking ──────────────────────────────────────

@app.get("/v1/resolutions/recent", response_model=list[ResolutionEvent], tags=["Resolutions"])
async def get_recent_resolutions(
    platform: Optional[Platform] = None,
    days: int = Query(default=7, le=90),
    limit: int = Query(default=50, le=500),
    key_data: dict = Depends(get_api_key),
):
    """Get recently resolved markets."""
    resolutions = resolution_tracker._resolutions
    if platform:
        resolutions = [r for r in resolutions if r.platform == platform]
    return resolutions[-limit:]


@app.get("/v1/resolutions/upcoming", tags=["Resolutions"])
async def get_upcoming_resolutions(
    hours: int = Query(default=48, le=168),
    key_data: dict = Depends(get_api_key),
):
    """Get markets approaching resolution deadline."""
    # Fetch active markets
    all_markets = []
    for p, c in connectors.items():
        try:
            markets = await c.get_markets(limit=200)
            all_markets.extend(markets)
        except Exception:
            pass
    return resolution_tracker.get_upcoming_resolutions(all_markets, hours)


@app.get("/v1/resolutions/stats", tags=["Resolutions"])
async def get_resolution_stats(
    days: int = Query(default=30, le=365),
    key_data: dict = Depends(get_api_key),
):
    """Get resolution statistics and dispute tracking."""
    return resolution_tracker.get_resolution_stats(days)


# ── Historical Data ──────────────────────────────────────────

@app.get("/v1/historical/spreads", tags=["Historical"])
async def get_historical_spreads(
    event_id: str = Query(...),
    platform_a: Platform = Query(...),
    platform_b: Platform = Query(...),
    key_data: dict = Depends(require_tier(TierLevel.PRO)),
):
    """Get historical cross-platform spread data. Pro tier required."""
    # In production, this queries TimescaleDB
    return {
        "event_id": event_id,
        "platform_a": platform_a.value,
        "platform_b": platform_b.value,
        "message": "Historical spread data available with time-series database backend",
        "data_points": [],
    }


@app.get("/v1/historical/prices", tags=["Historical"])
async def get_historical_prices(
    market_id: str = Query(...),
    platform: Platform = Query(...),
    interval: str = Query(default="1h", regex="^(1m|5m|15m|1h|4h|1d)$"),
    key_data: dict = Depends(require_tier(TierLevel.PRO)),
):
    """Get historical price data (OHLCV). Pro tier required."""
    return {
        "market_id": market_id,
        "platform": platform.value,
        "interval": interval,
        "message": "Historical OHLCV data available with time-series database backend",
        "candles": [],
    }


# ── Tier & Usage ─────────────────────────────────────────────

@app.get("/v1/account/usage", tags=["Account"])
async def get_usage(key_data: dict = Depends(get_api_key)):
    """Get current API usage and rate limit status."""
    tier = key_data.get("tier", TierLevel.FREE)
    config = TIER_CONFIG[tier]
    return {
        "tier": tier.value,
        "rate_limit_per_minute": config["rate_limit_per_minute"],
        "daily_limit": config["daily_limit"],
        "websocket_connections": config["websocket_connections"],
        "features": config["features"],
    }


@app.get("/v1/tiers", tags=["Account"])
async def get_tiers():
    """Get available API tiers and pricing."""
    return {
        "tiers": {
            "free": {
                "price": "$0/month",
                "rate_limit": "60 req/min",
                "features": ["Basic market data", "Normalized odds", "Resolution tracking"],
            },
            "pro": {
                "price": "$99/month",
                "rate_limit": "600 req/min",
                "features": [
                    "Everything in Free", "Historical data (1 year)", "Order book depth",
                    "Whale alerts", "Arbitrage scanner", "Market microstructure",
                    "5 WebSocket connections",
                ],
            },
            "institutional": {
                "price": "$500/month",
                "rate_limit": "6,000 req/min",
                "features": [
                    "Everything in Pro", "Unlimited historical data", "Full order book depth",
                    "Wallet profiling", "50 WebSocket connections", "Priority support",
                ],
            },
            "enterprise": {
                "price": "Custom",
                "rate_limit": "Unlimited",
                "features": [
                    "Everything in Institutional", "Dedicated infrastructure",
                    "Custom data feeds", "SLA guarantees", "Direct support channel",
                ],
            },
        }
    }


# ── WebSocket Streams ─────────────────────────────────────────

@app.websocket("/v1/ws/prices")
async def ws_price_stream(websocket: WebSocket):
    """
    Real-time price streaming via WebSocket.
    Send: {"subscribe": ["market_id1", "market_id2"], "platform": "polymarket"}
    Receive: {"market_id": "...", "yes_price": 0.65, "no_price": 0.35, ...}
    """
    await websocket.accept()
    logger.info("ws_connected", client=websocket.client.host)

    try:
        # Wait for subscription message
        data = await websocket.receive_json()
        market_ids = data.get("subscribe", [])
        platform = Platform(data.get("platform", "polymarket"))

        connector = connectors.get(platform)
        if not connector:
            await websocket.send_json({"error": f"Unknown platform: {platform}"})
            await websocket.close()
            return

        async for price_update in connector.stream_prices(market_ids):
            price_update["platform"] = price_update["platform"].value
            price_update["timestamp"] = price_update["timestamp"].isoformat()
            await websocket.send_json(price_update)

    except WebSocketDisconnect:
        logger.info("ws_disconnected", client=websocket.client.host)
    except Exception as e:
        logger.error("ws_error", error=str(e))
        await websocket.close(code=1011)


@app.websocket("/v1/ws/whales")
async def ws_whale_stream(websocket: WebSocket):
    """
    Real-time whale alert streaming via WebSocket.
    Pushes alerts whenever a whale trade is detected across any platform.
    """
    await websocket.accept()
    queue = whale_tracker.subscribe()

    try:
        while True:
            alert = await queue.get()
            await websocket.send_json({
                "type": "whale_alert",
                "market_id": alert.market_id,
                "market_title": alert.market_title,
                "platform": alert.platform.value,
                "wallet": alert.wallet_address,
                "wallet_label": alert.wallet_label,
                "side": alert.side.value,
                "price": alert.price,
                "size": alert.size,
                "usd_value": alert.usd_value,
                "tags": alert.tags,
                "timestamp": alert.timestamp.isoformat(),
            })
    except WebSocketDisconnect:
        whale_tracker.unsubscribe(queue)
    except Exception as e:
        logger.error("whale_ws_error", error=str(e))
        whale_tracker.unsubscribe(queue)


@app.websocket("/v1/ws/arbitrage")
async def ws_arbitrage_stream(websocket: WebSocket):
    """
    Real-time arbitrage opportunity streaming.
    Pushes opportunities as they are detected across platforms.
    """
    await websocket.accept()

    try:
        while True:
            # Poll for arbitrage opportunities every 5 seconds
            opportunities = await normalizer.detect_arbitrage(min_profit_bps=5)
            for opp in opportunities:
                await websocket.send_json({
                    "type": "arbitrage",
                    "event_title": opp.event_title,
                    "platform_a": opp.platform_a.value,
                    "platform_b": opp.platform_b.value,
                    "price_a": opp.price_a,
                    "price_b": opp.price_b,
                    "spread_bps": opp.spread_bps,
                    "profit_bps": opp.estimated_profit_bps,
                    "liquidity": opp.liquidity_available,
                    "detected_at": opp.detected_at.isoformat(),
                })
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error("arb_ws_error", error=str(e))


# ── Run ───────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "api.main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        reload=os.getenv("ENV") == "development",
        log_level="info",
    )
