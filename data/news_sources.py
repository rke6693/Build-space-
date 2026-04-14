"""RSS + public news feed aggregator.

Ingests a curated set of feeds that tend to move Polymarket prices:
  * Reuters topwire / politics / business
  * AP top headlines
  * BBC top stories
  * CoinDesk / The Block (crypto)
  * ESPN top headlines (sports markets)
  * Federal Reserve press releases

Each cycle returns any item published since the last poll. We never
block — errors on individual feeds are logged and skipped.
"""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Dict, List, Set

import aiohttp
import feedparser

from core.logger import get_logger

log = get_logger("news")


DEFAULT_FEEDS: List[str] = [
    # General wire services
    "https://feeds.reuters.com/reuters/topNews",
    "https://feeds.reuters.com/Reuters/PoliticsNews",
    "https://feeds.reuters.com/reuters/businessNews",
    "https://feeds.bbci.co.uk/news/rss.xml",
    "https://feeds.bbci.co.uk/news/world/rss.xml",
    "https://feeds.bbci.co.uk/news/politics/rss.xml",
    "https://feeds.npr.org/1001/rss.xml",
    "https://www.theguardian.com/world/rss",
    # Crypto
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://cointelegraph.com/rss",
    "https://www.theblock.co/rss.xml",
    # Sports
    "https://www.espn.com/espn/rss/news",
    # Macro / official
    "https://www.federalreserve.gov/feeds/press_all.xml",
]


@dataclass
class NewsItem:
    title: str
    summary: str
    link: str
    published: float  # unix ts
    source: str


class NewsPoller:
    def __init__(self, feeds: List[str] | None = None) -> None:
        self.feeds = feeds or DEFAULT_FEEDS
        self._seen: Set[str] = set()
        self._first_run = True

    async def poll(self) -> List[NewsItem]:
        timeout = aiohttp.ClientTimeout(total=20)
        out: List[NewsItem] = []
        async with aiohttp.ClientSession(timeout=timeout) as sess:
            tasks = [self._fetch_one(sess, url) for url in self.feeds]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for r in results:
                if isinstance(r, list):
                    out.extend(r)

        # On first run, seed the seen-set with everything so we don't flood
        # the bot with stale headlines.
        if self._first_run:
            for item in out:
                self._seen.add(item.link)
            self._first_run = False
            return []

        fresh = [it for it in out if it.link not in self._seen]
        for it in fresh:
            self._seen.add(it.link)

        # Cap seen set
        if len(self._seen) > 5000:
            self._seen = set(list(self._seen)[-2500:])

        # Sort newest first
        fresh.sort(key=lambda x: x.published, reverse=True)
        return fresh

    async def _fetch_one(self, sess: aiohttp.ClientSession, url: str) -> List[NewsItem]:
        try:
            async with sess.get(
                url, headers={"User-Agent": "Mozilla/5.0 polybot/1.0"}
            ) as resp:
                if resp.status != 200:
                    return []
                body = await resp.text()
        except Exception as e:  # noqa: BLE001
            log.debug("news.fetch_err", url=url, err=str(e))
            return []

        try:
            parsed = feedparser.parse(body)
        except Exception as e:  # noqa: BLE001
            log.debug("news.parse_err", url=url, err=str(e))
            return []

        source = url
        out: List[NewsItem] = []
        for e in parsed.entries[:30]:
            link = e.get("link", "") or e.get("id", "")
            if not link:
                continue
            pub = 0.0
            if getattr(e, "published_parsed", None):
                try:
                    pub = time.mktime(e.published_parsed)  # type: ignore[arg-type]
                except Exception:  # noqa: BLE001
                    pub = time.time()
            else:
                pub = time.time()
            out.append(
                NewsItem(
                    title=e.get("title", "")[:500],
                    summary=(e.get("summary", "") or "")[:1000],
                    link=link,
                    published=pub,
                    source=source,
                )
            )
        return out
