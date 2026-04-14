"""Crypto lag strategy — the backbone alpha source.

Workflow each cycle:
  1. Pull live Polymarket crypto markets via Gamma.
  2. Parse title to extract (symbol, strike, direction, kind).
  3. Compute time-to-expiry from Gamma endDate.
  4. Pull current spot + realized vol from Binance tape.
  5. Price YES via GBM closed form (terminal or first-passage).
  6. Pull best ask from CLOB for both YES and NO token ids.
  7. If edge >= MIN_EDGE_BPS on either side, emit a TradeIntent.

Design notes:
  * We use realized vol scaled from the past ~2 hours of Binance ticks.
    Short-window vol usually underestimates true vol for longer markets;
    we apply a conservative multiplier (1.1x) to avoid overstating edge.
  * We only trade markets with > 12 hours and < 45 days to expiry. Very
    short markets are too exposed to microstructure noise; very long
    ones are dominated by drift which our zero-drift GBM can't handle.
  * We skip markets with liquidity < $2k — $100 bankroll needs to be
    able to exit without taking huge slippage.
"""
from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from core.config import get_settings
from core.logger import get_logger
from core.polymarket_client import PolymarketClient
from core.risk import TradeIntent
from data.binance_ws import PriceTape
from data.polymarket_gamma import GammaClient, GammaMarket
from models import gbm, vol

from .base import Edge

log = get_logger("crypto_lag")


SYMBOL_MAP = {
    "bitcoin": "BTCUSDT", "btc": "BTCUSDT",
    "ethereum": "ETHUSDT", "ether": "ETHUSDT", "eth": "ETHUSDT",
    "solana": "SOLUSDT", "sol": "SOLUSDT",
    "xrp": "XRPUSDT", "ripple": "XRPUSDT",
    "dogecoin": "DOGEUSDT", "doge": "DOGEUSDT",
}


@dataclass
class ParsedMarket:
    symbol: str             # Binance symbol, e.g. BTCUSDT
    strike: float
    kind: str               # "touch_above" | "touch_below" | "terminal_above" | "terminal_below"


def _parse_strike(s: str) -> Optional[float]:
    """Parse $100k, $100,000, $1.5M, 150K, etc."""
    s = s.replace(",", "").strip()
    m = re.match(r"\$?\s*([\d.]+)\s*([KkMm]?)", s)
    if not m:
        return None
    try:
        val = float(m.group(1))
    except ValueError:
        return None
    suffix = m.group(2).lower()
    if suffix == "k":
        val *= 1_000
    elif suffix == "m":
        val *= 1_000_000
    return val


def parse_crypto_market(market: GammaMarket) -> Optional[ParsedMarket]:
    q = market.question.lower()

    symbol: Optional[str] = None
    for key, val in SYMBOL_MAP.items():
        if re.search(rf"\b{key}\b", q):
            symbol = val
            break
    if symbol is None:
        return None

    strike_match = re.search(r"\$\s*([\d.,]+)\s*([KkMm]?)", q)
    if not strike_match:
        return None
    strike = _parse_strike(strike_match.group(0))
    if strike is None or strike <= 0:
        return None

    # Direction + kind
    # Touch / first-passage keywords: reach, hit, touch, new all-time high
    touch_kw = re.search(
        r"\b(reach|hit|touch|new all[- ]time high|ath|above|over|exceed)\b", q
    )
    terminal_kw = re.search(r"\b(close|end|finish|be above|be below)\b", q)
    below_kw = re.search(r"\b(below|under|drop to|fall to)\b", q)

    if below_kw:
        kind = "terminal_below" if terminal_kw else "touch_below"
    elif touch_kw:
        # Favor touch for "reach/hit/ath" phrasing, terminal for "close above"
        if "close above" in q or "close at or above" in q or "end above" in q:
            kind = "terminal_above"
        else:
            kind = "touch_above"
    else:
        return None

    return ParsedMarket(symbol=symbol, strike=strike, kind=kind)


class CryptoLagEdge(Edge):
    name = "crypto_lag"

    def __init__(
        self,
        *,
        tape: PriceTape,
        gamma: GammaClient,
        poly: PolymarketClient,
    ) -> None:
        self.tape = tape
        self.gamma = gamma
        self.poly = poly
        self.settings = get_settings()

    async def scan(self) -> List[TradeIntent]:
        markets = await self.gamma.crypto_markets(limit=250)
        log.info("crypto_lag.scan", candidates=len(markets))

        intents: List[TradeIntent] = []
        for m in markets:
            try:
                intent = await self._maybe_price(m)
                if intent is not None:
                    intents.append(intent)
            except Exception as e:  # noqa: BLE001
                log.debug("crypto_lag.err", q=m.question[:60], err=str(e))
        return intents

    async def _maybe_price(self, m: GammaMarket) -> Optional[TradeIntent]:
        # Liquidity filter
        if m.liquidity < 2000:
            return None
        # Time window
        hours = m.hours_to_resolution()
        if hours is None or hours < 12 or hours > 24 * 45:
            return None
        # Parse the title
        parsed = parse_crypto_market(m)
        if parsed is None:
            return None

        # Pull spot + vol
        tick = self.tape.last(parsed.symbol)
        if tick is None:
            return None
        spot = tick.price

        series = self.tape.series(parsed.symbol)
        prices = [t.price for t in series]
        ts = [t.ts for t in series]
        sigma = vol.realized_vol_annualised(prices, ts)
        sigma = vol.clamp_vol(sigma * 1.1)   # +10% safety margin

        T = hours / (24 * 365.25)

        # Model probability of YES
        if parsed.kind == "touch_above":
            p_yes = gbm.prob_touch_above(spot, parsed.strike, T, sigma)
        elif parsed.kind == "terminal_above":
            p_yes = gbm.prob_above(spot, parsed.strike, T, sigma)
        elif parsed.kind == "touch_below":
            p_yes = gbm.prob_touch_below(spot, parsed.strike, T, sigma)
        elif parsed.kind == "terminal_below":
            p_yes = gbm.prob_below(spot, parsed.strike, T, sigma)
        else:
            return None

        # Query CLOB for actual best asks
        yes_tid = m.yes_token_id
        no_tid = m.no_token_id
        if yes_tid is None or no_tid is None:
            return None

        yes_ask = await asyncio.to_thread(self.poly.get_best_ask, yes_tid)
        no_ask = await asyncio.to_thread(self.poly.get_best_ask, no_tid)

        min_edge = self.settings.min_edge_bps / 10_000.0

        # Evaluate both sides
        candidates: List[Tuple[str, str, float, float]] = []
        if yes_ask is not None and 0.02 < yes_ask < 0.98:
            edge_yes = p_yes - yes_ask
            if edge_yes >= min_edge:
                candidates.append(("YES", yes_tid, yes_ask, p_yes))
        if no_ask is not None and 0.02 < no_ask < 0.98:
            p_no = 1.0 - p_yes
            edge_no = p_no - no_ask
            if edge_no >= min_edge:
                candidates.append(("NO", no_tid, no_ask, p_no))

        if not candidates:
            return None

        # Pick best edge
        candidates.sort(key=lambda c: (c[3] - c[2]), reverse=True)
        side, token_id, ask, model_p = candidates[0]

        log.info(
            "crypto_lag.hit",
            q=m.question[:80],
            symbol=parsed.symbol,
            strike=parsed.strike,
            kind=parsed.kind,
            spot=spot,
            sigma=round(sigma, 3),
            T_days=round(hours / 24, 2),
            side=side,
            ask=ask,
            p=round(model_p, 4),
            edge_bps=int((model_p - ask) * 10_000),
        )

        # Take-profit at 80% of model edge; stop at half-edge against us
        tp = min(0.98, ask + 0.8 * (model_p - ask))
        stop = max(0.02, ask - 0.6 * (model_p - ask))

        return TradeIntent(
            market_id=m.condition_id,
            token_id=token_id,
            outcome=side,
            price=ask,
            model_probability=model_p,
            strategy=self.name,
            stop_price=stop,
            take_profit=tp,
            meta={
                "question": m.question[:160],
                "symbol": parsed.symbol,
                "strike": parsed.strike,
                "kind": parsed.kind,
                "spot": spot,
                "sigma": sigma,
                "hours_to_exp": hours,
            },
        )
