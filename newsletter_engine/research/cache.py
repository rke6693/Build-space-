"""Search result caching layer.

Caches web search results to avoid burning API quota on re-runs,
debugging, or duplicate queries. Uses a simple SQLite TTL cache.

Default TTL: 6 hours (search results for prediction markets go stale fast).
"""

import hashlib
import json
import logging
import sqlite3
import time
from pathlib import Path
from typing import Optional

from ..config import Config

logger = logging.getLogger(__name__)

CACHE_SCHEMA = """
CREATE TABLE IF NOT EXISTS search_cache (
    key TEXT PRIMARY KEY,
    query TEXT NOT NULL,
    results TEXT NOT NULL,
    created_at REAL NOT NULL,
    ttl_seconds REAL NOT NULL
);
"""


class SearchCache:
    """TTL-based cache for web search results."""

    def __init__(
        self,
        cache_path: Optional[Path] = None,
        default_ttl: float = 6 * 3600,  # 6 hours
    ):
        self.cache_path = cache_path or (Config.NEWSLETTER_DIR / ".search_cache.db")
        self.default_ttl = default_ttl
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()
        self._hits = 0
        self._misses = 0

    def _init_db(self):
        conn = sqlite3.connect(str(self.cache_path))
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(CACHE_SCHEMA)
        conn.close()

    def _get_conn(self) -> sqlite3.Connection:
        return sqlite3.connect(str(self.cache_path), timeout=5.0)

    @staticmethod
    def _cache_key(query: str) -> str:
        """Generate a cache key from a search query."""
        normalized = query.strip().lower()
        return hashlib.sha256(normalized.encode()).hexdigest()[:16]

    def get(self, query: str) -> Optional[list[dict]]:
        """Get cached search results for a query.

        Returns None on cache miss or expired entry.
        """
        key = self._cache_key(query)
        conn = self._get_conn()
        try:
            row = conn.execute(
                "SELECT results, created_at, ttl_seconds FROM search_cache WHERE key = ?",
                (key,),
            ).fetchone()

            if row is None:
                self._misses += 1
                return None

            results_json, created_at, ttl = row
            if time.time() - created_at > ttl:
                # Expired — delete and miss
                conn.execute("DELETE FROM search_cache WHERE key = ?", (key,))
                conn.commit()
                self._misses += 1
                return None

            self._hits += 1
            return json.loads(results_json)
        finally:
            conn.close()

    def put(self, query: str, results: list[dict], ttl: Optional[float] = None):
        """Cache search results for a query."""
        key = self._cache_key(query)
        ttl = ttl or self.default_ttl
        conn = self._get_conn()
        try:
            conn.execute(
                "INSERT OR REPLACE INTO search_cache (key, query, results, created_at, ttl_seconds) "
                "VALUES (?, ?, ?, ?, ?)",
                (key, query, json.dumps(results), time.time(), ttl),
            )
            conn.commit()
        finally:
            conn.close()

    def clear_expired(self) -> int:
        """Remove all expired entries. Returns count deleted."""
        conn = self._get_conn()
        try:
            now = time.time()
            cursor = conn.execute(
                "DELETE FROM search_cache WHERE (? - created_at) > ttl_seconds",
                (now,),
            )
            conn.commit()
            deleted = cursor.rowcount
            if deleted > 0:
                logger.info(f"Cache: cleared {deleted} expired entries")
            return deleted
        finally:
            conn.close()

    def clear_all(self) -> int:
        """Clear the entire cache."""
        conn = self._get_conn()
        try:
            cursor = conn.execute("DELETE FROM search_cache")
            conn.commit()
            return cursor.rowcount
        finally:
            conn.close()

    def stats(self) -> dict:
        """Return cache statistics."""
        conn = self._get_conn()
        try:
            total = conn.execute("SELECT COUNT(*) FROM search_cache").fetchone()[0]
            now = time.time()
            valid = conn.execute(
                "SELECT COUNT(*) FROM search_cache WHERE (? - created_at) <= ttl_seconds",
                (now,),
            ).fetchone()[0]
            return {
                "total_entries": total,
                "valid_entries": valid,
                "expired_entries": total - valid,
                "session_hits": self._hits,
                "session_misses": self._misses,
                "hit_rate": (
                    f"{self._hits / (self._hits + self._misses):.0%}"
                    if (self._hits + self._misses) > 0
                    else "N/A"
                ),
            }
        finally:
            conn.close()
