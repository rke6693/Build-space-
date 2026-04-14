"""Rolling realized volatility estimator.

Takes a price series and returns annualized vol based on log returns.
We also expose a short-window (5-min, 1-hour) estimator so the crypto
lag strategy can use whatever horizon matches the market it's pricing.
"""
from __future__ import annotations

import math
from typing import List, Sequence

import numpy as np

SECONDS_PER_YEAR = 365.25 * 24 * 3600


def log_returns(prices: Sequence[float]) -> List[float]:
    out: List[float] = []
    for i in range(1, len(prices)):
        p0 = prices[i - 1]
        p1 = prices[i]
        if p0 <= 0 or p1 <= 0:
            continue
        out.append(math.log(p1 / p0))
    return out


def realized_vol_annualised(
    prices: Sequence[float],
    timestamps: Sequence[float],
) -> float:
    """Annualised sigma from a tick series. Handles uneven spacing."""
    if len(prices) < 10 or len(prices) != len(timestamps):
        return 0.0

    rets = log_returns(prices)
    if not rets:
        return 0.0

    dt = [
        timestamps[i] - timestamps[i - 1]
        for i in range(1, len(timestamps))
        if timestamps[i] > timestamps[i - 1]
    ]
    if not dt:
        return 0.0

    avg_dt = float(np.mean(dt))
    if avg_dt <= 0:
        return 0.0

    per_step = float(np.std(rets, ddof=1)) if len(rets) > 1 else 0.0
    steps_per_year = SECONDS_PER_YEAR / avg_dt
    return per_step * math.sqrt(steps_per_year)


def clamp_vol(v: float, floor: float = 0.15, ceiling: float = 3.0) -> float:
    """Keep vol within sane bounds even if price series is noisy."""
    return max(floor, min(ceiling, v))
