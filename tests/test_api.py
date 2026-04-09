"""
API integration tests.
Tests actual HTTP endpoints through FastAPI's TestClient.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from api.main import app


@pytest.fixture
async def client():
    """Async test client that hits the real FastAPI app."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


class TestHealthEndpoint:
    """Test the health check endpoint."""

    @pytest.mark.asyncio
    async def test_health_returns_200(self, client):
        resp = await client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data
        assert "version" in data
        assert data["version"] == "1.0.0"
        assert "platforms" in data
        assert isinstance(data["platforms"], list)

    @pytest.mark.asyncio
    async def test_health_includes_dependencies(self, client):
        resp = await client.get("/health")
        data = resp.json()
        assert "dependencies" in data
        assert "database" in data["dependencies"]
        assert "redis" in data["dependencies"]

    @pytest.mark.asyncio
    async def test_health_includes_cache_stats(self, client):
        resp = await client.get("/health")
        data = resp.json()
        assert "cache_stats" in data


class TestMetricsEndpoint:
    """Test the Prometheus metrics endpoint."""

    @pytest.mark.asyncio
    async def test_metrics_returns_200(self, client):
        resp = await client.get("/metrics")
        assert resp.status_code == 200
        assert "omnisight" in resp.text


class TestMarketsEndpoint:
    """Test the /v1/markets endpoint."""

    @pytest.mark.asyncio
    async def test_list_markets_returns_200(self, client):
        resp = await client.get("/v1/markets")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.asyncio
    async def test_list_markets_with_platform_filter(self, client):
        resp = await client.get("/v1/markets", params={"platform": "polymarket"})
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_list_markets_invalid_platform(self, client):
        resp = await client.get("/v1/markets", params={"platform": "fake_exchange"})
        assert resp.status_code == 422  # Validation error

    @pytest.mark.asyncio
    async def test_list_markets_respects_limit(self, client):
        resp = await client.get("/v1/markets", params={"limit": 5})
        assert resp.status_code == 200
        assert len(resp.json()) <= 5


class TestTiersEndpoint:
    """Test the public tiers/pricing endpoint."""

    @pytest.mark.asyncio
    async def test_tiers_returns_all_plans(self, client):
        resp = await client.get("/v1/tiers")
        assert resp.status_code == 200
        data = resp.json()
        assert "tiers" in data
        tiers = data["tiers"]
        assert "free" in tiers
        assert "pro" in tiers
        assert "institutional" in tiers
        assert "enterprise" in tiers

    @pytest.mark.asyncio
    async def test_free_tier_has_price(self, client):
        resp = await client.get("/v1/tiers")
        free = resp.json()["tiers"]["free"]
        assert free["price"] == "$0/month"
        assert "features" in free


class TestUsageEndpoint:
    """Test the account usage endpoint."""

    @pytest.mark.asyncio
    async def test_usage_without_key_returns_free_tier(self, client):
        resp = await client.get("/v1/account/usage")
        assert resp.status_code == 200
        data = resp.json()
        assert data["tier"] == "free"


class TestProTierGating:
    """Test that pro-tier endpoints reject free-tier requests."""

    @pytest.mark.asyncio
    async def test_order_book_requires_pro(self, client):
        resp = await client.get("/v1/orderbook/test-123", params={"platform": "polymarket"})
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_arbitrage_requires_pro(self, client):
        resp = await client.get("/v1/arbitrage")
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_whale_alerts_requires_pro(self, client):
        resp = await client.get("/v1/whales/alerts")
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_microstructure_requires_pro(self, client):
        resp = await client.get("/v1/microstructure/test-123", params={"platform": "polymarket"})
        assert resp.status_code == 403


class TestNormalizedOdds:
    """Test the normalized odds endpoint (free tier)."""

    @pytest.mark.asyncio
    async def test_normalized_odds_returns_200(self, client):
        resp = await client.get("/v1/odds/normalized")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


class TestResolutions:
    """Test resolution tracking endpoints (free tier)."""

    @pytest.mark.asyncio
    async def test_recent_resolutions_returns_200(self, client):
        resp = await client.get("/v1/resolutions/recent")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.asyncio
    async def test_resolution_stats_returns_200(self, client):
        resp = await client.get("/v1/resolutions/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_resolutions" in data


class TestResponseHeaders:
    """Test that responses include expected headers."""

    @pytest.mark.asyncio
    async def test_server_timing_header(self, client):
        resp = await client.get("/health")
        assert "server-timing" in resp.headers

    @pytest.mark.asyncio
    async def test_cors_headers(self, client):
        resp = await client.options(
            "/v1/markets",
            headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
        )
        # CORS middleware should allow the origin
        assert resp.status_code in (200, 204)
