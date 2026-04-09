"""
OmniSight — Authentication & Rate Limiting Middleware
Handles API key validation, tier-based rate limiting, and usage tracking.
"""

from __future__ import annotations

import hashlib
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, Request, Security
from fastapi.security import APIKeyHeader
import structlog

from api.models import APIUsageStats, TierLevel

logger = structlog.get_logger(__name__)

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


# Tier configuration
TIER_CONFIG = {
    TierLevel.FREE: {
        "rate_limit_per_minute": 60,
        "daily_limit": 1000,
        "websocket_connections": 1,
        "historical_data_days": 7,
        "order_book_depth": 5,
        "features": ["markets", "basic_odds"],
    },
    TierLevel.PRO: {
        "rate_limit_per_minute": 600,
        "daily_limit": 50_000,
        "websocket_connections": 5,
        "historical_data_days": 365,
        "order_book_depth": 50,
        "features": ["markets", "odds", "historical", "order_book", "whale_alerts", "arbitrage"],
    },
    TierLevel.INSTITUTIONAL: {
        "rate_limit_per_minute": 6000,
        "daily_limit": 1_000_000,
        "websocket_connections": 50,
        "historical_data_days": -1,  # unlimited
        "order_book_depth": -1,  # full depth
        "features": ["*"],
    },
    TierLevel.ENTERPRISE: {
        "rate_limit_per_minute": -1,  # unlimited
        "daily_limit": -1,
        "websocket_connections": -1,
        "historical_data_days": -1,
        "order_book_depth": -1,
        "features": ["*"],
    },
}


class RateLimiter:
    """Sliding window rate limiter backed by in-memory store."""

    def __init__(self):
        # {api_key: [(timestamp, count)]}
        self._windows: dict[str, list[tuple[float, int]]] = defaultdict(list)
        self._daily_counts: dict[str, int] = defaultdict(int)
        self._daily_reset: dict[str, float] = {}

    def check_rate_limit(self, api_key: str, tier: TierLevel) -> tuple[bool, dict]:
        """Check if request is within rate limits. Returns (allowed, headers)."""
        config = TIER_CONFIG[tier]
        rpm = config["rate_limit_per_minute"]
        daily = config["daily_limit"]

        # Unlimited
        if rpm == -1:
            return True, {"X-RateLimit-Limit": "unlimited", "X-RateLimit-Remaining": "unlimited"}

        now = time.time()
        window_start = now - 60

        # Clean old entries
        self._windows[api_key] = [
            (ts, c) for ts, c in self._windows[api_key] if ts > window_start
        ]

        current_count = sum(c for _, c in self._windows[api_key])

        # Check daily limit
        if api_key not in self._daily_reset or now - self._daily_reset[api_key] > 86400:
            self._daily_counts[api_key] = 0
            self._daily_reset[api_key] = now

        if daily > 0 and self._daily_counts[api_key] >= daily:
            return False, {
                "X-RateLimit-Limit": str(rpm),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(int(self._daily_reset[api_key] + 86400)),
                "Retry-After": "3600",
            }

        if current_count >= rpm:
            retry_after = int(60 - (now - self._windows[api_key][0][0])) + 1
            return False, {
                "X-RateLimit-Limit": str(rpm),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(int(now + retry_after)),
                "Retry-After": str(retry_after),
            }

        # Record request
        self._windows[api_key].append((now, 1))
        self._daily_counts[api_key] += 1
        remaining = rpm - current_count - 1

        return True, {
            "X-RateLimit-Limit": str(rpm),
            "X-RateLimit-Remaining": str(max(0, remaining)),
            "X-RateLimit-Reset": str(int(now + 60)),
        }


class AuthManager:
    """Manages API key authentication and usage tracking."""

    def __init__(self):
        self.rate_limiter = RateLimiter()
        # In-memory key store (production: backed by DB)
        self._keys: dict[str, dict] = {}
        self._usage: dict[str, dict] = defaultdict(lambda: {
            "requests_today": 0,
            "requests_month": 0,
            "ws_connections": 0,
            "last_request": None,
        })

    def register_key(self, api_key: str, user_id: str, tier: TierLevel = TierLevel.FREE) -> str:
        """Register a new API key."""
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        self._keys[key_hash] = {
            "user_id": user_id,
            "tier": tier,
            "created_at": datetime.now(timezone.utc),
            "is_active": True,
        }
        return key_hash

    def validate_key(self, api_key: str) -> Optional[dict]:
        """Validate an API key and return its metadata."""
        if not api_key:
            return None
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        key_data = self._keys.get(key_hash)
        if key_data and key_data["is_active"]:
            return {**key_data, "key_hash": key_hash}
        return None

    def check_feature_access(self, tier: TierLevel, feature: str) -> bool:
        """Check if a tier has access to a specific feature."""
        features = TIER_CONFIG[tier]["features"]
        return "*" in features or feature in features

    def get_usage(self, api_key: str) -> APIUsageStats:
        key_data = self.validate_key(api_key)
        if not key_data:
            raise ValueError("Invalid API key")
        usage = self._usage[key_data["key_hash"]]
        return APIUsageStats(
            user_id=key_data["user_id"],
            tier=key_data["tier"],
            requests_today=usage["requests_today"],
            requests_this_month=usage["requests_month"],
            rate_limit=TIER_CONFIG[key_data["tier"]]["rate_limit_per_minute"],
            websocket_connections=usage["ws_connections"],
            last_request=usage["last_request"],
        )


# Singleton instances
_auth_manager = AuthManager()
_rate_limiter = RateLimiter()


async def get_api_key(
    request: Request,
    api_key: Optional[str] = Security(api_key_header),
) -> dict:
    """FastAPI dependency for API key authentication."""
    # Allow unauthenticated access for free tier
    if not api_key:
        return {"tier": TierLevel.FREE, "user_id": "anonymous", "key_hash": "anonymous"}

    key_data = _auth_manager.validate_key(api_key)
    if not key_data:
        raise HTTPException(status_code=401, detail="Invalid API key")

    # Rate limit check
    allowed, headers = _rate_limiter.check_rate_limit(key_data["key_hash"], key_data["tier"])
    for k, v in headers.items():
        request.state.__dict__[k] = v

    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded",
            headers=headers,
        )

    return key_data


def require_tier(min_tier: TierLevel):
    """Dependency factory: require minimum tier level."""
    tier_order = [TierLevel.FREE, TierLevel.PRO, TierLevel.INSTITUTIONAL, TierLevel.ENTERPRISE]

    async def check(key_data: dict = Security(get_api_key)):
        user_tier = key_data.get("tier", TierLevel.FREE)
        if tier_order.index(user_tier) < tier_order.index(min_tier):
            raise HTTPException(
                status_code=403,
                detail=f"This endpoint requires {min_tier.value} tier or higher. "
                       f"Current tier: {user_tier.value}. Upgrade at https://omnisight.dev/pricing",
            )
        return key_data

    return check
