"""Sportsbook odds client (The Odds API).

Returns a normalized list of "betting lines" — each leg has:
    game_id, market, selection, point (line), price (decimal), book.
We store American prices as decimal for consistent math downstream.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Iterable, List, Optional

import requests
from tenacity import retry, stop_after_attempt, wait_exponential

LOG = logging.getLogger(__name__)

BASE = "https://api.the-odds-api.com/v4"
USER_AGENT = "nba-parlay/0.1"


@dataclass(frozen=True)
class OddsLine:
    game_id: str
    commence_time: str
    home_team: str
    away_team: str
    book: str
    market: str               # e.g. "h2h", "spreads", "totals", "player_points"
    selection: str            # team name OR player name + side ("over"/"under")
    side: Optional[str]       # "over" | "under" | None
    point: Optional[float]    # line (None for h2h)
    price_decimal: float


def _american_to_decimal(price: float) -> float:
    return 1.0 + (price / 100.0 if price > 0 else 100.0 / abs(price))


@retry(stop=stop_after_attempt(4), wait=wait_exponential(multiplier=2, min=2, max=16))
def _get(url: str, params: dict) -> list | dict:
    r = requests.get(url, params=params, headers={"User-Agent": USER_AGENT}, timeout=30)
    if r.status_code == 422:
        # Unsupported market for league/region — treat as empty.
        return []
    r.raise_for_status()
    return r.json()


def fetch_odds(
    api_key: str,
    region: str = "us",
    markets: Iterable[str] = ("h2h", "spreads", "totals"),
    bookmakers: Iterable[str] = (),
) -> List[OddsLine]:
    """Pull NBA odds for the configured markets.

    Player-prop markets must be requested per-event (The Odds API design),
    so we first list events then loop. This keeps quota usage minimal.
    """
    params_common = {"apiKey": api_key, "regions": region, "oddsFormat": "american"}
    if bookmakers:
        params_common["bookmakers"] = ",".join(bookmakers)

    game_markets = [m for m in markets if not m.startswith("player_")]
    prop_markets = [m for m in markets if m.startswith("player_")]

    out: List[OddsLine] = []

    if game_markets:
        data = _get(
            f"{BASE}/sports/basketball_nba/odds",
            {**params_common, "markets": ",".join(game_markets)},
        )
        out.extend(_parse_events(data))

    if prop_markets:
        events = _get(f"{BASE}/sports/basketball_nba/events", {"apiKey": api_key})
        for ev in events or []:
            ev_id = ev.get("id")
            if not ev_id:
                continue
            data = _get(
                f"{BASE}/sports/basketball_nba/events/{ev_id}/odds",
                {**params_common, "markets": ",".join(prop_markets)},
            )
            # Single-event response is an object, not a list.
            out.extend(_parse_events([data] if isinstance(data, dict) else data))

    return out


def _parse_events(events: list) -> List[OddsLine]:
    lines: List[OddsLine] = []
    for ev in events or []:
        gid = str(ev.get("id", ""))
        ct = ev.get("commence_time", "")
        home = ev.get("home_team", "")
        away = ev.get("away_team", "")
        for book in ev.get("bookmakers", []):
            book_key = book.get("key", "")
            for mkt in book.get("markets", []):
                mkt_key = mkt.get("key", "")
                for outcome in mkt.get("outcomes", []):
                    name = outcome.get("name", "")
                    desc = outcome.get("description")  # player name for prop markets
                    point = outcome.get("point")
                    price = outcome.get("price")
                    if price is None:
                        continue
                    if mkt_key.startswith("player_") and desc:
                        selection = f"{desc}"
                        side = name.lower()  # "Over" / "Under"
                    elif mkt_key == "totals":
                        selection = name           # "Over" / "Under"
                        side = name.lower()
                    else:
                        selection = name
                        side = None
                    lines.append(
                        OddsLine(
                            game_id=gid,
                            commence_time=ct,
                            home_team=home,
                            away_team=away,
                            book=book_key,
                            market=mkt_key,
                            selection=selection,
                            side=side,
                            point=float(point) if point is not None else None,
                            price_decimal=_american_to_decimal(float(price)),
                        )
                    )
    return lines


def best_price_per_leg(lines: Iterable[OddsLine]) -> List[OddsLine]:
    """Reduce multi-book lines to the single best price for each unique leg."""
    bucket: dict[tuple, OddsLine] = {}
    for ln in lines:
        key = (ln.game_id, ln.market, ln.selection, ln.side, ln.point)
        if key not in bucket or ln.price_decimal > bucket[key].price_decimal:
            bucket[key] = ln
    return list(bucket.values())
