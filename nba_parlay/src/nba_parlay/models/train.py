"""Training entrypoints invoked by the pipeline / CLI."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Iterable, List

import pandas as pd

from ..config import AppConfig
from ..data.downloader import fetch_dataset
from ..features import build_player_features, normalize_box
from .game import GameModel
from .props import PropModel

LOG = logging.getLogger(__name__)

PROP_TARGETS = ("pts", "reb", "ast", "fg3m")


def _player_box_logs(cfg: AppConfig) -> pd.DataFrame:
    raw = fetch_dataset(
        "nbastats",
        cfg.data.train_seasons + [cfg.data.current_season],
        cfg.data.cache_dir,
    )
    if raw.empty:
        raise RuntimeError("no nbastats data available; check shufinskiy downloads")
    return normalize_box(raw)


def train_prop_models(cfg: AppConfig, targets: Iterable[str] = PROP_TARGETS) -> List[PropModel]:
    boxes = _player_box_logs(cfg)
    out: List[PropModel] = []
    for target in targets:
        if target not in boxes.columns:
            LOG.warning("target %s not in box logs; skipping", target)
            continue
        ff = build_player_features(boxes, target)
        # Decay older seasons so the model leans on recent rule/play-style era.
        if "game_date" in ff.meta:
            years_back = (ff.meta["game_date"].max() - ff.meta["game_date"]).dt.days / 365.0
            weights = 0.85 ** years_back.values
        else:
            weights = None
        model = PropModel(target, cfg.models.prop_quantiles, cfg.models.lightgbm)
        model.fit(ff.X, ff.y, sample_weight=weights)
        model.save(cfg.models.artifact_dir / "props")
        out.append(model)
    return out


def train_game_model(cfg: AppConfig) -> GameModel:
    """Aggregate player logs to team-game points and train the game model."""
    boxes = _player_box_logs(cfg)
    if "team_id" not in boxes.columns or "game_id" not in boxes.columns:
        raise RuntimeError("nbastats lacks team_id/game_id; cannot aggregate to team-games")
    team_game = (
        boxes.groupby(["game_id", "team_id", "game_date"], as_index=False)[["pts", "fga", "fta", "tov"]]
        .sum()
    )
    # Construct features: team's rolling points scored / pace + opponent's rolling points allowed.
    team_game = team_game.sort_values(["team_id", "game_date"])
    team_game["pts_r10"] = team_game.groupby("team_id")["pts"].shift(1).rolling(10, min_periods=3).mean().reset_index(level=0, drop=True)
    team_game["pace_r10"] = team_game.groupby("team_id")["fga"].shift(1).rolling(10, min_periods=3).mean().reset_index(level=0, drop=True)
    # Opponent points allowed: join self to game_id.
    pair = team_game.merge(team_game, on="game_id", suffixes=("", "_opp"))
    pair = pair[pair["team_id"] != pair["team_id_opp"]]
    pair["opp_allowed_r10"] = (
        pair.sort_values(["team_id_opp", "game_date"])
            .groupby("team_id_opp")["pts"].shift(1).rolling(10, min_periods=3).mean().reset_index(level=0, drop=True)
    )

    feat_cols = ["pts_r10", "pace_r10", "opp_allowed_r10"]
    pair = pair.dropna(subset=feat_cols + ["pts"])
    X = pair[feat_cols].astype("float32")
    y = pair["pts"].astype("float32")

    model = GameModel(cfg.models.lightgbm)
    model.fit(X, y)
    model.save(cfg.models.artifact_dir / "game")
    return model
