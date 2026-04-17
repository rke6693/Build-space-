"""Machine-learning prediction for packaging development workflows.

Public entry point: ``predict_packaging``. Given a product's dimensions,
weight, fragility, and category, it returns a recommended box size, material,
estimated material cost, and damage-risk score. If a trained model artifact
is not present at ``model_path``, one is trained on the supplied
``training_data`` (falling back to a built-in synthetic dataset) and persisted
for subsequent calls.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Literal

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingRegressor, RandomForestClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

BoxSize = Literal["S", "M", "L", "XL"]
Material = Literal["cardboard", "corrugated", "padded"]
Fragility = Literal["low", "medium", "high"]
Category = Literal["electronics", "apparel", "books", "homegoods", "food"]

NUMERIC_FEATURES = ["length_cm", "width_cm", "height_cm", "weight_kg"]
CATEGORICAL_FEATURES = ["fragility", "category"]
REQUIRED_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES

DEFAULT_MODEL_PATH = Path("ml/models/packaging_model.joblib")


@dataclass(frozen=True)
class PackagingPrediction:
    recommended_box_size: BoxSize
    estimated_material_cost_usd: float
    damage_risk_score: float
    recommended_material: Material


@dataclass
class _ModelBundle:
    box_size: Pipeline
    material: Pipeline
    cost: Pipeline
    damage_risk: Pipeline


def _build_preprocessor() -> ColumnTransformer:
    return ColumnTransformer(
        transformers=[
            ("num", StandardScaler(), NUMERIC_FEATURES),
            ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_FEATURES),
        ]
    )


def _train_bundle(training_data: pd.DataFrame) -> _ModelBundle:
    X = training_data[REQUIRED_FEATURES]
    box_size = Pipeline(
        [("pre", _build_preprocessor()), ("clf", RandomForestClassifier(n_estimators=100, random_state=0))]
    ).fit(X, training_data["box_size"])
    material = Pipeline(
        [("pre", _build_preprocessor()), ("clf", RandomForestClassifier(n_estimators=100, random_state=0))]
    ).fit(X, training_data["material"])
    cost = Pipeline(
        [("pre", _build_preprocessor()), ("reg", GradientBoostingRegressor(random_state=0))]
    ).fit(X, training_data["cost_usd"])
    damage_risk = Pipeline(
        [("pre", _build_preprocessor()), ("reg", GradientBoostingRegressor(random_state=0))]
    ).fit(X, training_data["damage_risk"])
    return _ModelBundle(box_size=box_size, material=material, cost=cost, damage_risk=damage_risk)


def _generate_synthetic_dataset(n: int = 500, seed: int = 0) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    length = rng.lognormal(mean=3.0, sigma=0.5, size=n)
    width = rng.lognormal(mean=3.0, sigma=0.5, size=n)
    height = rng.lognormal(mean=3.0, sigma=0.5, size=n)
    weight = rng.lognormal(mean=0.0, sigma=0.8, size=n)
    fragility = rng.choice(["low", "medium", "high"], size=n, p=[0.55, 0.30, 0.15])
    category = rng.choice(
        ["electronics", "apparel", "books", "homegoods", "food"],
        size=n,
        p=[0.22, 0.25, 0.18, 0.20, 0.15],
    )

    volume = length * width * height
    quantiles = np.quantile(volume, [0.25, 0.5, 0.75])
    box_size = np.where(
        volume < quantiles[0], "S",
        np.where(volume < quantiles[1], "M", np.where(volume < quantiles[2], "L", "XL")),
    )

    material = np.where(
        fragility == "high", "padded",
        np.where(weight > 5.0, "corrugated", "cardboard"),
    )

    markup = np.where(material == "padded", 2.5, np.where(material == "corrugated", 0.8, 0.0))
    cost = 0.5 + 0.00015 * volume + 0.6 * weight + markup + rng.normal(0, 0.15, size=n)
    cost = np.clip(cost, 0.25, None)

    fragility_score = np.select(
        [fragility == "low", fragility == "medium", fragility == "high"],
        [0.0, 0.4, 0.9],
    )
    protection = np.select(
        [material == "cardboard", material == "corrugated", material == "padded"],
        [0.0, 0.3, 0.8],
    )
    logits = weight / 10.0 + fragility_score - protection + rng.normal(0, 0.1, size=n)
    damage_risk = 1.0 / (1.0 + np.exp(-logits))

    return pd.DataFrame(
        {
            "length_cm": length,
            "width_cm": width,
            "height_cm": height,
            "weight_kg": weight,
            "fragility": fragility,
            "category": category,
            "box_size": box_size,
            "material": material,
            "cost_usd": cost,
            "damage_risk": damage_risk,
        }
    )


def _to_dataframe(product_features: dict | pd.DataFrame) -> tuple[pd.DataFrame, bool]:
    if isinstance(product_features, pd.DataFrame):
        df = product_features
        single = False
    elif isinstance(product_features, dict):
        df = pd.DataFrame([product_features])
        single = True
    else:
        raise TypeError(
            f"product_features must be a dict or DataFrame, got {type(product_features).__name__}"
        )
    missing = [f for f in REQUIRED_FEATURES if f not in df.columns]
    if missing:
        raise ValueError(f"Missing required feature columns: {missing}")
    return df[REQUIRED_FEATURES].copy(), single


def _predict_bundle(bundle: _ModelBundle, X: pd.DataFrame) -> list[PackagingPrediction]:
    box = bundle.box_size.predict(X)
    mat = bundle.material.predict(X)
    cost = bundle.cost.predict(X)
    risk = np.clip(bundle.damage_risk.predict(X), 0.0, 1.0)
    return [
        PackagingPrediction(
            recommended_box_size=str(box[i]),
            estimated_material_cost_usd=round(float(cost[i]), 2),
            damage_risk_score=float(risk[i]),
            recommended_material=str(mat[i]),
        )
        for i in range(len(X))
    ]


def predict_packaging(
    product_features: dict | pd.DataFrame,
    model_path: str | Path = DEFAULT_MODEL_PATH,
    training_data: pd.DataFrame | None = None,
) -> PackagingPrediction | list[PackagingPrediction]:
    """Predict packaging recommendations for one or more products.

    Trains and persists a model to ``model_path`` on first use, then reloads
    it on subsequent calls. Pass ``training_data`` to override the built-in
    synthetic dataset.
    """
    path = Path(model_path)
    if path.exists():
        bundle: _ModelBundle = joblib.load(path)
    else:
        data = training_data if training_data is not None else _generate_synthetic_dataset()
        bundle = _train_bundle(data)
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(bundle, path)

    X, single = _to_dataframe(product_features)
    predictions = _predict_bundle(bundle, X)
    return predictions[0] if single else predictions


def _main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m ml.packaging_predictor",
        description="Predict packaging recommendations for a product or batch of products.",
    )
    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument("--input", type=Path, help="Path to a JSON file with a single product's features.")
    src.add_argument("--batch", type=Path, help="Path to a CSV file with one product per row.")
    parser.add_argument("--output", type=Path, help="CSV output path for batch predictions.")
    parser.add_argument(
        "--model-path",
        type=Path,
        default=DEFAULT_MODEL_PATH,
        help=f"Model artifact location (default: {DEFAULT_MODEL_PATH}).",
    )
    parser.add_argument("--retrain", action="store_true", help="Delete any existing model artifact first.")
    args = parser.parse_args(argv)

    if args.retrain and args.model_path.exists():
        args.model_path.unlink()

    if args.input is not None:
        features = json.loads(args.input.read_text())
        prediction = predict_packaging(features, model_path=args.model_path)
        print(json.dumps(asdict(prediction), indent=2))
        return 0

    df = pd.read_csv(args.batch)
    predictions = predict_packaging(df, model_path=args.model_path)
    out_df = pd.DataFrame([asdict(p) for p in predictions])
    if args.output is not None:
        out_df.to_csv(args.output, index=False)
        print(f"Wrote {len(out_df)} predictions to {args.output}")
    else:
        print(out_df.to_csv(index=False))
    return 0


if __name__ == "__main__":
    sys.exit(_main())
