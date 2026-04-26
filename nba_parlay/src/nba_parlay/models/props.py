"""Player-prop prediction model.

We model each prop target (points, rebounds, assists, threes) with a
LightGBM quantile regressor. Multiple quantiles per target give us a full
predictive distribution; the over/under probability for any line is then
the empirical CDF evaluated at the line.

Why quantile regression vs. point + assumed normal:
  - Counts are skewed and zero-inflated (especially threes/assists for
    bench players). Quantiles capture skew without distributional assumptions.
  - The over/under contract is fundamentally a quantile question.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from scipy.interpolate import PchipInterpolator

from ..config import LightGBMParams

LOG = logging.getLogger(__name__)


@dataclass
class PropPrediction:
    target: str
    line: float
    over_prob: float
    median: float
    quantiles: Dict[float, float]


class PropModel:
    """A bag of quantile regressors for one prop target (e.g. ``pts``)."""

    def __init__(self, target: str, quantiles: List[float], params: LightGBMParams):
        self.target = target
        self.quantiles = sorted(quantiles)
        self.params = params
        self.models: Dict[float, lgb.LGBMRegressor] = {}
        self.feature_names: List[str] = []

    def fit(self, X: pd.DataFrame, y: pd.Series, sample_weight: Optional[np.ndarray] = None) -> "PropModel":
        self.feature_names = list(X.columns)
        for q in self.quantiles:
            m = lgb.LGBMRegressor(
                objective="quantile",
                alpha=q,
                num_leaves=self.params.num_leaves,
                learning_rate=self.params.learning_rate,
                n_estimators=self.params.n_estimators,
                min_child_samples=self.params.min_child_samples,
                feature_fraction=self.params.feature_fraction,
                bagging_fraction=self.params.bagging_fraction,
                bagging_freq=self.params.bagging_freq,
                verbose=-1,
            )
            m.fit(X, y, sample_weight=sample_weight)
            self.models[q] = m
            LOG.info("fit %s q=%.2f n=%d", self.target, q, len(y))
        return self

    def predict_quantiles(self, X: pd.DataFrame) -> pd.DataFrame:
        X = X[self.feature_names]
        out = pd.DataFrame(index=X.index)
        for q, m in self.models.items():
            out[q] = np.maximum(0.0, m.predict(X))
        # Enforce monotonicity (rare violations from LGBM noise).
        out = out.cummax(axis=1)
        return out

    def over_probability(self, X: pd.DataFrame, line: float) -> np.ndarray:
        """P(target > line) via PCHIP interpolation across quantile predictions."""
        qframe = self.predict_quantiles(X)
        qs = np.array(self.quantiles, dtype=float)
        out = np.empty(len(qframe))
        for i, (_, row) in enumerate(qframe.iterrows()):
            ys = row.values.astype(float)
            # Guard against degenerate (constant) predictions.
            if np.allclose(ys, ys[0]):
                out[i] = 1.0 if line < ys[0] else 0.0
                continue
            interp = PchipInterpolator(ys, qs, extrapolate=True)
            cdf = float(np.clip(interp(line), 0.0, 1.0))
            out[i] = 1.0 - cdf
        return out

    def predict_one(self, x: pd.DataFrame, line: float) -> PropPrediction:
        qframe = self.predict_quantiles(x)
        row = qframe.iloc[0]
        return PropPrediction(
            target=self.target,
            line=line,
            over_prob=float(self.over_probability(x, line)[0]),
            median=float(row[0.5]) if 0.5 in row.index else float(row.median()),
            quantiles={float(k): float(v) for k, v in row.items()},
        )

    def save(self, dir_: Path) -> None:
        dir_.mkdir(parents=True, exist_ok=True)
        for q, m in self.models.items():
            joblib.dump(m, dir_ / f"{self.target}_q{int(q*100):02d}.joblib")
        (dir_ / f"{self.target}_meta.json").write_text(
            json.dumps({"target": self.target, "quantiles": self.quantiles, "features": self.feature_names})
        )

    @classmethod
    def load(cls, dir_: Path, target: str, params: LightGBMParams) -> "PropModel":
        meta = json.loads((dir_ / f"{target}_meta.json").read_text())
        inst = cls(target, meta["quantiles"], params)
        inst.feature_names = meta["features"]
        for q in inst.quantiles:
            inst.models[q] = joblib.load(dir_ / f"{target}_q{int(q*100):02d}.joblib")
        return inst
