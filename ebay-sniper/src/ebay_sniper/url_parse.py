"""Parse eBay item URLs into (host, item_id)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urlparse

# eBay item URLs look like:
#   https://www.ebay.com/itm/1234567890
#   https://www.ebay.com/itm/Some-Title-Here/1234567890
#   https://www.ebay.com/itm/1234567890?hash=...
# Item IDs are 11-13 digit numeric strings.
_ITEM_ID_RE = re.compile(r"/itm/(?:[^/?#]+/)?(\d{9,14})(?:[/?#]|$)")


@dataclass(frozen=True)
class ParsedItem:
    host: str
    item_id: str

    @property
    def canonical_url(self) -> str:
        return f"https://{self.host}/itm/{self.item_id}"


class UrlParseError(ValueError):
    """Raised when a URL cannot be parsed as an eBay item URL."""


def parse_item_url(url: str) -> ParsedItem:
    """Extract the host and numeric item id from an eBay item URL.

    Only ebay.com is supported in the current scope, but the host is
    preserved so future locales can be added without a migration.
    """
    if not url or not isinstance(url, str):
        raise UrlParseError("url must be a non-empty string")

    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https"):
        raise UrlParseError(f"unsupported scheme: {parsed.scheme!r}")

    host = (parsed.netloc or "").lower()
    if not host.endswith("ebay.com"):
        raise UrlParseError(f"not an ebay.com URL: {host!r}")

    match = _ITEM_ID_RE.search(parsed.path)
    if not match:
        raise UrlParseError(f"no item id found in path: {parsed.path!r}")

    return ParsedItem(host=host, item_id=match.group(1))
