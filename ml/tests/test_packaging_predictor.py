from pathlib import Path
from unittest.mock import patch

import pandas as pd
import pytest

from ml.packaging_predictor import (
    PackagingPrediction,
    _generate_synthetic_dataset,
    predict_packaging,
)

SAMPLE = {
    "length_cm": 30.0,
    "width_cm": 20.0,
    "height_cm": 15.0,
    "weight_kg": 2.5,
    "fragility": "high",
    "category": "electronics",
}


@pytest.fixture
def model_path(tmp_path: Path) -> Path:
    return tmp_path / "packaging_model.joblib"


def test_trains_and_persists_when_missing(model_path: Path) -> None:
    assert not model_path.exists()
    predict_packaging(SAMPLE, model_path=model_path)
    assert model_path.exists()


def test_loads_from_disk_on_second_call(model_path: Path) -> None:
    predict_packaging(SAMPLE, model_path=model_path)
    with patch("ml.packaging_predictor.joblib.dump") as dump_spy:
        predict_packaging(SAMPLE, model_path=model_path)
        dump_spy.assert_not_called()


def test_predict_single_dict_returns_prediction(model_path: Path) -> None:
    result = predict_packaging(SAMPLE, model_path=model_path)
    assert isinstance(result, PackagingPrediction)
    assert result.recommended_box_size in {"S", "M", "L", "XL"}
    assert result.recommended_material in {"cardboard", "corrugated", "padded"}


def test_predict_output_ranges(model_path: Path) -> None:
    result = predict_packaging(SAMPLE, model_path=model_path)
    assert 0.0 <= result.damage_risk_score <= 1.0
    assert result.estimated_material_cost_usd > 0


def test_predict_dataframe_returns_list(model_path: Path) -> None:
    df = pd.DataFrame([SAMPLE, {**SAMPLE, "fragility": "low", "weight_kg": 0.5}])
    results = predict_packaging(df, model_path=model_path)
    assert isinstance(results, list)
    assert len(results) == 2
    assert all(isinstance(r, PackagingPrediction) for r in results)


def test_missing_feature_raises_valueerror(model_path: Path) -> None:
    incomplete = {k: v for k, v in SAMPLE.items() if k != "weight_kg"}
    with pytest.raises(ValueError, match="Missing required feature columns"):
        predict_packaging(incomplete, model_path=model_path)


def test_synthetic_generator_shape() -> None:
    df = _generate_synthetic_dataset(n=500, seed=0)
    assert len(df) == 500
    expected = {
        "length_cm", "width_cm", "height_cm", "weight_kg",
        "fragility", "category",
        "box_size", "material", "cost_usd", "damage_risk",
    }
    assert expected.issubset(df.columns)
