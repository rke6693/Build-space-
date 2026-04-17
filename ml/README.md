# ml — packaging prediction

Standalone Python module that predicts packaging recommendations (box size,
material, material cost, damage risk) from product features. Trains a
scikit-learn pipeline on first use and persists it for subsequent calls.

## Install

```bash
cd ml
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## Use from Python

```python
from ml.packaging_predictor import predict_packaging

features = {
    "length_cm": 30, "width_cm": 20, "height_cm": 15,
    "weight_kg": 2.5, "fragility": "high", "category": "electronics",
}
print(predict_packaging(features))
```

Pass a `pandas.DataFrame` to predict in batch; returns a `list[PackagingPrediction]`.

## CLI

```bash
# single product
python -m ml.packaging_predictor --input product.json

# batch CSV
python -m ml.packaging_predictor --batch products.csv --output predictions.csv

# force retrain
python -m ml.packaging_predictor --input product.json --retrain
```

The first call trains on a built-in synthetic dataset and saves the bundle to
`ml/models/packaging_model.joblib`. Pass `training_data=<DataFrame>` to
`predict_packaging` to train on your own data instead (see
`_generate_synthetic_dataset` for the expected target columns).

## Input schema

| column      | type    | values                                                   |
|-------------|---------|----------------------------------------------------------|
| length_cm   | float   | > 0                                                      |
| width_cm    | float   | > 0                                                      |
| height_cm   | float   | > 0                                                      |
| weight_kg   | float   | > 0                                                      |
| fragility   | string  | `low`, `medium`, `high`                                  |
| category    | string  | `electronics`, `apparel`, `books`, `homegoods`, `food`   |

## Tests

```bash
pytest ml/tests -q
```
