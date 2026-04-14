"""Polymarket Gamma API — market discovery & metadata.

Gamma is the public REST API that returns human-readable market listings
(slug, title, outcomes, end date, resolution criteria, clobTokenIds).
We use it to find markets matching our strategy triggers; the CLOB
client handles actual order placement.

Reference: https://docs.polymarket.com/#gamma-api
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import aiohttp

from core.logger import get_logger

log = get_logger("gamma")

GAMMA_BASE = "https://gamma-api.polymarket.com"


@dataclass
class GammaMarket:
    condition_id: str
    slug: str
    question: str
    description: str
    end_date: Optional[datetime]
    outcomes: List[str]                    # e.g. ["Yes", "No"]
    outcome_prices: List[float]            # current last-trade prices
    clob_token_ids: List[str]              # parallel to outcomes
    volume: float
    liquidity: float
    category: str
    closed: bool
    active: bool
    raw: Dict[str, Any]

    @property
    def yes_token_id(self) -> Optional[str]:
        for o, tid in zip(self.outcomes, self.clob_token_ids):
            if o.lower() in ("yes", "y", "true"):
                return tid
        return self.clob_token_ids[0] if self.clob_token_ids else None

    @property
    def no_token_id(self) -> Optional[str]:
        for o, tid in zip(self.outcomes, self.clob_token_ids):
            if o.lower() in ("no", "n", "false"):
                return tid
        return self.clob_token_ids[1] if len(self.clob_token_ids) > 1 else None

    @property
    def yes_price(self) -> Optional[float]:
        for o, p in zip(self.outcomes, self.outcome_prices):
            if o.lower() in ("yes", "y", "true"):
                return p
        return self.outcome_prices[0] if self.outcome_prices else None

    def hours_to_resolution(self) -> Optional[float]:
        if self.end_date is None:
            return None
        delta = self.end_date - datetime.now(timezone.utc)
        return delta.total_seconds() / 3600.0


def _parse_market(raw: Dict[str, Any]) -> Optional[GammaMarket]:
    try:
        cond = raw.get("conditionId") or raw.get("condition_id")
        if not cond:
            return None

        outcomes_raw = raw.get("outcomes")
        if isinstance(outcomes_raw, str):
            try:
                outcomes = json.loads(outcomes_raw)
            except Exception:  # noqa: BLE001
                outcomes = [o.strip() for o in outcomes_raw.split(",")]
        elif isinstance(outcomes_raw, list):
            outcomes = outcomes_raw
        else:
            outcomes = ["Yes", "No"]

        prices_raw = raw.get("outcomePrices")
        if isinstance(prices_raw, str):
            try:
                prices = [float(x) for x in json.loads(prices_raw)]
            except Exception:  # noqa: BLE001
                prices = []
        elif isinstance(prices_raw, list):
            prices = [float(x) for x in prices_raw]
        else:
            prices = []

        ctids_raw = raw.get("clobTokenIds")
        if isinstance(ctids_raw, str):
            try:
                ctids = json.loads(ctids_raw)
            except Exception:  # noqa: BLE001
                ctids = []
        elif isinstance(ctids_raw, list):
            ctids = ctids_raw
        else:
            ctids = []

        end_date_raw = raw.get("endDate") or raw.get("end_date_iso")
        end_date = None
        if end_date_raw:
            try:
                end_date = datetime.fromisoformat(end_date_raw.replace("Z", "+00:00"))
            except Exception:  # noqa: BLE001
                pass

        return GammaMarket(
            condition_id=cond,
            slug=raw.get("slug", ""),
            question=raw.get("question", ""),
            description=raw.get("description", ""),
            end_date=end_date,
            outcomes=outcomes,
            outcome_prices=prices,
            clob_token_ids=ctids,
            volume=float(raw.get("volume", 0) or 0),
            liquidity=float(raw.get("liquidity", 0) or 0),
            category=raw.get("category", "") or "",
            closed=bool(raw.get("closed", False)),
            active=bool(raw.get("active", True)),
            raw=raw,
        )
    except Exception as e:  # noqa: BLE001
        log.debug("gamma.parse_err", err=str(e))
        return None


class GammaClient:
    def __init__(self) -> None:
        self._session: Optional[aiohttp.ClientSession] = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=15)
            )
        return self._session

    async def list_markets(
        self,
        *,
        active: bool = True,
        closed: bool = False,
        limit: int = 200,
        offset: int = 0,
        category: Optional[str] = None,
    ) -> List[GammaMarket]:
        sess = await self._get_session()
        params: Dict[str, Any] = {
            "active": str(active).lower(),
            "closed": str(closed).lower(),
            "limit": limit,
            "offset": offset,
            "order": "volume",
            "ascending": "false",
        }
        if category:
            params["category"] = category
        try:
            async with sess.get(f"{GAMMA_BASE}/markets", params=params) as resp:
                resp.raise_for_status()
                data = await resp.json()
        except Exception as e:  # noqa: BLE001
            log.warning("gamma.list_err", err=str(e))
            return []

        items = data if isinstance(data, list) else data.get("data", [])
        out: List[GammaMarket] = []
        for raw in items:
            m = _parse_market(raw)
            if m and m.active and not m.closed:
                out.append(m)
        return out

    async def crypto_markets(self, limit: int = 200) -> List[GammaMarket]:
        """Markets that mention BTC/ETH/SOL/crypto price levels."""
        all_markets = await self.list_markets(limit=limit)
        pat = re.compile(
            r"\b(bitcoin|btc|ethereum|eth|solana|sol|xrp|doge|dogecoin)\b",
            re.IGNORECASE,
        )
        return [m for m in all_markets if pat.search(m.question) or pat.search(m.slug)]

    async def resolving_soon(self, max_hours: float = 24.0, limit: int = 200) -> List[GammaMarket]:
        all_markets = await self.list_markets(limit=limit)
        out = []
        for m in all_markets:
            h = m.hours_to_resolution()
            if h is not None and 0 < h <= max_hours:
                out.append(m)
        return out

    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()
