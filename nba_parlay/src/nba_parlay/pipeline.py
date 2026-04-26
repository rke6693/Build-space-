"""Daily prediction pipeline.

Steps:
  1. Load trained models from disk.
  2. Fetch today's slate (NBA schedule).
  3. Fetch sportsbook odds for those games.
  4. Score each book line with the corresponding model -> Leg.
  5. Run the parlay optimizer.
  6. Render HTML + plaintext report and email it.
"""
from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Dict, List, Optional

import pandas as pd

from .config import AppConfig
from .data.downloader import fetch_dataset
from .data.odds import OddsLine, best_price_per_leg, fetch_odds
from .data.slate import Game, todays_games
from .features import build_player_features, normalize_box
from .models.game import GameModel
from .models.props import PropModel
from .parlay import Leg, generate_parlays
from .report import GameRow, render_html, render_text, send_email

LOG = logging.getLogger(__name__)

PROP_TARGETS = {"player_points": "pts", "player_rebounds": "reb", "player_assists": "ast", "player_threes": "fg3m"}


def _name_to_player_id(boxes: pd.DataFrame) -> Dict[str, int]:
    """Build a recent name -> player_id map from box logs."""
    if "player_name" not in boxes.columns or "player_id" not in boxes.columns:
        return {}
    last = boxes.sort_values("game_date").drop_duplicates("player_name", keep="last")
    return {str(n).lower().strip(): int(pid) for n, pid in zip(last["player_name"], last["player_id"])}


def _team_pts_features(boxes: pd.DataFrame, team_id: int, asof: date) -> pd.DataFrame:
    sub = boxes[(boxes["team_id"] == team_id) & (boxes["game_date"] < pd.Timestamp(asof))]
    if sub.empty:
        return pd.DataFrame([{"pts_r10": 110.0, "pace_r10": 90.0, "opp_allowed_r10": 110.0}])
    last = sub.sort_values("game_date").tail(10)
    return pd.DataFrame([{
        "pts_r10": float(last["pts"].mean()),
        "pace_r10": float((last["fga"] + 0.44 * last.get("fta", 0) + last.get("tov", 0)).mean()),
        "opp_allowed_r10": 110.0,
    }])


def run_daily(cfg: AppConfig, target_date: Optional[date] = None) -> None:
    target_date = target_date or datetime.utcnow().date()

    # 1. Load models
    prop_models: Dict[str, PropModel] = {}
    for tgt in PROP_TARGETS.values():
        try:
            prop_models[tgt] = PropModel.load(cfg.models.artifact_dir / "props", tgt, cfg.models.lightgbm)
        except FileNotFoundError:
            LOG.warning("prop model %s not trained; skipping", tgt)
    try:
        game_model: Optional[GameModel] = GameModel.load(cfg.models.artifact_dir / "game", cfg.models.lightgbm)
    except FileNotFoundError:
        LOG.warning("game model not trained; skipping game markets")
        game_model = None

    # 2. Today's slate
    games = todays_games(target_date)
    if not games:
        LOG.info("no games scheduled for %s", target_date)
    LOG.info("slate: %d games", len(games))

    # 3. Odds
    if not cfg.odds_api_key:
        raise RuntimeError("THE_ODDS_API_KEY not set")
    odds = fetch_odds(
        cfg.odds_api_key,
        region=cfg.odds.region,
        markets=cfg.odds.markets,
        bookmakers=cfg.odds.bookmakers,
    )
    odds = best_price_per_leg(odds)
    LOG.info("odds: %d unique legs across books", len(odds))

    # 4. Score legs
    boxes = normalize_box(fetch_dataset("nbastats", [cfg.data.current_season], cfg.data.cache_dir))
    name_to_id = _name_to_player_id(boxes)

    # Cache prop feature frames per target so we build features once.
    feature_frames = {tgt: build_player_features(boxes, tgt) for tgt in prop_models}

    legs: List[Leg] = []
    game_predictions = {}
    if game_model:
        for g in games:
            home_X = _team_pts_features(boxes, g.home_team_id, target_date)
            away_X = _team_pts_features(boxes, g.away_team_id, target_date)
            preds = game_model.predict(home_X, away_X)
            game_predictions[g.game_id] = preds[0]

    for ln in odds:
        prob = _model_prob_for_line(ln, prop_models, feature_frames, name_to_id, game_predictions)
        if prob is None:
            continue
        legs.append(Leg(
            game_id=ln.game_id,
            market=ln.market,
            selection=ln.selection,
            side=ln.side,
            point=ln.point,
            price_decimal=ln.price_decimal,
            model_prob=prob,
            book=ln.book,
        ))

    # 5. Parlays
    parlays = generate_parlays(
        legs,
        min_legs=cfg.parlay.min_legs,
        max_legs=cfg.parlay.max_legs,
        edge_threshold=cfg.parlay.edge_threshold,
        min_leg_prob=cfg.parlay.min_leg_prob,
        max_leg_prob=cfg.parlay.max_leg_prob,
        correlation_mode=cfg.parlay.correlation_mode,
        kelly_fraction=cfg.parlay.kelly_fraction,
        top_n=cfg.parlay.top_n,
    )

    # 6. Report
    game_rows = _game_rows(games, game_predictions)
    html = render_html(
        report_date=target_date,
        parlays=parlays,
        games=game_rows,
        legs_count=len(legs),
    )
    text = render_text(parlays)
    send_email(
        cfg,
        subject=f"{target_date.isoformat()} — {len(parlays)} parlays",
        html=html,
        text=text,
    )


def _model_prob_for_line(
    ln: OddsLine,
    prop_models: Dict[str, "PropModel"],
    feature_frames,
    name_to_id: Dict[str, int],
    game_predictions,
) -> Optional[float]:
    if ln.market in PROP_TARGETS:
        target = PROP_TARGETS[ln.market]
        model = prop_models.get(target)
        if model is None or ln.point is None or ln.side is None:
            return None
        pid = name_to_id.get(ln.selection.lower().strip())
        if pid is None:
            return None
        from .features import latest_player_row
        x = latest_player_row(feature_frames[target], pid)
        if x.empty:
            return None
        over_p = float(model.over_probability(x, ln.point)[0])
        return over_p if ln.side == "over" else 1.0 - over_p

    pred = game_predictions.get(ln.game_id)
    if pred is None:
        return None
    if ln.market == "totals" and ln.point is not None and ln.side is not None:
        over = pred.total_over_prob(ln.point)
        return over if ln.side == "over" else 1.0 - over
    if ln.market == "spreads" and ln.point is not None:
        # ln.point is the spread for ln.selection's team. If positive, that's the underdog spread.
        # We compare against home_cover_prob; flip if selection is the away team.
        is_home = ln.selection == ln.home_team
        spread_home = ln.point if is_home else -ln.point
        cover = pred.home_cover_prob(spread_home)
        return cover if is_home else 1.0 - cover
    if ln.market == "h2h":
        is_home = ln.selection == ln.home_team
        return pred.home_win_prob if is_home else 1.0 - pred.home_win_prob
    return None


def _game_rows(games: List[Game], game_predictions) -> List[GameRow]:
    rows: List[GameRow] = []
    for g in games:
        p = game_predictions.get(g.game_id)
        if p is None:
            rows.append(GameRow(away=g.away_team, home=g.home_team, total=0.0, spread=0.0, home_win_prob=0.5))
        else:
            rows.append(GameRow(
                away=g.away_team,
                home=g.home_team,
                total=p.total_mean,
                spread=p.spread_mean,
                home_win_prob=p.home_win_prob,
            ))
    return rows
