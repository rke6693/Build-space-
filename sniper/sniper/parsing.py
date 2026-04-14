"""Pure-string parsers for money amounts and time-remaining strings.

Split out from the rest of the bot so they can be unit-tested without
booting Playwright. Everything here is side-effect free.
"""

from __future__ import annotations

import re
from typing import Optional

# Matches "$1", "$12.50", "1,234.00", "bid: $3", etc. Picks the FIRST number.
_MONEY_RE = re.compile(r"\$?\s*([0-9]+(?:\.[0-9]{1,2})?)")

# Matches "0:03", "1:23", "3s", "03". Whatnot uses several timer formats
# depending on the page; this covers the ones we've seen.
_TIME_RE = re.compile(r"(?:(\d+):)?(\d{1,2})(?:\s*s)?")

_ENDED_TOKENS = {"ended", "closed", "sold", "sold!", "done"}


def parse_money(text: str) -> Optional[float]:
    """Pull the first dollar amount out of `text`. Returns None if there isn't one."""
    if not text:
        return None
    m = _MONEY_RE.search(text.replace(",", ""))
    return float(m.group(1)) if m else None


def parse_time_left(text: str) -> Optional[float]:
    """Return seconds remaining in an auction.

    - Returns 0.0 if the auction has clearly ended.
    - Returns None if the string is unparseable (so callers can distinguish
      "no data" from "ended").
    """
    if not text:
        return None
    t = text.strip().lower()
    if t in _ENDED_TOKENS:
        return 0.0
    m = _TIME_RE.search(t)
    if not m:
        return None
    mins = int(m.group(1) or 0)
    secs = int(m.group(2) or 0)
    return float(mins * 60 + secs)
