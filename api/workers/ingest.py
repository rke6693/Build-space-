"""
OmniSight — Background Data Ingestion Workers
Continuously fetches market data, snapshots prices, scans for whales,
checks resolutions, and detects arbitrage across all platforms.

Run: python -m api.workers.ingest
"""

from __future__ import annotations

import asyncio
import signal
import time
from datetime import datetime, timezone
from typing import Optional

import structlog

from api.cache import cache, init_redis, close_redis
from api.circuit_breaker import CircuitOpenError
from api.config import get_settings
from api.connectors.base import BaseConnector
from api.connectors.kalshi import KalshiConnector
from api.connectors.polymarket import PolymarketConnector
from api.connectors.sportsbook import BetfairConnector, PinnacleConnector
from api.database import init_db, close_db
from api.metrics import (
    DATA_LAST_UPDATED,
    INGESTION_ERRORS,
    MARKETS_TRACKED,
    ARBITRAGE_OPPORTUNITIES,
    WHALE_ALERTS_TOTAL,
    WHALE_VOLUME_USD,
)
from api.models import Platform
from api.services.normalizer import OddsNormalizer
from api.services.resolution import ResolutionTracker
from api.services.whale_tracker import WhaleTracker

logger = structlog.get_logger(__name__)


class IngestionWorker:
    """
    Background worker that continuously ingests data from all platforms.
    Each task runs on its own interval with independent error handling.
    """

    def __init__(self):
        self.settings = get_settings()
        self.connectors: dict[Platform, BaseConnector] = {}
        self.normalizer: Optional[OddsNormalizer] = None
        self.whale_tracker: Optional[WhaleTracker] = None
        self.resolution_tracker: Optional[ResolutionTracker] = None
        self._running = True
        self._tasks: list[asyncio.Task] = []

    async def setup(self) -> None:
        """Initialize all dependencies."""
        creds = self.settings.platforms

        self.connectors[Platform.POLYMARKET] = PolymarketConnector(
            api_key=creds.polymarket_api_key,
            api_secret=creds.polymarket_api_secret,
        )
        self.connectors[Platform.KALSHI] = KalshiConnector(
            api_key=creds.kalshi_api_key,
            api_secret=creds.kalshi_api_secret,
        )
        self.connectors[Platform.PINNACLE] = PinnacleConnector(
            api_key=creds.pinnacle_api_key,
        )
        self.connectors[Platform.BETFAIR] = BetfairConnector(
            api_key=creds.betfair_api_key,
            session_token=creds.betfair_session_token,
        )

        self.normalizer = OddsNormalizer(self.connectors)
        self.whale_tracker = WhaleTracker(self.connectors)
        self.resolution_tracker = ResolutionTracker(self.connectors)

        await init_db()
        await init_redis()

        logger.info("ingestion_worker_initialized", platforms=len(self.connectors))

    async def shutdown(self) -> None:
        """Graceful shutdown."""
        self._running = False
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)

        for connector in self.connectors.values():
            await connector.close()
        await close_db()
        await close_redis()

        logger.info("ingestion_worker_shutdown")

    async def run(self) -> None:
        """Start all ingestion loops."""
        await self.setup()

        self._tasks = [
            asyncio.create_task(self._loop("market_ingest", self._ingest_markets, self.settings.worker.ingest_interval)),
            asyncio.create_task(self._loop("price_snapshot", self._snapshot_prices, self.settings.worker.snapshot_interval)),
            asyncio.create_task(self._loop("whale_scan", self._scan_whales, self.settings.worker.whale_scan_interval)),
            asyncio.create_task(self._loop("resolution_scan", self._scan_resolutions, self.settings.worker.resolution_scan_interval)),
            asyncio.create_task(self._loop("arbitrage_scan", self._scan_arbitrage, self.settings.worker.ingest_interval * 2)),
        ]

        logger.info("ingestion_loops_started", tasks=len(self._tasks))
        await asyncio.gather(*self._tasks, return_exceptions=True)

    async def _loop(self, name: str, func, interval: float) -> None:
        """Run a function on a recurring interval with error isolation."""
        while self._running:
            start = time.monotonic()
            try:
                await func()
                duration = time.monotonic() - start
                logger.debug("worker_cycle_complete", worker=name, duration_s=round(duration, 2))
            except CircuitOpenError as e:
                logger.warning("worker_circuit_open", worker=name, platform=e.name)
            except asyncio.CancelledError:
                break
            except Exception as e:
                duration = time.monotonic() - start
                logger.error("worker_cycle_error", worker=name, error=str(e), duration_s=round(duration, 2))
                INGESTION_ERRORS.labels(platform="all", error_type=type(e).__name__).inc()

            # Wait for next cycle, accounting for execution time
            elapsed = time.monotonic() - start
            sleep_time = max(0, interval - elapsed)
            await asyncio.sleep(sleep_time)

    async def _ingest_markets(self) -> None:
        """Fetch and cache market data from all platforms."""
        sem = asyncio.Semaphore(self.settings.worker.max_concurrent_fetches)

        async def fetch_platform(platform: Platform, connector: BaseConnector):
            async with sem:
                try:
                    markets = await connector.get_markets(limit=200)
                    # Cache the results
                    market_dicts = [m.model_dump(mode="json") for m in markets]
                    await cache.set(
                        f"omnisight:markets:{platform.value}",
                        market_dicts,
                        ttl=self.settings.redis.market_ttl,
                    )
                    MARKETS_TRACKED.labels(platform=platform.value).set(len(markets))
                    DATA_LAST_UPDATED.labels(
                        platform=platform.value, data_type="markets"
                    ).set(time.time())
                    logger.info("markets_ingested", platform=platform.value, count=len(markets))
                except CircuitOpenError:
                    raise
                except Exception as e:
                    INGESTION_ERRORS.labels(platform=platform.value, error_type="market_fetch").inc()
                    logger.error("market_ingest_failed", platform=platform.value, error=str(e))

        tasks = [fetch_platform(p, c) for p, c in self.connectors.items()]
        await asyncio.gather(*tasks, return_exceptions=True)

    async def _snapshot_prices(self) -> None:
        """Take price snapshots for active markets (for historical data)."""
        for platform, connector in self.connectors.items():
            try:
                markets = await connector.get_markets(limit=50)
                snapshots = []
                for m in markets:
                    if m.yes_price is not None:
                        snapshots.append({
                            "market_id": m.id,
                            "platform": platform.value,
                            "yes_price": m.yes_price,
                            "no_price": m.no_price,
                            "volume": m.volume_24h,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        })

                if snapshots:
                    await cache.set(
                        f"omnisight:snapshots:{platform.value}:latest",
                        snapshots,
                        ttl=self.settings.redis.market_ttl * 6,
                    )
                    DATA_LAST_UPDATED.labels(
                        platform=platform.value, data_type="snapshots"
                    ).set(time.time())

            except CircuitOpenError:
                continue
            except Exception as e:
                INGESTION_ERRORS.labels(platform=platform.value, error_type="snapshot").inc()
                logger.error("snapshot_failed", platform=platform.value, error=str(e))

    async def _scan_whales(self) -> None:
        """Scan for whale trades across all platforms."""
        for platform, connector in self.connectors.items():
            try:
                markets = await connector.get_markets(limit=20)
                for market in markets[:10]:  # Top 10 by volume
                    alerts = await self.whale_tracker.scan_market(
                        market.platform_market_id, platform
                    )
                    for alert in alerts:
                        WHALE_ALERTS_TOTAL.labels(
                            platform=platform.value, side=alert.side.value
                        ).inc()
                        WHALE_VOLUME_USD.labels(
                            platform=platform.value, side=alert.side.value
                        ).inc(alert.usd_value)

                DATA_LAST_UPDATED.labels(
                    platform=platform.value, data_type="whales"
                ).set(time.time())

            except CircuitOpenError:
                continue
            except Exception as e:
                INGESTION_ERRORS.labels(platform=platform.value, error_type="whale_scan").inc()
                logger.error("whale_scan_failed", platform=platform.value, error=str(e))

    async def _scan_resolutions(self) -> None:
        """Check for newly resolved markets."""
        for platform, connector in self.connectors.items():
            try:
                markets = await connector.get_markets(limit=100)
                pending = [(m.platform_market_id, platform) for m in markets]
                resolved = await self.resolution_tracker.scan_pending_resolutions(pending)
                if resolved:
                    logger.info(
                        "new_resolutions", platform=platform.value, count=len(resolved)
                    )
            except CircuitOpenError:
                continue
            except Exception as e:
                INGESTION_ERRORS.labels(platform=platform.value, error_type="resolution_scan").inc()
                logger.error("resolution_scan_failed", platform=platform.value, error=str(e))

    async def _scan_arbitrage(self) -> None:
        """Detect cross-platform arbitrage opportunities."""
        try:
            opportunities = await self.normalizer.detect_arbitrage(min_profit_bps=5)
            ARBITRAGE_OPPORTUNITIES.set(len(opportunities))

            if opportunities:
                opp_dicts = [o.model_dump(mode="json") for o in opportunities]
                await cache.set("omnisight:arbitrage:active", opp_dicts, ttl=30)

            DATA_LAST_UPDATED.labels(platform="cross_platform", data_type="arbitrage").set(time.time())
            logger.info("arbitrage_scan_complete", opportunities=len(opportunities))

        except Exception as e:
            INGESTION_ERRORS.labels(platform="cross_platform", error_type="arbitrage_scan").inc()
            logger.error("arbitrage_scan_failed", error=str(e))


async def main():
    """Entry point for the ingestion worker."""
    worker = IngestionWorker()

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, lambda: asyncio.create_task(worker.shutdown()))

    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
