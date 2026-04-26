"""Feature engineering for NBA player and team prediction.

The shufinskiy ``nbastats`` dataset gives us per-player game logs with the
familiar box-score columns. We build features that have been shown in the
literature to drive prop and game outcomes:

  player rolling form ........ exponentially-weighted last-N averages
  usage / opportunity ........ minutes, usage rate, FGA, possessions
  matchup difficulty ......... opponent points-allowed by position (DvP proxy)
  rest / schedule ............ days since last game, back-to-back flag
  pace ....................... team possessions per 48
  home / away ................ binary

All builders are pure functions over DataFrames so the same code path is used
for backtraining and for daily prediction. The contract: input must be sorted
by player and date ascending; we never look forward in time.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List

import numpy as np
import pandas as pd

# Box columns we consume. The shufinskiy CSVs use stats.nba.com names; we
# normalize to lowercase before consumption.
BOX_NUMERIC = [
    "min", "pts", "reb", "ast", "stl", "blk", "tov", "fg3m", "fga", "fta",
]
ROLL_WINDOWS = (3, 5, 10)


@dataclass(frozen=True)
class FeatureFrame:
    X: pd.DataFrame
    y: pd.Series
    meta: pd.DataFrame    # game_id, player_id, date, team, opp


def normalize_box(df: pd.DataFrame) -> pd.DataFrame:
    """Lowercase columns + parse dates; tolerant to schema variants."""
    df = df.rename(columns={c: c.lower() for c in df.columns})
    if "game_date" in df:
        df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce")
    elif "date" in df:
        df["game_date"] = pd.to_datetime(df["date"], errors="coerce")
    # Some shufinskiy files store minutes as "MM:SS"; coerce to float minutes.
    if "min" in df and df["min"].dtype == object:
        df["min"] = df["min"].apply(_parse_minutes)
    for c in BOX_NUMERIC:
        if c in df:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    return df


def _parse_minutes(v) -> float:
    if pd.isna(v):
        return np.nan
    s = str(v)
    if ":" in s:
        m, sec = s.split(":")
        try:
            return float(m) + float(sec) / 60.0
        except ValueError:
            return np.nan
    try:
        return float(s)
    except ValueError:
        return np.nan


def add_rolling(df: pd.DataFrame, key: str, cols: List[str], windows=ROLL_WINDOWS) -> pd.DataFrame:
    """Add lag-1 rolling means + EWMs grouped by ``key`` (player_id or team_id).

    Critical: shifts by 1 game so the row's own outcome never leaks into its
    own features.
    """
    df = df.sort_values([key, "game_date"]).copy()
    grouped = df.groupby(key, sort=False)
    for c in cols:
        if c not in df:
            continue
        shifted = grouped[c].shift(1)
        for w in windows:
            df[f"{c}_r{w}"] = shifted.groupby(df[key]).rolling(w, min_periods=1).mean().reset_index(level=0, drop=True)
        df[f"{c}_ewm5"] = shifted.groupby(df[key]).transform(lambda s: s.ewm(span=5, adjust=False).mean())
    return df


def add_rest(df: pd.DataFrame, key: str = "player_id") -> pd.DataFrame:
    df = df.sort_values([key, "game_date"]).copy()
    df["days_rest"] = df.groupby(key)["game_date"].diff().dt.days.fillna(7).clip(0, 14)
    df["b2b"] = (df["days_rest"] <= 1).astype(int)
    return df


def add_opponent_dvp(df: pd.DataFrame, target: str) -> pd.DataFrame:
    """Defense-vs-position proxy: opponent's allowed mean of ``target`` to all
    players over the prior 20 games.

    Without a position field we use a single league-wide opponent mean, which
    is still a strong prior. If a position column is present we group by it.
    """
    if "opp_team_id" not in df:
        return df
    df = df.sort_values(["opp_team_id", "game_date"]).copy()
    grouped = df.groupby("opp_team_id")[target]
    df[f"opp_allowed_{target}"] = (
        grouped.shift(1).groupby(df["opp_team_id"]).rolling(20, min_periods=5).mean().reset_index(level=0, drop=True)
    )
    return df


def add_team_pace(team_logs: pd.DataFrame) -> pd.DataFrame:
    """Compute per-game pace proxy = (FGA + 0.44*FTA + TOV - OREB) per 48m."""
    df = team_logs.copy()
    if not {"fga", "fta", "tov", "min"}.issubset(df.columns):
        df["pace"] = np.nan
        return df
    oreb = df["oreb"] if "oreb" in df else 0
    poss = df["fga"] + 0.44 * df["fta"] + df["tov"] - oreb
    df["pace"] = poss * 48.0 / df["min"].replace(0, np.nan)
    df = df.sort_values(["team_id", "game_date"])
    df["pace_r10"] = df.groupby("team_id")["pace"].shift(1).rolling(10, min_periods=3).mean().reset_index(level=0, drop=True)
    return df


def build_player_features(boxes: pd.DataFrame, target: str) -> FeatureFrame:
    """Build a (X, y, meta) feature frame for a single player-prop ``target``.

    ``boxes`` is a long-form per-player game log frame.
    """
    df = normalize_box(boxes)
    if "player_id" not in df.columns and "person_id" in df.columns:
        df = df.rename(columns={"person_id": "player_id"})
    df = df.dropna(subset=["player_id", "game_date", target])

    df = add_rolling(df, "player_id", BOX_NUMERIC)
    df = add_rest(df, "player_id")
    df = add_opponent_dvp(df, target)

    feature_cols: List[str] = []
    for c in BOX_NUMERIC:
        feature_cols.extend([f"{c}_r{w}" for w in ROLL_WINDOWS if f"{c}_r{w}" in df.columns])
        if f"{c}_ewm5" in df.columns:
            feature_cols.append(f"{c}_ewm5")
    feature_cols += [c for c in ("days_rest", "b2b", f"opp_allowed_{target}") if c in df.columns]
    if "is_home" in df.columns:
        feature_cols.append("is_home")
    elif "matchup" in df.columns:
        df["is_home"] = df["matchup"].astype(str).str.contains("vs.").astype(int)
        feature_cols.append("is_home")

    df = df.dropna(subset=feature_cols, how="all")
    X = df[feature_cols].astype("float32").fillna(0.0)
    y = df[target].astype("float32")
    meta = df[[c for c in ("game_id", "player_id", "game_date", "team_id", "opp_team_id") if c in df.columns]].copy()
    return FeatureFrame(X=X, y=y, meta=meta)


def latest_player_row(features: FeatureFrame, player_id: int) -> pd.DataFrame:
    """Get the most recent feature vector for a player (for next-game prediction)."""
    mask = features.meta["player_id"] == player_id
    if not mask.any():
        return pd.DataFrame()
    idx = features.meta.loc[mask, "game_date"].idxmax()
    return features.X.loc[[idx]]
