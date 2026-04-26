"""Game-level prediction model: total points + spread + moneyline.

A single LightGBM regressor predicts each team's expected points; we then
derive:
  - total = home_pts_hat + away_pts_hat, with sigma estimated from training residuals
  - spread = home_pts_hat - away_pts_hat
  - moneyline P(home win) via a logistic over the score differential

All three "markets" share the same feature inputs (team rolling form, pace,
rest, opponent strength) so we get internal consistency between them — a key
property when we later check parlay correlations.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from scipy.stats import norm

from ..config import LightGBMParams

LOG = logging.getLogger(__name__)


@dataclass
class GamePrediction:
    home_pts: float
    away_pts: float
    total_mean: float
    total_sigma: float
    spread_mean: float    # home - away
    home_win_prob: float

    def total_over_prob(self, line: float) -> float:
        return float(1.0 - norm.cdf(line, loc=self.total_mean, scale=self.total_sigma))

    def home_cover_prob(self, spread_line: float) -> float:
        # spread_line is the home spread, e.g. -4.5 means home favored by 4.5.
        # Home covers if (home - away) > -spread_line  =>  margin > -spread_line.
        return float(1.0 - norm.cdf(-spread_line, loc=self.spread_mean, scale=self.total_sigma))


class GameModel:
    """Predicts each side's points; derives totals/spread/ML."""

    def __init__(self, params: LightGBMParams):
        self.params = params
        self.model: Optional[lgb.LGBMRegressor] = None
        self.feature_names: List[str] = []
        self.residual_sigma: float = 12.0  # filled at fit time

    def fit(self, X: pd.DataFrame, y: pd.Series) -> "GameModel":
        self.feature_names = list(X.columns)
        self.model = lgb.LGBMRegressor(
            objective="regression",
            num_leaves=self.params.num_leaves,
            learning_rate=self.params.learning_rate,
            n_estimators=self.params.n_estimators,
            min_child_samples=self.params.min_child_samples,
            feature_fraction=self.params.feature_fraction,
            bagging_fraction=self.params.bagging_fraction,
            bagging_freq=self.params.bagging_freq,
            verbose=-1,
        )
        self.model.fit(X, y)
        residuals = y.values - self.model.predict(X)
        # In-sample residual std underestimates true variance; inflate slightly.
        self.residual_sigma = float(np.std(residuals) * 1.05) or 12.0
        LOG.info("game model fit n=%d sigma=%.2f", len(y), self.residual_sigma)
        return self

    def _predict_side(self, X: pd.DataFrame) -> np.ndarray:
        if self.model is None:
            raise RuntimeError("model not fit")
        return np.maximum(60.0, self.model.predict(X[self.feature_names]))

    def predict(self, home_X: pd.DataFrame, away_X: pd.DataFrame) -> List[GamePrediction]:
        home_pts = self._predict_side(home_X)
        away_pts = self._predict_side(away_X)
        # Total variance = sum of side variances assuming weak correlation.
        sigma_total = float(self.residual_sigma * np.sqrt(2.0))
        out: List[GamePrediction] = []
        for hp, ap in zip(home_pts, away_pts):
            margin = hp - ap
            win_prob = float(1.0 - norm.cdf(0.0, loc=margin, scale=sigma_total))
            out.append(
                GamePrediction(
                    home_pts=float(hp),
                    away_pts=float(ap),
                    total_mean=float(hp + ap),
                    total_sigma=sigma_total,
                    spread_mean=float(margin),
                    home_win_prob=win_prob,
                )
            )
        return out

    def save(self, dir_: Path) -> None:
        dir_.mkdir(parents=True, exist_ok=True)
        joblib.dump(self.model, dir_ / "game_model.joblib")
        (dir_ / "game_meta.json").write_text(
            json.dumps({"features": self.feature_names, "residual_sigma": self.residual_sigma})
        )

    @classmethod
    def load(cls, dir_: Path, params: LightGBMParams) -> "GameModel":
        inst = cls(params)
        inst.model = joblib.load(dir_ / "game_model.joblib")
        meta = json.loads((dir_ / "game_meta.json").read_text())
        inst.feature_names = meta["features"]
        inst.residual_sigma = float(meta["residual_sigma"])
        return inst
