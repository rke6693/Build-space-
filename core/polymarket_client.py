"""Thin wrapper around py-clob-client.

Centralizes auth, lazy-derives API creds on first use, and exposes a small
async-friendly surface (the underlying client is sync so we offload via
run_in_executor in the executor module).

Reference: https://github.com/Polymarket/py-clob-client
"""
from __future__ import annotations

from functools import lru_cache
from typing import Any, Dict, List, Optional

from py_clob_client.client import ClobClient
from py_clob_client.clob_types import (
    ApiCreds,
    MarketOrderArgs,
    OrderArgs,
    OrderType,
)
from py_clob_client.order_builder.constants import BUY, SELL

from .config import get_settings
from .logger import get_logger

log = get_logger("poly_client")


class PolymarketClient:
    """Sync client. Wrap calls in `asyncio.to_thread` when calling from async code."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self._client: Optional[ClobClient] = None

    def _build(self) -> ClobClient:
        s = self.settings
        client = ClobClient(
            host=s.polymarket_clob_host,
            key=s.polymarket_private_key,
            chain_id=s.polygon_chain_id,
            signature_type=s.polymarket_sig_type,
            funder=s.polymarket_proxy_address,
        )
        # Derive L2 API creds (api_key / secret / passphrase). create_or_derive
        # is idempotent: it returns existing creds if already registered.
        creds: ApiCreds = client.create_or_derive_api_creds()
        client.set_api_creds(creds)
        log.info(
            "poly_client.ready",
            host=s.polymarket_clob_host,
            funder=s.polymarket_proxy_address,
        )
        return client

    @property
    def client(self) -> ClobClient:
        if self._client is None:
            self._client = self._build()
        return self._client

    # ---- market data ----
    def get_orderbook(self, token_id: str) -> Dict[str, Any]:
        return self.client.get_order_book(token_id)

    def get_midpoint(self, token_id: str) -> float:
        """Best-bid / best-ask midpoint, or 0.5 if empty."""
        try:
            ob = self.client.get_order_book(token_id)
            bids = getattr(ob, "bids", []) or []
            asks = getattr(ob, "asks", []) or []
            if bids and asks:
                best_bid = float(bids[0].price)
                best_ask = float(asks[0].price)
                return (best_bid + best_ask) / 2.0
            if bids:
                return float(bids[0].price)
            if asks:
                return float(asks[0].price)
        except Exception as e:  # noqa: BLE001
            log.warning("orderbook.error", token=token_id, err=str(e))
        return 0.5

    def get_best_ask(self, token_id: str) -> Optional[float]:
        try:
            ob = self.client.get_order_book(token_id)
            asks = getattr(ob, "asks", []) or []
            if asks:
                return float(asks[0].price)
        except Exception as e:  # noqa: BLE001
            log.warning("best_ask.error", token=token_id, err=str(e))
        return None

    def get_best_bid(self, token_id: str) -> Optional[float]:
        try:
            ob = self.client.get_order_book(token_id)
            bids = getattr(ob, "bids", []) or []
            if bids:
                return float(bids[0].price)
        except Exception as e:  # noqa: BLE001
            log.warning("best_bid.error", token=token_id, err=str(e))
        return None

    # ---- orders ----
    def place_market_buy(self, token_id: str, usdc_amount: float) -> Dict[str, Any]:
        """Immediate-or-cancel market buy, priced in USDC (dollars)."""
        args = MarketOrderArgs(
            token_id=token_id,
            amount=round(usdc_amount, 4),
            side=BUY,
        )
        signed = self.client.create_market_order(args)
        resp = self.client.post_order(signed, OrderType.FOK)
        log.info("order.market_buy.resp", token=token_id, resp=str(resp)[:500])
        return resp  # type: ignore[return-value]

    def place_market_sell(self, token_id: str, shares: float) -> Dict[str, Any]:
        """Market sell of a given share count. py-clob-client expects SELL size."""
        args = OrderArgs(
            token_id=token_id,
            price=0.01,   # minimum — FOK against book will fill at best bid
            size=round(shares, 4),
            side=SELL,
        )
        signed = self.client.create_order(args)
        resp = self.client.post_order(signed, OrderType.FOK)
        log.info("order.market_sell.resp", token=token_id, resp=str(resp)[:500])
        return resp  # type: ignore[return-value]

    def place_limit_buy(
        self, token_id: str, price: float, shares: float
    ) -> Dict[str, Any]:
        args = OrderArgs(
            token_id=token_id,
            price=round(price, 3),
            size=round(shares, 4),
            side=BUY,
        )
        signed = self.client.create_order(args)
        resp = self.client.post_order(signed, OrderType.GTC)
        log.info("order.limit_buy.resp", token=token_id, resp=str(resp)[:500])
        return resp  # type: ignore[return-value]

    def cancel_all(self) -> Any:
        try:
            return self.client.cancel_all()
        except Exception as e:  # noqa: BLE001
            log.warning("cancel_all.error", err=str(e))
            return None


@lru_cache(maxsize=1)
def get_poly_client() -> PolymarketClient:
    return PolymarketClient()
