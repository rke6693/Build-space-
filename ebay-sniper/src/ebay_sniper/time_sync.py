"""Track the offset between the local clock and eBay's server clock.

We trust eBay's `Date` HTTP response header as the source of truth for auction
end times, since the auction server is the one that decides when bidding
closes. On startup and every `refresh_interval_s`, we HEAD the eBay homepage
and compute `offset = server_time - local_time`. Callers ask for "eBay now" via
:meth:`ClockOffset.ebay_now`.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

import httpx

logger = logging.getLogger(__name__)

EBAY_PROBE_URL = "https://www.ebay.com/"
DEFAULT_REFRESH_INTERVAL_S = 60.0


@dataclass
class ClockOffset:
    """Additive offset (server_time - local_time) as a :class:`timedelta`."""

    offset: timedelta = field(default_factory=timedelta)
    last_synced_at: datetime | None = None

    def ebay_now(self) -> datetime:
        """Return the current time as eBay's server would see it."""
        return datetime.now(timezone.utc) + self.offset

    def local_time_for_ebay(self, ebay_target: datetime) -> datetime:
        """Return the local clock time at which `ebay_target` will occur on eBay."""
        if ebay_target.tzinfo is None:
            ebay_target = ebay_target.replace(tzinfo=timezone.utc)
        return ebay_target - self.offset


async def fetch_ebay_time(
    client: httpx.AsyncClient | None = None,
    *,
    url: str = EBAY_PROBE_URL,
    timeout: float = 10.0,
) -> datetime:
    """Fetch eBay's current server time from the `Date` response header."""
    own_client = client is None
    if client is None:
        client = httpx.AsyncClient(timeout=timeout, follow_redirects=True)
    try:
        resp = await client.head(url, timeout=timeout)
        date_header = resp.headers.get("Date")
        if not date_header:
            raise RuntimeError("eBay response had no Date header")
        parsed = parsedate_to_datetime(date_header)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    finally:
        if own_client:
            await client.aclose()


def compute_offset(server_time: datetime, local_time: datetime) -> timedelta:
    """Return ``server_time - local_time`` normalized to UTC."""
    if server_time.tzinfo is None:
        server_time = server_time.replace(tzinfo=timezone.utc)
    if local_time.tzinfo is None:
        local_time = local_time.replace(tzinfo=timezone.utc)
    return server_time.astimezone(timezone.utc) - local_time.astimezone(timezone.utc)


class TimeSyncer:
    """Periodically refresh :class:`ClockOffset` from eBay."""

    def __init__(
        self,
        *,
        refresh_interval_s: float = DEFAULT_REFRESH_INTERVAL_S,
        probe_url: str = EBAY_PROBE_URL,
    ) -> None:
        self.refresh_interval_s = refresh_interval_s
        self.probe_url = probe_url
        self.clock = ClockOffset()
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()

    async def refresh_once(self) -> None:
        local_before = datetime.now(timezone.utc)
        server_time = await fetch_ebay_time(url=self.probe_url)
        # Use the midpoint of (before, after) as the local timestamp to cancel
        # out half the round-trip latency.
        local_after = datetime.now(timezone.utc)
        local_mid = local_before + (local_after - local_before) / 2
        self.clock.offset = compute_offset(server_time, local_mid)
        self.clock.last_synced_at = local_after
        logger.info(
            "time sync: eBay offset = %.3fs (last_synced=%s)",
            self.clock.offset.total_seconds(),
            self.clock.last_synced_at.isoformat(),
        )

    async def start(self) -> None:
        """Do an immediate sync, then refresh in the background."""
        await self.refresh_once()
        self._stop.clear()
        self._task = asyncio.create_task(self._loop(), name="ebay-time-sync")

    async def stop(self) -> None:
        self._stop.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
            self._task = None

    async def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=self.refresh_interval_s)
                return  # stop was set
            except asyncio.TimeoutError:
                pass
            try:
                await self.refresh_once()
            except Exception as exc:  # noqa: BLE001
                logger.warning("time sync refresh failed: %s", exc)
