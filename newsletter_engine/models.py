"""Data models for the newsletter engine."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class MarketSource(str, Enum):
    POLYMARKET = "polymarket"
    KALSHI = "kalshi"


class Market(BaseModel):
    """A single prediction market."""
    id: str
    source: MarketSource
    title: str
    description: str = ""
    url: str = ""
    current_price: float = Field(ge=0.0, le=1.0, description="Current market probability 0-1")
    volume: float = 0.0
    resolution_date: Optional[datetime] = None
    category: str = ""
    fetched_at: datetime = Field(default_factory=datetime.utcnow)


class ResearchResult(BaseModel):
    """Research findings for a market question."""
    market_id: str
    search_queries: list[str] = []
    key_findings: list[str] = []
    base_rate_analysis: str = ""
    data_sources: list[str] = []
    assessed_probability: float = Field(ge=0.0, le=1.0)
    confidence: float = Field(ge=0.0, le=1.0, description="Confidence in our assessment")
    reasoning: str = ""
    researched_at: datetime = Field(default_factory=datetime.utcnow)


class DivergenceOpportunity(BaseModel):
    """A market where our assessment diverges from the price."""
    market: Market
    research: ResearchResult
    divergence: float = Field(description="Absolute difference: assessed - market price")
    edge_direction: str = Field(description="'overpriced' or 'underpriced'")
    edge_magnitude: float = Field(description="Absolute divergence value")


class Prediction(BaseModel):
    """A tracked prediction for accuracy scoring."""
    id: str = ""
    date: str = ""  # YYYY-MM-DD
    market_id: str
    market_title: str
    market_source: str
    market_url: str = ""
    market_price_at_call: float
    our_assessed_probability: float
    our_confidence: float
    edge_direction: str
    edge_magnitude: float
    resolution_date: Optional[str] = None
    resolved: bool = False
    resolution_outcome: Optional[float] = None  # 0 or 1
    our_brier_score: Optional[float] = None
    market_brier_score: Optional[float] = None
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class AccuracyReport(BaseModel):
    """Weekly accuracy summary."""
    week_ending: str
    total_predictions: int
    resolved_predictions: int
    our_avg_brier: Optional[float] = None
    market_avg_brier: Optional[float] = None
    our_calibration: dict[str, dict] = {}  # bucket -> {count, avg_predicted, avg_actual}
    edge_calls_correct: int = 0
    edge_calls_total: int = 0
    edge_accuracy_pct: Optional[float] = None


class Briefing(BaseModel):
    """A single market briefing for the newsletter."""
    market: Market
    research: ResearchResult
    divergence: float
    edge_direction: str
    content: str = ""  # The rendered 500-word briefing
