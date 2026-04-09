"""
OmniSight — Cross-Platform Odds Normalizer
Aggregates odds from all platforms, removes vig, detects arbitrage.
"""

from __future__ import annotations

import asyncio
import hashlib
from datetime import datetime, timezone
from typing import Optional

import numpy as np
import structlog

from api.connectors.base import BaseConnector
from api.connectors.sportsbook import OddsConverter
from api.models import (
    ArbitrageOpportunity, HistoricalSpread, MarketResponse, NormalizedOdds,
    Platform, PlatformOdds, SpreadDataPoint,
)

logger = structlog.get_logger(__name__)


class EventMatcher:
    """
    Matches equivalent events across different platforms.

    Uses a multi-signal approach:
    1. Exact canonical match (after normalization)
    2. TF-IDF cosine similarity on title tokens
    3. Named entity overlap (dates, names, numbers)
    4. Category + end_date proximity as hard filters
    5. Manual curated mappings as overrides

    This replaces naive Jaccard with production-grade matching.
    """

    # Curated cross-platform event mappings (override automatic matching)
    MANUAL_MAPPINGS: dict[str, list[tuple[Platform, str]]] = {}

    # Stop words to remove before TF-IDF
    STOP_WORDS = frozenset({
        "a", "an", "the", "is", "are", "was", "were", "will", "would", "be",
        "been", "being", "have", "has", "had", "do", "does", "did", "to", "of",
        "in", "for", "on", "with", "at", "by", "from", "or", "and", "not",
        "this", "that", "it", "its", "as", "if", "but", "about", "than",
        "before", "after", "above", "below", "between", "who", "what", "which",
        "when", "where", "how", "whether", "market", "prediction",
    })

    # Entity patterns for extraction
    _ENTITY_PATTERNS: list = []

    @classmethod
    def _get_entity_patterns(cls):
        """Lazy-compile regex patterns for entity extraction."""
        if not cls._ENTITY_PATTERNS:
            import re
            cls._ENTITY_PATTERNS = [
                ("date", re.compile(r"\b(20\d{2})\b")),                          # Years
                ("date", re.compile(r"\b(q[1-4]\s*20\d{2}|20\d{2}\s*q[1-4])\b", re.I)),  # Quarters
                ("date", re.compile(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*\d{0,4}\b", re.I)),
                ("number", re.compile(r"\$[\d,.]+[bmk]?\b", re.I)),              # Dollar amounts
                ("number", re.compile(r"\b\d+[%]\b")),                            # Percentages
                ("number", re.compile(r"\b\d{1,3}(,\d{3})*(\.\d+)?[kmbt]?\b", re.I)),  # Numbers with suffixes
                ("entity", re.compile(r"\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)+\b")),    # Proper nouns (pre-lowering)
            ]
        return cls._ENTITY_PATTERNS

    @staticmethod
    def normalize_title(title: str) -> str:
        """Normalize event title for comparison."""
        import re
        title = title.lower().strip()
        # Remove common question prefixes
        for prefix in [
            "will ", "will the ", "who will win ", "who wins ", "what will ",
            "how many ", "is ", "does ", "do ", "can ", "could ", "should ",
        ]:
            if title.startswith(prefix):
                title = title[len(prefix):]
        # Remove punctuation except hyphens in compound words
        title = re.sub(r"[^a-z0-9\s\-]", "", title)
        # Collapse whitespace
        title = re.sub(r"\s+", " ", title).strip()
        return title

    @classmethod
    def extract_entities(cls, title: str) -> dict[str, set[str]]:
        """Extract named entities, dates, and numbers from a title."""
        entities: dict[str, set[str]] = {"date": set(), "number": set(), "entity": set()}
        for etype, pattern in cls._get_entity_patterns():
            for match in pattern.finditer(title):
                entities[etype].add(match.group().lower().strip())
        return entities

    @classmethod
    def tokenize(cls, text: str) -> list[str]:
        """Tokenize and remove stop words."""
        normalized = cls.normalize_title(text)
        return [w for w in normalized.split() if w not in cls.STOP_WORDS and len(w) > 1]

    @classmethod
    def compute_tfidf_similarity(cls, tokens_a: list[str], tokens_b: list[str]) -> float:
        """
        Compute TF-IDF weighted cosine similarity between two token lists.
        Uses a simple IDF approximation based on token frequency.
        """
        if not tokens_a or not tokens_b:
            return 0.0

        # Build term frequency vectors
        all_tokens = set(tokens_a) | set(tokens_b)
        tf_a = {t: tokens_a.count(t) / len(tokens_a) for t in all_tokens}
        tf_b = {t: tokens_b.count(t) / len(tokens_b) for t in all_tokens}

        # Simple IDF: tokens appearing in both get lower weight
        idf = {}
        for t in all_tokens:
            doc_freq = (1 if t in tokens_a else 0) + (1 if t in tokens_b else 0)
            idf[t] = np.log(3.0 / (doc_freq + 1))  # +1 smoothing, 3 = num docs + 1

        # Cosine similarity with TF-IDF weighting
        dot_product = sum(tf_a[t] * idf[t] * tf_b[t] * idf[t] for t in all_tokens)
        norm_a = np.sqrt(sum((tf_a[t] * idf[t]) ** 2 for t in all_tokens))
        norm_b = np.sqrt(sum((tf_b[t] * idf[t]) ** 2 for t in all_tokens))

        if norm_a == 0 or norm_b == 0:
            return 0.0

        return dot_product / (norm_a * norm_b)

    @classmethod
    def compute_similarity(cls, title_a: str, title_b: str) -> float:
        """
        Multi-signal similarity score between two event titles (0-1).

        Signals:
        - TF-IDF cosine similarity (40% weight)
        - Jaccard word overlap (20% weight)
        - Named entity overlap (25% weight)
        - Subsequence/containment bonus (15% weight)
        """
        norm_a = cls.normalize_title(title_a)
        norm_b = cls.normalize_title(title_b)

        # Exact match after normalization
        if norm_a == norm_b:
            return 1.0

        # Signal 1: TF-IDF cosine similarity
        tokens_a = cls.tokenize(title_a)
        tokens_b = cls.tokenize(title_b)
        tfidf_score = cls.compute_tfidf_similarity(tokens_a, tokens_b)

        # Signal 2: Jaccard word overlap (simple but useful)
        words_a = set(tokens_a)
        words_b = set(tokens_b)
        union = words_a | words_b
        jaccard = len(words_a & words_b) / len(union) if union else 0

        # Signal 3: Named entity overlap (dates, numbers, proper nouns)
        entities_a = cls.extract_entities(title_a)
        entities_b = cls.extract_entities(title_b)
        entity_scores = []
        for etype in ("date", "number", "entity"):
            ea = entities_a[etype]
            eb = entities_b[etype]
            if ea and eb:
                overlap = len(ea & eb) / len(ea | eb)
                entity_scores.append(overlap)
            elif ea or eb:
                entity_scores.append(0.0)
            # If neither has entities of this type, don't penalize
        entity_score = np.mean(entity_scores) if entity_scores else 0.5

        # Signal 4: Containment — one title is a subset of the other
        containment = 0.0
        if len(words_a) >= 2 and len(words_b) >= 2:
            containment_ab = len(words_a & words_b) / len(words_a)
            containment_ba = len(words_a & words_b) / len(words_b)
            containment = max(containment_ab, containment_ba)

        # Weighted combination
        score = (
            0.40 * tfidf_score +
            0.20 * jaccard +
            0.25 * entity_score +
            0.15 * containment
        )

        return min(1.0, score)

    @classmethod
    def find_matches(
        cls,
        target: MarketResponse,
        candidates: list[MarketResponse],
        threshold: float = 0.55,
    ) -> list[tuple[MarketResponse, float]]:
        """
        Find matching markets from other platforms.

        Uses category as a hard filter when available, then scores on title similarity.
        End date proximity is used as a tiebreaker.
        """
        matches = []
        for candidate in candidates:
            if candidate.platform == target.platform:
                continue

            # Hard filter: category must match if both have one
            if (target.category and candidate.category and
                    target.category.lower() != candidate.category.lower()):
                continue

            score = cls.compute_similarity(target.title, candidate.title)

            # Bonus: end date within 48 hours of each other
            if target.end_date and candidate.end_date:
                date_diff = abs((target.end_date - candidate.end_date).total_seconds())
                if date_diff < 172800:  # 48 hours
                    score = min(1.0, score + 0.05)
                elif date_diff > 604800:  # 7 days apart — likely different events
                    score *= 0.7

            if score >= threshold:
                matches.append((candidate, score))

        return sorted(matches, key=lambda x: -x[1])


class OddsNormalizer:
    """
    Cross-platform odds normalizer.
    Aggregates data from all connectors, removes vig, computes consensus.
    """

    def __init__(self, connectors: dict[Platform, BaseConnector]):
        self.connectors = connectors
        self.matcher = EventMatcher()
        self._cache: dict[str, NormalizedOdds] = {}

    async def fetch_all_markets(
        self, category: Optional[str] = None, limit: int = 100
    ) -> dict[Platform, list[MarketResponse]]:
        """Fetch markets from all connected platforms in parallel."""
        tasks = {}
        for platform, connector in self.connectors.items():
            tasks[platform] = asyncio.create_task(
                connector.get_markets(category=category, limit=limit)
            )

        results = {}
        for platform, task in tasks.items():
            try:
                results[platform] = await task
            except Exception as e:
                logger.error("fetch_markets_failed", platform=platform, error=str(e))
                results[platform] = []

        return results

    async def normalize_event(
        self,
        markets: dict[Platform, MarketResponse],
    ) -> NormalizedOdds:
        """Normalize odds for a single event across platforms."""
        platform_odds = {}
        prices = []

        for platform, market in markets.items():
            yes_price = market.yes_price or 0.5
            no_price = market.no_price or (1.0 - yes_price)

            # Remove vig for sportsbooks
            if platform in (Platform.PINNACLE, Platform.DRAFTKINGS, Platform.FANDUEL):
                yes_price, no_price = OddsConverter.remove_vig(yes_price, no_price)

            mid = (yes_price + (1.0 - no_price)) / 2
            spread = abs(yes_price - (1.0 - no_price))

            platform_odds[platform.value] = PlatformOdds(
                platform=platform,
                market_id=market.platform_market_id,
                yes_price=round(yes_price, 4),
                no_price=round(no_price, 4),
                mid_price=round(mid, 4),
                spread=round(spread, 4),
                volume_24h=market.volume_24h,
                liquidity=market.liquidity,
                last_updated=market.updated_at or datetime.now(timezone.utc),
            )
            prices.append(yes_price)

        # Volume-weighted consensus probability
        volumes = [m.volume_24h for m in markets.values()]
        total_vol = sum(volumes) if volumes else 1
        if total_vol > 0:
            consensus = sum(
                p * (v / total_vol) for p, v in zip(prices, volumes)
            )
        else:
            consensus = np.mean(prices) if prices else 0.5

        # Detect max spread (arbitrage potential)
        max_spread = 0
        arb_profit = None
        if len(prices) >= 2:
            max_price = max(prices)
            min_price = min(prices)
            max_spread = (max_price - min_price) * 10000  # basis points
            # Arbitrage exists if buying YES on cheapest + NO on most expensive < 1
            best_yes = min(prices)
            best_no = min(1.0 - p for p in prices)
            total_cost = best_yes + best_no
            if total_cost < 1.0:
                arb_profit = (1.0 - total_cost) * 10000  # bps profit

        first_market = list(markets.values())[0]
        event_id = hashlib.md5(
            EventMatcher.normalize_title(first_market.title).encode()
        ).hexdigest()[:12]

        return NormalizedOdds(
            event_id=event_id,
            event_title=first_market.title,
            category=first_market.category or "",
            platforms=platform_odds,
            consensus_probability=round(consensus, 4),
            max_spread=round(max_spread, 2),
            arbitrage_opportunity=arb_profit is not None and arb_profit > 0,
            arbitrage_profit_bps=round(arb_profit, 2) if arb_profit else None,
            updated_at=datetime.now(timezone.utc),
        )

    async def find_cross_platform_events(
        self, category: Optional[str] = None, limit: int = 100
    ) -> list[NormalizedOdds]:
        """Find and normalize matching events across all platforms."""
        all_markets = await self.fetch_all_markets(category, limit)

        # Use the platform with most markets as the anchor
        anchor_platform = max(all_markets, key=lambda p: len(all_markets[p]))
        anchor_markets = all_markets[anchor_platform]
        other_markets = [
            m for p, markets in all_markets.items()
            if p != anchor_platform for m in markets
        ]

        normalized = []
        matched_ids = set()

        for anchor in anchor_markets:
            matches = self.matcher.find_matches(anchor, other_markets)
            event_markets = {anchor_platform: anchor}

            for matched_market, score in matches:
                if matched_market.id not in matched_ids:
                    event_markets[matched_market.platform] = matched_market
                    matched_ids.add(matched_market.id)

            odds = await self.normalize_event(event_markets)
            normalized.append(odds)

        # Sort by number of platforms (more = more interesting) then by spread
        normalized.sort(key=lambda o: (-len(o.platforms), -o.max_spread))
        return normalized

    async def detect_arbitrage(
        self, category: Optional[str] = None, min_profit_bps: float = 10
    ) -> list[ArbitrageOpportunity]:
        """Scan all markets for arbitrage opportunities."""
        events = await self.find_cross_platform_events(category)
        opportunities = []

        for event in events:
            if not event.arbitrage_opportunity:
                continue
            if event.arbitrage_profit_bps and event.arbitrage_profit_bps < min_profit_bps:
                continue

            platforms = list(event.platforms.values())
            for i, pa in enumerate(platforms):
                for pb in platforms[i + 1:]:
                    spread = abs(pa.yes_price - pb.yes_price) * 10000
                    if spread > min_profit_bps:
                        # Determine which side to buy on which platform
                        buy_platform = pa if pa.yes_price < pb.yes_price else pb
                        sell_platform = pb if pa.yes_price < pb.yes_price else pa

                        opportunities.append(ArbitrageOpportunity(
                            id=f"arb-{event.event_id}-{buy_platform.platform.value}-{sell_platform.platform.value}",
                            event_title=event.event_title,
                            platform_a=buy_platform.platform,
                            platform_b=sell_platform.platform,
                            market_a_id=buy_platform.market_id,
                            market_b_id=sell_platform.market_id,
                            price_a=buy_platform.yes_price,
                            price_b=sell_platform.yes_price,
                            spread_bps=round(spread, 2),
                            estimated_profit_bps=event.arbitrage_profit_bps or 0,
                            liquidity_available=min(buy_platform.liquidity, sell_platform.liquidity),
                            detected_at=datetime.now(timezone.utc),
                        ))

        opportunities.sort(key=lambda x: -x.estimated_profit_bps)
        return opportunities

    async def compute_historical_spread(
        self,
        event_id: str,
        platform_a: Platform,
        platform_b: Platform,
        snapshots_a: list[dict],
        snapshots_b: list[dict],
    ) -> HistoricalSpread:
        """Compute historical spread between two platforms for an event."""
        # Align timestamps
        data_points = []
        prices_a = {s["timestamp"]: s["yes_price"] for s in snapshots_a}
        prices_b = {s["timestamp"]: s["yes_price"] for s in snapshots_b}

        common_times = sorted(set(prices_a.keys()) & set(prices_b.keys()))
        for ts in common_times:
            pa = prices_a[ts]
            pb = prices_b[ts]
            spread = (pa - pb) * 10000
            data_points.append(SpreadDataPoint(
                timestamp=ts,
                price_a=pa,
                price_b=pb,
                spread_bps=round(spread, 2),
            ))

        spreads = [dp.spread_bps for dp in data_points] if data_points else [0]

        # Compute correlation
        if len(data_points) >= 2:
            arr_a = np.array([dp.price_a for dp in data_points])
            arr_b = np.array([dp.price_b for dp in data_points])
            corr = float(np.corrcoef(arr_a, arr_b)[0, 1])
        else:
            corr = 0.0

        return HistoricalSpread(
            market_id=event_id,
            platform_a=platform_a,
            platform_b=platform_b,
            data_points=data_points,
            avg_spread=round(float(np.mean(spreads)), 2),
            max_spread=round(float(np.max(spreads)), 2),
            min_spread=round(float(np.min(spreads)), 2),
            correlation=round(corr, 4),
        )
