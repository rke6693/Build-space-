"""Feature builders should never leak future info into past rows."""
from __future__ import annotations

import numpy as np
import pandas as pd

from nba_parlay.features import add_rest, add_rolling, normalize_box


def _toy_logs() -> pd.DataFrame:
    rows = []
    for d in range(10):
        rows.append({
            "player_id": 1,
            "game_date": pd.Timestamp("2024-01-01") + pd.Timedelta(days=d * 2),
            "pts": 10 + d,
            "reb": 5,
            "ast": 4,
            "stl": 1, "blk": 0, "tov": 2, "fg3m": 1, "fga": 12, "fta": 4,
            "min": "32:00",
        })
    return pd.DataFrame(rows)


def test_normalize_box_parses_minutes_and_dates():
    df = normalize_box(_toy_logs())
    assert df["game_date"].dtype.kind == "M"
    assert df["min"].iloc[0] == 32.0


def test_add_rolling_does_not_leak_future():
    df = normalize_box(_toy_logs())
    df = add_rolling(df, "player_id", ["pts"])
    # Row 0 should have NaN/0 rolling because there's no prior history.
    assert pd.isna(df["pts_r3"].iloc[0])
    # Row 1's r3 should equal row 0's pts (only one prior value).
    assert df["pts_r3"].iloc[1] == df["pts"].iloc[0]
    # Row 5's r3 should equal mean of rows 2..4.
    expected = df["pts"].iloc[2:5].mean()
    assert np.isclose(df["pts_r3"].iloc[5], expected)


def test_add_rest_flags_back_to_back():
    df = normalize_box(_toy_logs()).copy()
    # Insert a back-to-back: shrink gap between rows 4 and 5.
    df.loc[5, "game_date"] = df.loc[4, "game_date"] + pd.Timedelta(days=1)
    df = add_rest(df, "player_id")
    assert df.loc[5, "b2b"] == 1
    assert df.loc[6, "b2b"] == 0
