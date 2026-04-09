"""
OmniSight — Prometheus Metrics
Instrumentation for API latency, throughput, cache performance, and platform health.
"""

from __future__ import annotations

from prometheus_client import (
    Counter,
    Gauge,
    Histogram,
    Info,
    generate_latest,
    CONTENT_TYPE_LATEST,
)

# ── Application Info ────────────────────────────────────────────

APP_INFO = Info("omnisight", "OmniSight Prediction Market Infrastructure")
APP_INFO.info({
    "version": "1.0.0",
    "service": "omnisight-api",
})

# ── HTTP Metrics ────────────────────────────────────────────────

HTTP_REQUESTS_TOTAL = Counter(
    "omnisight_http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status_code"],
)

HTTP_REQUEST_DURATION = Histogram(
    "omnisight_http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "endpoint"],
    buckets=[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)

HTTP_REQUESTS_IN_PROGRESS = Gauge(
    "omnisight_http_requests_in_progress",
    "Number of HTTP requests currently being processed",
    ["method"],
)

# ── WebSocket Metrics ───────────────────────────────────────────

WS_CONNECTIONS_ACTIVE = Gauge(
    "omnisight_ws_connections_active",
    "Active WebSocket connections",
    ["stream_type"],
)

WS_MESSAGES_SENT = Counter(
    "omnisight_ws_messages_sent_total",
    "Total WebSocket messages sent",
    ["stream_type"],
)

# ── Platform Connector Metrics ──────────────────────────────────

PLATFORM_REQUESTS_TOTAL = Counter(
    "omnisight_platform_requests_total",
    "Total requests to upstream platform APIs",
    ["platform", "endpoint", "status"],
)

PLATFORM_REQUEST_DURATION = Histogram(
    "omnisight_platform_request_duration_seconds",
    "Upstream platform API request duration",
    ["platform", "endpoint"],
    buckets=[0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0],
)

PLATFORM_CIRCUIT_STATE = Gauge(
    "omnisight_platform_circuit_breaker_state",
    "Circuit breaker state (0=closed, 1=half_open, 2=open)",
    ["platform"],
)

# ── Cache Metrics ───────────────────────────────────────────────

CACHE_HITS = Counter(
    "omnisight_cache_hits_total",
    "Total cache hits",
    ["cache_type"],
)

CACHE_MISSES = Counter(
    "omnisight_cache_misses_total",
    "Total cache misses",
    ["cache_type"],
)

# ── Business Metrics ────────────────────────────────────────────

MARKETS_TRACKED = Gauge(
    "omnisight_markets_tracked",
    "Number of markets currently being tracked",
    ["platform"],
)

ARBITRAGE_OPPORTUNITIES = Gauge(
    "omnisight_arbitrage_opportunities_active",
    "Number of active arbitrage opportunities",
)

WHALE_ALERTS_TOTAL = Counter(
    "omnisight_whale_alerts_total",
    "Total whale alerts detected",
    ["platform", "side"],
)

WHALE_VOLUME_USD = Counter(
    "omnisight_whale_volume_usd_total",
    "Total whale trade volume in USD",
    ["platform", "side"],
)

RESOLUTIONS_TOTAL = Counter(
    "omnisight_resolutions_total",
    "Total market resolutions tracked",
    ["platform", "outcome"],
)

# ── Data Freshness ──────────────────────────────────────────────

DATA_LAST_UPDATED = Gauge(
    "omnisight_data_last_updated_timestamp",
    "Timestamp of last successful data update",
    ["platform", "data_type"],
)

INGESTION_ERRORS = Counter(
    "omnisight_ingestion_errors_total",
    "Total data ingestion errors",
    ["platform", "error_type"],
)

# ── API Key / Tier Metrics ──────────────────────────────────────

API_REQUESTS_BY_TIER = Counter(
    "omnisight_api_requests_by_tier_total",
    "API requests by tier",
    ["tier"],
)

RATE_LIMIT_REJECTIONS = Counter(
    "omnisight_rate_limit_rejections_total",
    "Total requests rejected due to rate limiting",
    ["tier"],
)
