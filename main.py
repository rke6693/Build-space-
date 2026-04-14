"""Polymarket Moonshot Bot — main entrypoint.

Orchestration:
  * Spawn Binance WS price tape in background.
  * Every POLL_INTERVAL_SECONDS:
      - Day rollover check
      - Pre-flight risk check
      - For each enabled edge: scan() -> intents
      - For each intent: risk.evaluate() -> sized trade -> executor
      - Mark-to-market existing positions, enforce stops/targets
  * Daily report at UTC 00:05.

Run with: python main.py
"""
from __future__ import annotations

import asyncio
import signal
import sys
import time
from datetime import datetime, timezone
from typing import Dict, List

from core.bankroll import Bankroll
from core.config import get_settings
from core.executor import Executor
from core.logger import get_logger, setup_logging
from core.notifier import Notifier
from core.polymarket_client import get_poly_client
from core.risk import RiskManager, TradeIntent
from data.binance_ws import PriceTape, binance_stream
from data.polymarket_gamma import GammaClient
from edges.base import Edge
from edges.crypto_lag import CryptoLagEdge
from edges.news_reactor import NewsReactorEdge
from edges.resolver_sniper import ResolverSniperEdge


async def build_edges(
    *, tape: PriceTape, gamma: GammaClient
) -> List[Edge]:
    s = get_settings()
    poly = get_poly_client()
    edges: List[Edge] = []
    if s.enable_crypto_lag:
        edges.append(CryptoLagEdge(tape=tape, gamma=gamma, poly=poly))
    if s.enable_news_reactor:
        edges.append(NewsReactorEdge(gamma=gamma, poly=poly))
    if s.enable_resolver_sniper:
        edges.append(ResolverSniperEdge(gamma=gamma, poly=poly))
    return edges


async def mark_to_market(
    bankroll: Bankroll,
) -> Dict[str, float]:
    """Pull current midpoints for every open position."""
    poly = get_poly_client()
    out: Dict[str, float] = {}
    for pos in bankroll.positions():
        try:
            mid = await asyncio.to_thread(poly.get_midpoint, pos.token_id)
            out[pos.token_id] = mid
        except Exception:  # noqa: BLE001
            out[pos.token_id] = pos.avg_price
    return out


async def daily_report_loop(
    bankroll: Bankroll, notifier: Notifier
) -> None:
    """Posts a daily summary just after UTC midnight."""
    sent_key = ""
    while True:
        await asyncio.sleep(60)
        now = datetime.now(timezone.utc)
        key = now.strftime("%Y-%m-%d")
        if now.hour == 0 and now.minute >= 5 and key != sent_key:
            sent_key = key
            mark = await mark_to_market(bankroll)
            total = bankroll.total_bankroll(mark)
            await notifier.daily_report(
                bankroll=total,
                realised=bankroll.state.realised_today,
                open_count=len(bankroll.state.positions),
                high_water=bankroll.state.high_water,
            )


async def scan_and_trade_once(
    *,
    edges: List[Edge],
    risk: RiskManager,
    executor: Executor,
    bankroll: Bankroll,
    log,
) -> None:
    bankroll.maybe_rollover_day()

    # Mark-to-market & enforce stops first (preserve capital before adding risk)
    mark = await mark_to_market(bankroll)
    await executor.enforce_stops(mark)

    halt = risk.pre_flight(mark)
    if halt:
        log.info("loop.halt", reason=halt)
        return

    all_intents: List[TradeIntent] = []
    for edge in edges:
        try:
            intents = await edge.scan()
            all_intents.extend(intents)
        except Exception as e:  # noqa: BLE001
            log.warning("edge.scan_err", edge=edge.name, err=str(e))

    if not all_intents:
        return

    # Sort by raw edge so we fire the best first
    all_intents.sort(
        key=lambda i: i.model_probability - i.price, reverse=True
    )

    fired = 0
    for intent in all_intents:
        sized = risk.evaluate(intent, mark_prices=mark)
        if sized is None:
            continue
        try:
            pos = await executor.open_position(sized)
            if pos is not None:
                fired += 1
        except Exception as e:  # noqa: BLE001
            log.warning("loop.exec_err", err=str(e))

        # Re-check halt after each open (bankroll changed)
        if risk.pre_flight() is not None:
            break

    if fired:
        log.info("loop.fired", n=fired, candidates=len(all_intents))


async def main() -> None:
    log = setup_logging()
    settings = get_settings()

    log.info(
        "boot",
        starting=settings.starting_bankroll_usdc,
        target=settings.target_bankroll_usdc,
        dry_run=settings.dry_run,
        crypto_lag=settings.enable_crypto_lag,
        news_reactor=settings.enable_news_reactor,
        resolver_sniper=settings.enable_resolver_sniper,
    )

    notifier = Notifier()
    bankroll = Bankroll()
    risk = RiskManager(bankroll)
    executor = Executor(bankroll, notifier)

    # Tape + gamma shared between edges
    tape = PriceTape(maxlen=7200)
    gamma = GammaClient()

    # Start Binance feed
    ws_task = asyncio.create_task(binance_stream(tape))

    # Wait until we have at least one tick before entering main loop
    log.info("warmup.wait_binance")
    ready = await tape.wait_ready(timeout=30)
    if not ready:
        log.warning("warmup.binance_timeout")

    edges = await build_edges(tape=tape, gamma=gamma)
    log.info("edges.ready", names=[e.name for e in edges])

    await notifier.send(
        f"*PolyBot online*\nBankroll: ${bankroll.state.cash_usdc:.2f}\n"
        f"Target: ${settings.target_bankroll_usdc:.0f}\n"
        f"Strategies: {', '.join(e.name for e in edges)}"
    )

    # Daily report task
    report_task = asyncio.create_task(daily_report_loop(bankroll, notifier))

    # Graceful shutdown
    stop_event = asyncio.Event()

    def _sig_handler(*_):
        log.info("signal.shutdown")
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _sig_handler)
        except NotImplementedError:
            pass

    try:
        while not stop_event.is_set():
            started = time.time()
            try:
                await scan_and_trade_once(
                    edges=edges,
                    risk=risk,
                    executor=executor,
                    bankroll=bankroll,
                    log=log,
                )
            except Exception as e:  # noqa: BLE001
                log.exception("loop.unhandled", err=str(e))

            elapsed = time.time() - started
            wait = max(0.0, settings.poll_interval_seconds - elapsed)
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=wait)
            except asyncio.TimeoutError:
                pass
    finally:
        ws_task.cancel()
        report_task.cancel()
        await gamma.close()
        await notifier.send("*PolyBot offline*")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
