"""
OmniSight — Redis Cache Layer
TTL-based caching with serialization, stampede protection, and health checks.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from typing import Any, Callable, Optional

import redis.asyncio as aioredis
import structlog

from api.config import get_settings

logger = structlog.get_logger(__name__)

_redis: Optional[aioredis.Redis] = None
_lock_registry: dict[str, asyncio.Lock] = {}


async def init_redis() -> None:
    """Initialize the Redis connection pool."""
    global _redis
    settings = get_settings()
    _redis = aioredis.from_url(
        settings.redis.url,
        max_connections=settings.redis.max_connections,
        socket_timeout=settings.redis.socket_timeout,
        decode_responses=True,
    )
    # Verify connection
    try:
        await _redis.ping()
        logger.info("redis_initialized", url=settings.redis.url.split("@")[-1])
    except Exception as e:
        logger.error("redis_connection_failed", error=str(e))
        _redis = None
        raise


async def close_redis() -> None:
    """Close the Redis connection pool."""
    global _redis
    if _redis:
        await _redis.aclose()
        logger.info("redis_closed")
    _redis = None


def get_redis() -> aioredis.Redis:
    if _redis is None:
        raise RuntimeError("Redis not initialized. Call init_redis() first.")
    return _redis


async def check_redis_health() -> dict:
    """Run a lightweight health check against Redis."""
    if _redis is None:
        return {"status": "not_initialized", "healthy": False}
    try:
        start = time.monotonic()
        await _redis.ping()
        latency_ms = (time.monotonic() - start) * 1000
        info = await _redis.info("memory")
        return {
            "status": "healthy",
            "healthy": True,
            "latency_ms": round(latency_ms, 2),
            "used_memory_mb": round(info.get("used_memory", 0) / 1024 / 1024, 2),
        }
    except Exception as e:
        logger.error("redis_health_check_failed", error=str(e))
        return {"status": "unhealthy", "healthy": False, "error": str(e)}


def _cache_key(prefix: str, *args: Any, **kwargs: Any) -> str:
    """Generate a deterministic cache key from arguments."""
    raw = json.dumps({"args": args, "kwargs": kwargs}, sort_keys=True, default=str)
    key_hash = hashlib.sha256(raw.encode()).hexdigest()[:16]
    return f"omnisight:{prefix}:{key_hash}"


class Cache:
    """
    Application cache with TTL, stampede protection, and metrics.

    Usage:
        cache = Cache()

        # Simple get/set
        await cache.set("key", {"data": "value"}, ttl=60)
        data = await cache.get("key")

        # Decorator
        @cache.cached(prefix="markets", ttl=10)
        async def get_markets(platform: str):
            ...
    """

    def __init__(self):
        self._hits = 0
        self._misses = 0

    async def get(self, key: str) -> Optional[Any]:
        """Get a value from cache. Returns None on miss."""
        r = get_redis()
        try:
            raw = await r.get(key)
            if raw is not None:
                self._hits += 1
                return json.loads(raw)
            self._misses += 1
            return None
        except (aioredis.RedisError, json.JSONDecodeError) as e:
            logger.warning("cache_get_error", key=key, error=str(e))
            return None

    async def set(self, key: str, value: Any, ttl: int = 60) -> None:
        """Set a value in cache with TTL in seconds."""
        r = get_redis()
        try:
            raw = json.dumps(value, default=str)
            await r.setex(key, ttl, raw)
        except (aioredis.RedisError, TypeError) as e:
            logger.warning("cache_set_error", key=key, error=str(e))

    async def delete(self, key: str) -> None:
        """Delete a key from cache."""
        r = get_redis()
        try:
            await r.delete(key)
        except aioredis.RedisError as e:
            logger.warning("cache_delete_error", key=key, error=str(e))

    async def invalidate_prefix(self, prefix: str) -> int:
        """Delete all keys matching a prefix. Returns count deleted."""
        r = get_redis()
        try:
            cursor = 0
            deleted = 0
            while True:
                cursor, keys = await r.scan(cursor, match=f"omnisight:{prefix}:*", count=100)
                if keys:
                    deleted += await r.delete(*keys)
                if cursor == 0:
                    break
            return deleted
        except aioredis.RedisError as e:
            logger.warning("cache_invalidate_error", prefix=prefix, error=str(e))
            return 0

    def cached(self, prefix: str, ttl: int = 60):
        """
        Decorator for caching async function results.
        Includes stampede protection — only one caller computes on miss.
        """
        def decorator(func: Callable):
            async def wrapper(*args, **kwargs):
                key = _cache_key(prefix, *args, **kwargs)

                # Try cache first
                result = await self.get(key)
                if result is not None:
                    return result

                # Stampede protection: only one coroutine computes the value
                if key not in _lock_registry:
                    _lock_registry[key] = asyncio.Lock()
                lock = _lock_registry[key]

                async with lock:
                    # Double-check after acquiring lock
                    result = await self.get(key)
                    if result is not None:
                        return result

                    # Compute and cache
                    result = await func(*args, **kwargs)
                    await self.set(key, result, ttl)

                    # Clean up lock registry to prevent memory leak
                    if not lock.locked():
                        _lock_registry.pop(key, None)

                    return result
            wrapper.__name__ = func.__name__
            wrapper.__qualname__ = func.__qualname__
            return wrapper
        return decorator

    @property
    def stats(self) -> dict:
        total = self._hits + self._misses
        return {
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": round(self._hits / total, 4) if total > 0 else 0,
            "total_requests": total,
        }


# Singleton
cache = Cache()
