"""Playwright-driven eBay interactions.

This module is the only place that touches eBay's UI. It deliberately keeps
things small and defensive: each flow has a small set of selectors with
fallbacks, and every step has an explicit timeout so a frozen page can't stall
a snipe.

Flows:

* :func:`login_interactive` — open a headed browser so the user can log in
  manually (including 2FA). The Playwright `user_data_dir` persists cookies to
  disk, so subsequent runs can use `headless=True`.
* :func:`fetch_item_details` — visit an item page and return title, current
  price, end time, etc.
* :func:`place_bid` — navigate to the item, click "Place bid", enter the max
  amount, and confirm. In dry-run mode, every step is performed except the
  final confirm click.
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from playwright.async_api import (
    Browser,
    BrowserContext,
    Page,
    Playwright,
    TimeoutError as PlaywrightTimeoutError,
    async_playwright,
)

logger = logging.getLogger(__name__)


# Default per-step timeout in milliseconds. Kept short so a frozen page doesn't
# eat into our lead time window.
DEFAULT_STEP_TIMEOUT_MS = 8_000


@dataclass
class ItemDetails:
    item_id: str
    title: str | None
    current_price_cents: int | None
    currency: str
    end_time_utc: datetime | None


@dataclass
class BidResult:
    ok: bool
    dry_run: bool
    final_price_cents: int | None
    error: str | None


class EbayClient:
    """Wrapper around a Playwright persistent context targeting ebay.com."""

    def __init__(
        self,
        *,
        user_data_dir: Path,
        headless: bool = True,
        host: str = "www.ebay.com",
    ) -> None:
        self.user_data_dir = Path(user_data_dir)
        self.headless = headless
        self.host = host
        self._pw: Playwright | None = None
        self._context: BrowserContext | None = None

    async def __aenter__(self) -> "EbayClient":
        self.user_data_dir.mkdir(parents=True, exist_ok=True)
        self._pw = await async_playwright().start()
        self._context = await self._pw.chromium.launch_persistent_context(
            user_data_dir=str(self.user_data_dir),
            headless=self.headless,
            viewport={"width": 1280, "height": 900},
            locale="en-US",
        )
        self._context.set_default_timeout(DEFAULT_STEP_TIMEOUT_MS)
        return self

    async def __aexit__(self, *exc: object) -> None:
        if self._context is not None:
            await self._context.close()
            self._context = None
        if self._pw is not None:
            await self._pw.stop()
            self._pw = None

    def _ctx(self) -> BrowserContext:
        if self._context is None:
            raise RuntimeError("EbayClient used outside of its async context manager")
        return self._context

    def _item_url(self, item_id: str) -> str:
        return f"https://{self.host}/itm/{item_id}"

    # ---- flows ----

    async def is_logged_in(self) -> bool:
        """Cheap check: visit homepage and look for a signed-in indicator."""
        page = await self._ctx().new_page()
        try:
            await page.goto(f"https://{self.host}/", wait_until="domcontentloaded")
            # "Hi <name>" / "My eBay" appears in the header when signed in,
            # "Sign in" when not. We scan for the Sign in link.
            sign_in = await page.locator("a[href*='signin.ebay.com']").first.count()
            return sign_in == 0
        finally:
            await page.close()

    async def fetch_item_details(self, item_id: str) -> ItemDetails:
        page = await self._ctx().new_page()
        try:
            await page.goto(self._item_url(item_id), wait_until="domcontentloaded")
            title = await _safe_text(page, "h1.x-item-title__mainTitle, h1#itemTitle")
            if title:
                title = title.replace("Details about", "").strip()

            price_text = await _safe_text(
                page,
                ".x-price-primary span, .x-bin-price__content span, #prcIsum, #prcIsum_bidPrice",
            )
            currency, cents = _parse_price(price_text) if price_text else ("USD", None)

            end_time = await _extract_end_time(page)
            return ItemDetails(
                item_id=item_id,
                title=title,
                current_price_cents=cents,
                currency=currency,
                end_time_utc=end_time,
            )
        finally:
            await page.close()

    async def place_bid(
        self,
        item_id: str,
        max_bid_cents: int,
        *,
        currency: str = "USD",
        dry_run: bool = False,
    ) -> BidResult:
        """Place a bid. Runs one internal retry handled by :func:`SniperRunner`.

        This function itself is single-shot; callers handle retry.
        """
        max_bid = _cents_to_amount(max_bid_cents)
        page = await self._ctx().new_page()
        try:
            await page.goto(self._item_url(item_id), wait_until="domcontentloaded")

            # Some item pages show a "Place bid" button, others drop you onto a
            # dedicated bid entry page. We try both.
            bid_button = page.locator(
                "a[href*='offer.ebay.com'], button:has-text('Place bid'), "
                "a:has-text('Place bid')"
            ).first
            try:
                await bid_button.click(timeout=DEFAULT_STEP_TIMEOUT_MS)
            except PlaywrightTimeoutError:
                # Already on the bid entry form?
                pass

            # Max-bid amount input. eBay's field is named `maxbid` on the
            # legacy offer page and `MaxBidAmt` on some locales.
            amount_input = page.locator(
                "input[name='maxbid'], input[name='MaxBidAmt'], input#MaxBidAmt"
            ).first
            await amount_input.wait_for(state="visible", timeout=DEFAULT_STEP_TIMEOUT_MS)
            await amount_input.fill("")
            await amount_input.fill(f"{max_bid:.2f}")

            review_button = page.locator(
                "button[name='placebid'], button:has-text('Review bid'), "
                "input[name='placebid']"
            ).first
            await review_button.click(timeout=DEFAULT_STEP_TIMEOUT_MS)

            # Confirmation page.
            confirm_button = page.locator(
                "button[name='confirmbid'], button:has-text('Confirm bid'), "
                "input[name='confirmbid']"
            ).first
            await confirm_button.wait_for(
                state="visible", timeout=DEFAULT_STEP_TIMEOUT_MS
            )

            if dry_run:
                logger.info(
                    "dry-run: would have clicked Confirm bid for item %s at %.2f %s",
                    item_id,
                    max_bid,
                    currency,
                )
                return BidResult(
                    ok=True,
                    dry_run=True,
                    final_price_cents=max_bid_cents,
                    error=None,
                )

            await confirm_button.click(timeout=DEFAULT_STEP_TIMEOUT_MS)

            # Wait for a success marker. eBay shows a banner with
            # "You're the highest bidder" or similar.
            try:
                await page.wait_for_selector(
                    "text=You're the high bidder", timeout=DEFAULT_STEP_TIMEOUT_MS
                )
            except PlaywrightTimeoutError:
                # Not necessarily a failure — might just be slow. We consider
                # the bid submitted if confirm clicked without error.
                logger.info("bid confirm clicked, success banner not detected")

            return BidResult(
                ok=True,
                dry_run=False,
                final_price_cents=max_bid_cents,
                error=None,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("place_bid failed for item %s", item_id)
            return BidResult(
                ok=False,
                dry_run=dry_run,
                final_price_cents=None,
                error=f"{type(exc).__name__}: {exc}",
            )
        finally:
            await page.close()


# ---- helpers ----

_PRICE_RE = re.compile(r"(?P<cur>[A-Z]{1,3}|\$|£|€)?\s*(?P<amt>[\d,]+(?:\.\d{1,2})?)")


def _parse_price(text: str) -> tuple[str, int | None]:
    m = _PRICE_RE.search(text.replace(",", ""))
    if not m:
        return ("USD", None)
    currency = m.group("cur") or "USD"
    if currency == "$":
        currency = "USD"
    elif currency == "£":
        currency = "GBP"
    elif currency == "€":
        currency = "EUR"
    try:
        amount = float(m.group("amt"))
    except ValueError:
        return (currency, None)
    return (currency, round(amount * 100))


def _cents_to_amount(cents: int) -> float:
    return cents / 100.0


async def _safe_text(page: Page, selector: str) -> str | None:
    try:
        el = page.locator(selector).first
        return (await el.text_content(timeout=2_000) or "").strip() or None
    except Exception:  # noqa: BLE001
        return None


async def _extract_end_time(page: Page) -> datetime | None:
    """Pull the auction end time from an item page if present.

    eBay exposes end time in a few places; we try them in order.
    """
    # 1. A <time> element with datetime attribute in the countdown block.
    try:
        el = page.locator("time[datetime]").first
        value = await el.get_attribute("datetime", timeout=1_500)
        if value:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return dt.astimezone(timezone.utc)
    except Exception:  # noqa: BLE001
        pass

    # 2. Meta tag `data-endtime` in milliseconds since epoch.
    try:
        el = page.locator("[data-endtime]").first
        value = await el.get_attribute("data-endtime", timeout=1_500)
        if value and value.isdigit():
            return datetime.fromtimestamp(int(value) / 1000, tz=timezone.utc)
    except Exception:  # noqa: BLE001
        pass

    return None
