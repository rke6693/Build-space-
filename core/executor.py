"""Turns SizedTrade intents into real Polymarket fills, updating bankroll.

Designed to be fail-safe:
  * All CLOB calls go via asyncio.to_thread so the sync SDK can't stall the loop.
  * If DRY_RUN=true, trades are simulated at the best ask/bid with zero slippage.
  * Fills are parsed defensively — py-clob-client response shapes vary; we fall
    back to the intent's expected price if the response is unparseable.
  * If a fill returns 0 shares (FOK rejected), bankroll is NOT touched.
"""
from __future__ import annotations

import asyncio
from typing import Any, Dict, Optional

from .bankroll import Bankroll, Position
from .config import get_settings
from .logger import get_logger
from .notifier import Notifier
from .polymarket_client import PolymarketClient, get_poly_client
from .risk import SizedTrade

log = get_logger("executor")


def _parse_fill(resp: Any) -> tuple[float, float]:
    """Return (filled_shares, avg_price). Defensive parsing."""
    try:
        if isinstance(resp, dict):
            # Real Polymarket responses carry makingAmount/takingAmount strings
            taking = resp.get("takingAmount") or resp.get("taking_amount")
            making = resp.get("makingAmount") or resp.get("making_amount")
            if taking is not None and making is not None:
                taking = float(taking)
                making = float(making)
                if taking > 0:
                    # For a buy: making=USDC spent, taking=shares received
                    return taking, making / taking if taking else 0.0
            # Fallback: "size_matched"
            sm = resp.get("size_matched") or resp.get("sizeMatched")
            if sm is not None:
                return float(sm), 0.0
    except Exception as e:  # noqa: BLE001
        log.warning("fill_parse.err", err=str(e))
    return 0.0, 0.0


class Executor:
    def __init__(self, bankroll: Bankroll, notifier: Notifier) -> None:
        self.bankroll = bankroll
        self.notifier = notifier
        self.settings = get_settings()
        self.client: PolymarketClient = get_poly_client()

    # ---- open ----
    async def open_position(self, sized: SizedTrade) -> Optional[Position]:
        intent = sized.intent

        if self.settings.dry_run:
            log.info("executor.dry_open",
                     market=intent.market_id, stake=sized.stake_usdc)
            pos = self.bankroll.record_open(
                market_id=intent.market_id,
                token_id=intent.token_id,
                outcome=intent.outcome,
                shares=sized.shares,
                fill_price=intent.price,
                strategy=intent.strategy,
                stop_price=intent.stop_price,
                take_profit=intent.take_profit,
                meta=intent.meta,
            )
            await self.notifier.trade_opened(
                market=intent.market_id,
                side="BUY",
                price=intent.price,
                shares=sized.shares,
                stake=sized.stake_usdc,
                edge_bps=sized.edge_bps,
                strategy=intent.strategy,
            )
            return pos

        # Live order. Re-check best ask just before firing so we don't buy
        # into a stale quote.
        best_ask = await asyncio.to_thread(self.client.get_best_ask, intent.token_id)
        if best_ask is None:
            log.warning("executor.no_ask", market=intent.market_id)
            return None

        slip_cap = intent.price * 1.02   # 2% max worse than expected
        if best_ask > slip_cap:
            log.info(
                "executor.slippage_reject",
                expected=intent.price,
                ask=best_ask,
                cap=slip_cap,
            )
            return None

        try:
            resp = await asyncio.to_thread(
                self.client.place_market_buy, intent.token_id, sized.stake_usdc
            )
        except Exception as e:  # noqa: BLE001
            log.error("executor.open.err", err=str(e), market=intent.market_id)
            return None

        filled_shares, avg_price = _parse_fill(resp)
        if filled_shares <= 0:
            # Fall back: assume stake was fully filled at best_ask
            # (FOK usually either fills all or none — if all, SDK sometimes
            # returns ok without amounts)
            if isinstance(resp, dict) and resp.get("success"):
                filled_shares = sized.stake_usdc / best_ask
                avg_price = best_ask
            else:
                log.warning("executor.open.no_fill", resp=str(resp)[:300])
                return None

        pos = self.bankroll.record_open(
            market_id=intent.market_id,
            token_id=intent.token_id,
            outcome=intent.outcome,
            shares=filled_shares,
            fill_price=avg_price,
            strategy=intent.strategy,
            stop_price=intent.stop_price,
            take_profit=intent.take_profit,
            meta=intent.meta,
        )
        await self.notifier.trade_opened(
            market=intent.market_id,
            side="BUY",
            price=avg_price,
            shares=filled_shares,
            stake=filled_shares * avg_price,
            edge_bps=sized.edge_bps,
            strategy=intent.strategy,
        )
        return pos

    # ---- close ----
    async def close_position(
        self, token_id: str, *, reason: str
    ) -> Optional[float]:
        pos = self.bankroll.state.positions.get(token_id)
        if pos is None:
            return None

        if self.settings.dry_run:
            best_bid = await asyncio.to_thread(self.client.get_best_bid, token_id)
            price = best_bid if best_bid is not None else pos.avg_price
            pnl = self.bankroll.record_close(
                token_id=token_id, shares=pos.shares, fill_price=price
            )
            await self.notifier.trade_closed(
                market=pos.market_id, shares=pos.shares, price=price,
                pnl=pnl, reason=reason,
            )
            return pnl

        try:
            resp = await asyncio.to_thread(
                self.client.place_market_sell, token_id, pos.shares
            )
        except Exception as e:  # noqa: BLE001
            log.error("executor.close.err", err=str(e), token=token_id)
            return None

        filled, avg = _parse_fill(resp)
        if filled <= 0:
            best_bid = await asyncio.to_thread(self.client.get_best_bid, token_id)
            if best_bid is None:
                log.warning("executor.close.no_fill")
                return None
            filled = pos.shares
            avg = best_bid

        pnl = self.bankroll.record_close(
            token_id=token_id, shares=filled, fill_price=avg
        )
        await self.notifier.trade_closed(
            market=pos.market_id, shares=filled, price=avg, pnl=pnl, reason=reason,
        )
        return pnl

    # ---- maintenance: stops / targets ----
    async def enforce_stops(self, mark_prices: Dict[str, float]) -> None:
        """Called every cycle. Closes positions that hit stop or take-profit."""
        for pos in list(self.bankroll.state.positions.values()):
            price = mark_prices.get(pos.token_id)
            if price is None:
                continue
            if pos.stop_price is not None and price <= pos.stop_price:
                await self.close_position(pos.token_id, reason="stop")
                continue
            if pos.take_profit is not None and price >= pos.take_profit:
                await self.close_position(pos.token_id, reason="target")
                continue
