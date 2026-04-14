"""Resolver sniper — pick up the tail liquidity on near-certain markets.

Idea: markets within ~24 hours of resolution sometimes have one side
trading at $0.94-$0.97 when the outcome is effectively decided. If we
have strong confidence (via Claude reasoning over the market question
+ resolution criteria), buying at $0.96 and collecting $1.00 at
resolution is a 4% return in 24h — compounded, that's meaningful.

We only fire when:
  * Market resolves in (0, 24] hours
  * Best ask on the "favored" side is between $0.85 and $0.97
  * Claude assigns >= 0.98 confidence to that side resolving YES

Claude call is gated by the daily budget just like news_reactor.
"""
from __future__ import annotations

import asyncio
import json
import re
from typing import List, Optional

from anthropic import AsyncAnthropic

from core.config import get_settings
from core.logger import get_logger
from core.polymarket_client import PolymarketClient
from core.risk import TradeIntent
from data.polymarket_gamma import GammaClient, GammaMarket

from .base import Edge

log = get_logger("resolver_sniper")


SYSTEM = """You are a prediction-market resolution analyst.

Given a Polymarket market (question + resolution criteria + category)
that resolves within the next 24 hours, decide which side (YES or NO)
is effectively already decided. Only return high confidence (>= 0.98)
if the outcome is as good as certain based on public information you
have knowledge of. If unsure, return null.

You must be CAUTIOUS. A wrong call here loses the whole stake. Err
on the side of returning null whenever there is any real doubt.

Respond with JSON:
{
  "side": "YES" | "NO" | null,
  "confidence": <0..1 or null>,
  "reason": "<one short sentence>"
}
"""


class ResolverSniperEdge(Edge):
    name = "resolver_sniper"

    def __init__(
        self,
        *,
        gamma: GammaClient,
        poly: PolymarketClient,
    ) -> None:
        self.gamma = gamma
        self.poly = poly
        self.settings = get_settings()
        self.claude: Optional[AsyncAnthropic] = None
        if self.settings.anthropic_api_key:
            self.claude = AsyncAnthropic(api_key=self.settings.anthropic_api_key)

    async def scan(self) -> List[TradeIntent]:
        if self.claude is None:
            return []

        markets = await self.gamma.resolving_soon(max_hours=24.0, limit=300)
        # Filter: skip crypto (covered elsewhere), require liquidity
        markets = [
            m for m in markets
            if m.liquidity >= 1500
            and not re.search(r"bitcoin|btc|ethereum|eth|solana|sol", m.question, re.I)
        ]
        if not markets:
            return []

        log.info("resolver_sniper.candidates", n=len(markets))
        intents: List[TradeIntent] = []
        # Cap per cycle to protect budget
        for m in markets[:15]:
            try:
                intent = await self._maybe_snipe(m)
                if intent is not None:
                    intents.append(intent)
            except Exception as e:  # noqa: BLE001
                log.debug("resolver_sniper.err", err=str(e))
        return intents

    async def _maybe_snipe(self, m: GammaMarket) -> Optional[TradeIntent]:
        # Quick asks to check if there's even a near-certain side
        yes_tid = m.yes_token_id
        no_tid = m.no_token_id
        if yes_tid is None or no_tid is None:
            return None

        yes_ask = await asyncio.to_thread(self.poly.get_best_ask, yes_tid)
        no_ask = await asyncio.to_thread(self.poly.get_best_ask, no_tid)
        if yes_ask is None or no_ask is None:
            return None

        # Only interested if one side is in snipe zone
        candidate_side = None
        candidate_ask = None
        candidate_tid = None
        if 0.85 <= yes_ask <= 0.97:
            candidate_side, candidate_ask, candidate_tid = "YES", yes_ask, yes_tid
        elif 0.85 <= no_ask <= 0.97:
            candidate_side, candidate_ask, candidate_tid = "NO", no_ask, no_tid
        if candidate_side is None:
            return None

        assert self.claude is not None
        prompt = (
            f"QUESTION: {m.question}\n"
            f"CATEGORY: {m.category}\n"
            f"DESCRIPTION: {m.description[:800]}\n"
            f"HOURS_TO_RESOLUTION: {m.hours_to_resolution():.1f}\n"
            f"CURRENT_MARKET: YES=${yes_ask:.3f} NO=${no_ask:.3f}\n\n"
            f"Which side is effectively certain? Answer JSON."
        )

        try:
            resp = await self.claude.messages.create(
                model=self.settings.claude_model,
                max_tokens=250,
                system=SYSTEM,
                messages=[{"role": "user", "content": prompt}],
            )
        except Exception as e:  # noqa: BLE001
            log.warning("resolver_sniper.claude_err", err=str(e))
            return None

        text = ""
        for block in resp.content:
            if getattr(block, "type", None) == "text":
                text += block.text
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
        except Exception:  # noqa: BLE001
            return None

        side = data.get("side")
        conf = data.get("confidence")
        if side != candidate_side or not isinstance(conf, (int, float)):
            return None
        if conf < 0.98:
            return None

        edge = conf - candidate_ask
        min_edge = self.settings.min_edge_bps / 10_000.0
        if edge < min_edge:
            return None

        log.info(
            "resolver_sniper.hit",
            q=m.question[:80],
            side=candidate_side,
            ask=candidate_ask,
            conf=conf,
        )

        return TradeIntent(
            market_id=m.condition_id,
            token_id=candidate_tid,
            outcome=candidate_side,
            price=candidate_ask,
            model_probability=float(conf),
            strategy=self.name,
            stop_price=max(0.50, candidate_ask - 0.10),  # rescue exit
            take_profit=0.995,
            # Cap at $25 — these are nominally safe but unexpected resolutions do happen
            max_stake_usdc=25.0,
            meta={
                "q": m.question[:200],
                "hours": m.hours_to_resolution(),
                "reason": str(data.get("reason", ""))[:200],
            },
        )
