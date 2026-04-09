"""Tests for search result caching."""

import time
from pathlib import Path

import pytest

from newsletter_engine.research.cache import SearchCache


@pytest.fixture
def cache(tmp_path):
    return SearchCache(cache_path=tmp_path / "test_cache.db", default_ttl=60)


class TestSearchCache:
    def test_miss_on_empty(self, cache):
        assert cache.get("nonexistent query") is None

    def test_put_and_get(self, cache):
        results = [{"title": "Test", "snippet": "A test result"}]
        cache.put("test query", results)

        cached = cache.get("test query")
        assert cached == results

    def test_case_insensitive(self, cache):
        results = [{"title": "Test"}]
        cache.put("Bitcoin Price", results)

        assert cache.get("bitcoin price") == results
        assert cache.get("BITCOIN PRICE") == results

    def test_ttl_expiry(self, tmp_path):
        cache = SearchCache(cache_path=tmp_path / "test.db", default_ttl=0.1)
        cache.put("query", [{"result": 1}])

        assert cache.get("query") is not None

        time.sleep(0.2)
        assert cache.get("query") is None

    def test_clear_expired(self, tmp_path):
        cache = SearchCache(cache_path=tmp_path / "test.db", default_ttl=0.1)
        cache.put("q1", [{"r": 1}])
        cache.put("q2", [{"r": 2}])

        time.sleep(0.2)
        deleted = cache.clear_expired()
        assert deleted == 2

    def test_clear_all(self, cache):
        cache.put("q1", [{"r": 1}])
        cache.put("q2", [{"r": 2}])

        deleted = cache.clear_all()
        assert deleted == 2
        assert cache.get("q1") is None

    def test_overwrite_existing(self, cache):
        cache.put("query", [{"v": 1}])
        cache.put("query", [{"v": 2}])

        assert cache.get("query") == [{"v": 2}]

    def test_stats(self, cache):
        cache.put("q1", [{"r": 1}])
        cache.get("q1")  # hit
        cache.get("q2")  # miss

        stats = cache.stats()
        assert stats["total_entries"] == 1
        assert stats["session_hits"] == 1
        assert stats["session_misses"] == 1
        assert stats["hit_rate"] == "50%"

    def test_different_queries_different_keys(self, cache):
        cache.put("query one", [{"r": 1}])
        cache.put("query two", [{"r": 2}])

        assert cache.get("query one") == [{"r": 1}]
        assert cache.get("query two") == [{"r": 2}]
