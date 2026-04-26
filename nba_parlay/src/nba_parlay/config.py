"""Typed configuration loaded from YAML + environment."""
from __future__ import annotations

import os
from pathlib import Path
from typing import List, Literal, Optional

import yaml
from pydantic import BaseModel, Field


class DataConfig(BaseModel):
    cache_dir: Path = Path("./.cache/nba_parlay")
    train_seasons: List[int] = Field(default_factory=lambda: [2022, 2023])
    current_season: int = 2024
    shufinskiy_datasets: List[str] = Field(
        default_factory=lambda: ["nbastats", "pbpstats", "shotdetail"]
    )


class OddsConfig(BaseModel):
    provider: Literal["theoddsapi"] = "theoddsapi"
    region: str = "us"
    markets: List[str] = Field(
        default_factory=lambda: [
            "h2h",
            "spreads",
            "totals",
            "player_points",
            "player_rebounds",
            "player_assists",
            "player_threes",
        ]
    )
    bookmakers: List[str] = Field(default_factory=list)


class LightGBMParams(BaseModel):
    num_leaves: int = 63
    learning_rate: float = 0.05
    n_estimators: int = 800
    min_child_samples: int = 30
    feature_fraction: float = 0.8
    bagging_fraction: float = 0.8
    bagging_freq: int = 5


class ModelsConfig(BaseModel):
    artifact_dir: Path = Path("./.cache/nba_parlay/models")
    lightgbm: LightGBMParams = LightGBMParams()
    prop_quantiles: List[float] = Field(default_factory=lambda: [0.1, 0.25, 0.5, 0.75, 0.9])


class ParlayConfig(BaseModel):
    top_n: int = 5
    min_legs: int = 2
    max_legs: int = 4
    edge_threshold: float = 0.05
    min_leg_prob: float = 0.45
    max_leg_prob: float = 0.85
    kelly_fraction: float = 0.25
    correlation_mode: Literal["penalize", "block", "ignore"] = "penalize"


class SmtpConfig(BaseModel):
    host: str = "smtp.gmail.com"
    port: int = 587
    use_tls: bool = True


class ReportConfig(BaseModel):
    smtp: SmtpConfig = SmtpConfig()
    recipients: List[str] = Field(default_factory=list)
    from_address: str = "nba-parlay@example.com"
    subject_prefix: str = "[NBA Parlay]"
    daily_run_local: str = "10:30"


class AppConfig(BaseModel):
    data: DataConfig = DataConfig()
    odds: OddsConfig = OddsConfig()
    models: ModelsConfig = ModelsConfig()
    parlay: ParlayConfig = ParlayConfig()
    report: ReportConfig = ReportConfig()

    # Secrets pulled from environment, never persisted to YAML.
    odds_api_key: Optional[str] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None


def load_config(path: Optional[Path] = None) -> AppConfig:
    """Load YAML config from path (default: $NBA_PARLAY_CONFIG or ./config.yaml)."""
    if path is None:
        path = Path(os.getenv("NBA_PARLAY_CONFIG", "./config.yaml"))
    raw: dict = {}
    if path.exists():
        raw = yaml.safe_load(path.read_text()) or {}
    cfg = AppConfig.model_validate(raw)
    cfg.odds_api_key = os.getenv("THE_ODDS_API_KEY")
    cfg.smtp_user = os.getenv("SMTP_USER")
    cfg.smtp_password = os.getenv("SMTP_PASSWORD")
    cfg.data.cache_dir.mkdir(parents=True, exist_ok=True)
    cfg.models.artifact_dir.mkdir(parents=True, exist_ok=True)
    return cfg
