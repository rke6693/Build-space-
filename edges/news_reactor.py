"""News reactor — classify fresh headlines, map to active markets, fire.

Pipeline each cycle:
  1. Poll RSS feeds -> new headlines since last tick.
  2. Pull all active non-crypto Polymarket markets (< 14 days to exp).
  3. For each fresh headline, call Claude Haiku 4.5 with:
        * headline + summary
        * shortlist of markets whose keywords overlap the headline
        * ask for JSON: which market (if any), direction, confidence
  4. If confidence >= threshold, emit TradeIntent.

Cost control:
  * Haiku is cheap (~$0.25/M input, $1.25/M output). We cap daily spend
    at CLAUDE_MAX_SPEND_USD_DAILY in the config; once hit we stop calling
    the API until UTC midnight.
  * We shortlist markets to <=20 per call via keyword overlap so prompts
    stay small.
"""
from __future__ import annotations

import asyncio
import json
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set

from anthropic import AsyncAnthropic

from core.config import get_settings
from core.logger import get_logger
from core.polymarket_client import PolymarketClient
from core.risk import TradeIntent
from data.news_sources import NewsItem, NewsPoller
from data.polymarket_gamma import GammaClient, GammaMarket

from .base import Edge

log = get_logger("news_reactor")


# Approximate Haiku 4.5 pricing per 1M tokens (USD)
HAIKU_INPUT_PER_M = 1.0
HAIKU_OUTPUT_PER_M = 5.0


@dataclass
class Classification:
    market_condition_id: str
    side: str                 # "YES" or "NO"
    confidence: float         # 0..1
    rationale: str


CLASSIFIER_SYSTEM = """You are an event-driven prediction-market analyst.

Given a news headline and a shortlist of live Polymarket markets, decide
if the headline gives a clear, directional edge on any of those markets.

Rules:
- Be conservative. Only respond with a market if the headline materially
  moves the probability by at least 8 percentage points.
- Prefer markets whose resolution depends directly on the event described.
- Your confidence (0..1) should reflect the probability the market will
  resolve YES or NO given this news, NOT your opinion of the edge size.
- If no market is clearly impacted, respond with null.

Respond with a single JSON object, no prose:
{
  "market_condition_id": "<id or null>",
  "side": "YES" | "NO" | null,
  "confidence": <0..1 or null>,
  "rationale": "<one short sentence>"
}
"""


def _keywords(text: str) -> Set[str]:
    text = text.lower()
    return set(re.findall(r"[a-z][a-z0-9\-]{3,}", text))


class NewsReactorEdge(Edge):
    name = "news_reactor"

    def __init__(
        self,
        *,
        gamma: GammaClient,
        poly: PolymarketClient,
    ) -> None:
        self.gamma = gamma
        self.poly = poly
        self.settings = get_settings()
        self.poller = NewsPoller()
        self.claude: Optional[AsyncAnthropic] = None
        if self.settings.anthropic_api_key:
            self.claude = AsyncAnthropic(api_key=self.settings.anthropic_api_key)
        else:
            log.warning("news_reactor.no_claude_key")

        self._spend_today_usd: float = 0.0
        self._spend_day: str = ""

    # ---- budget ----
    def _spend_key(self) -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def _maybe_reset_spend(self) -> None:
        today = self._spend_key()
        if today != self._spend_day:
            self._spend_day = today
            self._spend_today_usd = 0.0

    def _under_budget(self) -> bool:
        self._maybe_reset_spend()
        return self._spend_today_usd < self.settings.claude_max_spend_usd_daily

    def _record_spend(self, input_tokens: int, output_tokens: int) -> None:
        self._maybe_reset_spend()
        cost = (input_tokens / 1_000_000) * HAIKU_INPUT_PER_M + (
            output_tokens / 1_000_000
        ) * HAIKU_OUTPUT_PER_M
        self._spend_today_usd += cost

    # ---- main scan ----
    async def scan(self) -> List[TradeIntent]:
        if self.claude is None or not self._under_budget():
            return []

        news = await self.poller.poll()
        if not news:
            return []
        log.info("news_reactor.news", count=len(news))

        # Only last 30 minutes
        cutoff = time.time() - 30 * 60
        news = [n for n in news if n.published >= cutoff]
        if not news:
            return []

        markets = await self.gamma.list_markets(limit=400)
        # Filter: not crypto (handled by crypto_lag), resolves within 14 days,
        # has liquidity
        markets = [
            m for m in markets
            if m.liquidity >= 1000
            and not re.search(r"bitcoin|btc|ethereum|eth|solana|sol", m.question, re.I)
            and (m.hours_to_resolution() or 999) < 24 * 14
        ]
        if not markets:
            return []

        intents: List[TradeIntent] = []
        for item in news[:10]:   # cap per cycle
            if not self._under_budget():
                log.warning("news_reactor.budget_exhausted")
                break

            shortlist = self._shortlist(item, markets, top_k=15)
            if not shortlist:
                continue

            cls = await self._classify(item, shortlist)
            if cls is None or cls.confidence < 0.60:
                continue

            market = next(
                (m for m in shortlist if m.condition_id == cls.market_condition_id),
                None,
            )
            if market is None:
                continue

            tid = market.yes_token_id if cls.side == "YES" else market.no_token_id
            if tid is None:
                continue

            ask = await asyncio.to_thread(self.poly.get_best_ask, tid)
            if ask is None or ask <= 0.02 or ask >= 0.97:
                continue

            edge = cls.confidence - ask
            min_edge = self.settings.min_edge_bps / 10_000.0
            if edge < min_edge:
                continue

            log.info(
                "news_reactor.hit",
                headline=item.title[:80],
                market=market.question[:80],
                side=cls.side,
                ask=ask,
                p=round(cls.confidence, 3),
            )

            tp = min(0.97, ask + 0.75 * edge)
            stop = max(0.03, ask - 0.5 * edge)
            intents.append(
                TradeIntent(
                    market_id=market.condition_id,
                    token_id=tid,
                    outcome=cls.side,
                    price=ask,
                    model_probability=cls.confidence,
                    strategy=self.name,
                    stop_price=stop,
                    take_profit=tp,
                    meta={
                        "headline": item.title[:200],
                        "market": market.question[:160],
                        "rationale": cls.rationale[:200],
                    },
                )
            )
        return intents

    # ---- helpers ----
    def _shortlist(
        self, item: NewsItem, markets: List[GammaMarket], top_k: int
    ) -> List[GammaMarket]:
        news_kw = _keywords(item.title + " " + item.summary)
        scored: List[tuple[int, GammaMarket]] = []
        for m in markets:
            mkw = _keywords(m.question + " " + (m.category or ""))
            overlap = len(news_kw & mkw)
            if overlap >= 2:
                scored.append((overlap, m))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [m for _, m in scored[:top_k]]

    async def _classify(
        self, item: NewsItem, shortlist: List[GammaMarket]
    ) -> Optional[Classification]:
        assert self.claude is not None

        markets_text = "\n".join(
            f"- id={m.condition_id} | {m.question[:150]}" for m in shortlist
        )
        prompt = (
            f"HEADLINE: {item.title}\n"
            f"SUMMARY: {item.summary[:600]}\n"
            f"SOURCE: {item.source}\n\n"
            f"CANDIDATE MARKETS:\n{markets_text}\n"
        )

        try:
            resp = await self.claude.messages.create(
                model=self.settings.claude_model,
                max_tokens=300,
                system=CLASSIFIER_SYSTEM,
                messages=[{"role": "user", "content": prompt}],
            )
        except Exception as e:  # noqa: BLE001
            log.warning("news_reactor.claude_err", err=str(e))
            return None

        # Track spend
        usage = getattr(resp, "usage", None)
        if usage is not None:
            self._record_spend(
                int(getattr(usage, "input_tokens", 0)),
                int(getattr(usage, "output_tokens", 0)),
            )

        text = ""
        for block in resp.content:
            if getattr(block, "type", None) == "text":
                text += block.text

        # Extract JSON
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if not m:
            return None
        try:
            data = json.loads(m.group(0))
        except Exception:  # noqa: BLE001
            return None

        mcid = data.get("market_condition_id")
        side = data.get("side")
        conf = data.get("confidence")
        if not mcid or side not in ("YES", "NO") or not isinstance(conf, (int, float)):
            return None

        return Classification(
            market_condition_id=str(mcid),
            side=side,
            confidence=float(conf),
            rationale=str(data.get("rationale", ""))[:300],
        )
