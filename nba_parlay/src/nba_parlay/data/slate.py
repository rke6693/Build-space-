"""Today's NBA slate (scheduled games + projected starters).

Uses data.nba.net's public schedule endpoint, which returns the league
schedule by season without authentication. The schema is stable enough for
our purpose: we only need {gameId, date, homeTeam, awayTeam, status}.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime
from typing import List, Optional

import requests
from tenacity import retry, stop_after_attempt, wait_exponential

LOG = logging.getLogger(__name__)

SCHEDULE_URL = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json"
USER_AGENT = "nba-parlay/0.1"


@dataclass(frozen=True)
class Game:
    game_id: str
    game_date: date
    home_team: str        # tricode, e.g. "BOS"
    away_team: str
    home_team_id: int
    away_team_id: int
    status: str           # "scheduled" | "live" | "final"


@retry(stop=stop_after_attempt(4), wait=wait_exponential(multiplier=2, min=2, max=16))
def _fetch_schedule() -> dict:
    r = requests.get(SCHEDULE_URL, headers={"User-Agent": USER_AGENT}, timeout=30)
    r.raise_for_status()
    return r.json()


_STATUS_MAP = {1: "scheduled", 2: "live", 3: "final"}


def todays_games(target: Optional[date] = None) -> List[Game]:
    """Return games scheduled for ``target`` (default: today, US/Eastern)."""
    if target is None:
        target = datetime.utcnow().date()
    payload = _fetch_schedule()
    games: List[Game] = []
    for date_block in payload.get("leagueSchedule", {}).get("gameDates", []):
        gd_str = date_block.get("gameDate", "")
        try:
            gd = datetime.strptime(gd_str.split(" ")[0], "%m/%d/%Y").date()
        except ValueError:
            continue
        if gd != target:
            continue
        for g in date_block.get("games", []):
            try:
                games.append(
                    Game(
                        game_id=str(g["gameId"]),
                        game_date=gd,
                        home_team=g["homeTeam"]["teamTricode"],
                        away_team=g["awayTeam"]["teamTricode"],
                        home_team_id=int(g["homeTeam"]["teamId"]),
                        away_team_id=int(g["awayTeam"]["teamId"]),
                        status=_STATUS_MAP.get(int(g.get("gameStatus", 1)), "scheduled"),
                    )
                )
            except (KeyError, ValueError) as exc:
                LOG.warning("skipping malformed game record: %s", exc)
    return games
