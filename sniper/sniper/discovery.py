"""Discover currently-live Whatnot streams from the public listing pages.

Whatnot's `/live` listing is server-rendered (with hydration), so we can
just scrape anchor tags. The bot uses a single dedicated page that hops
between configured listing URLs and harvests anchors that look like
`/live/<slug>`. The result is filtered through optional title keyword and
blocklist rules so you can bias the bot toward what you actually collect.
"""

from __future__ import annotations

import dataclasses
import re
from typing import List

from playwright.async_api import Page

from .config import Config

# Whatnot live URLs look like /live/<slug>. We tolerate trailing slash + qs.
_LIVE_PATH_RE = re.compile(r"/live/([^/?#]+)")


@dataclasses.dataclass(frozen=True)
class StreamCandidate:
    url: str
    title: str

    @property
    def slug(self) -> str:
        m = _LIVE_PATH_RE.search(self.url)
        return m.group(1) if m else self.url


def filter_candidates(
    candidates: List[StreamCandidate],
    keywords: List[str],
    blocklist: List[str],
) -> List[StreamCandidate]:
    """Apply title keyword + blocklist filters and de-dupe by slug.

    Pure function, easy to test. Title matching is case-insensitive
    substring matching against the candidate's title.
    """
    kw = [k.lower() for k in keywords if k]
    bl = [b.lower() for b in blocklist if b]
    out: List[StreamCandidate] = []
    for c in candidates:
        title = (c.title or "").lower()
        if bl and any(b in title for b in bl):
            continue
        if kw and not any(k in title for k in kw):
            continue
        out.append(c)

    seen: set = set()
    unique: List[StreamCandidate] = []
    for c in out:
        if c.slug in seen:
            continue
        seen.add(c.slug)
        unique.append(c)
    return unique


def normalize_href(href: str) -> str:
    if href.startswith("http"):
        return href
    if href.startswith("/"):
        return f"https://www.whatnot.com{href}"
    return f"https://www.whatnot.com/{href}"


async def discover_streams(page: Page, cfg: Config) -> List[StreamCandidate]:
    """Visit each listing URL and harvest live-stream links."""
    sel = cfg.selectors
    found: List[StreamCandidate] = []
    for url in cfg.discovery.listing_urls:
        try:
            await page.goto(url, wait_until="domcontentloaded")
            # Give lazy listings a moment to populate after hydration.
            await page.wait_for_timeout(1500)
            anchors = await page.query_selector_all(sel.livestream_link)
            for a in anchors:
                href = await a.get_attribute("href")
                if not href or not _LIVE_PATH_RE.search(href):
                    continue
                title = ""
                try:
                    title_el = await a.query_selector(sel.livestream_title)
                    if title_el:
                        title = (await title_el.inner_text()).strip()
                    else:
                        title = (await a.inner_text()).strip()
                except Exception:
                    pass
                found.append(StreamCandidate(url=normalize_href(href), title=title))
        except Exception:
            # One bad listing URL shouldn't kill discovery for the rest.
            continue

    return filter_candidates(
        found,
        cfg.discovery.title_keywords,
        cfg.discovery.title_blocklist,
    )
