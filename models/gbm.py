"""Geometric Brownian Motion closed-form probabilities.

Given:
  * current spot price S
  * strike K
  * time to expiry T (years)
  * annualised sigma
  * risk-free rate r (we use 0 — Polymarket is short-dated and the drift
    premium is negligible vs. execution noise)

We compute P(S_T >= K) and P(S_T <= K) under GBM. These are the closed
forms used in Black-Scholes:

    d2 = (ln(S/K) + (r - sigma^2/2) * T) / (sigma * sqrt(T))
    P(S_T >= K) = N(d2)
    P(S_T <= K) = N(-d2)

This is good enough for pricing Polymarket crypto markets of the form
"Will BTC be above $X on date Y?". The market is slow to reprice vol, so
even a simple model beats the book.
"""
from __future__ import annotations

import math

from scipy.stats import norm


def prob_above(
    spot: float,
    strike: float,
    years_to_expiry: float,
    sigma: float,
    *,
    drift: float = 0.0,
) -> float:
    if spot <= 0 or strike <= 0 or years_to_expiry <= 0 or sigma <= 0:
        return 0.5
    d2 = (
        math.log(spot / strike) + (drift - 0.5 * sigma * sigma) * years_to_expiry
    ) / (sigma * math.sqrt(years_to_expiry))
    return float(norm.cdf(d2))


def prob_below(
    spot: float,
    strike: float,
    years_to_expiry: float,
    sigma: float,
    *,
    drift: float = 0.0,
) -> float:
    return 1.0 - prob_above(spot, strike, years_to_expiry, sigma, drift=drift)


def prob_between(
    spot: float,
    low: float,
    high: float,
    years_to_expiry: float,
    sigma: float,
    *,
    drift: float = 0.0,
) -> float:
    hi = prob_above(spot, low, years_to_expiry, sigma, drift=drift)
    lo = prob_above(spot, high, years_to_expiry, sigma, drift=drift)
    return max(0.0, hi - lo)


def prob_touch_above(
    spot: float,
    barrier: float,
    years_to_expiry: float,
    sigma: float,
) -> float:
    """First-passage / "will it ever touch" probability under GBM with drift=0.

    Closed form: P(max_{0<=t<=T} S_t >= barrier) = 2 * N(d), d as below.
    """
    if spot <= 0 or barrier <= 0 or years_to_expiry <= 0 or sigma <= 0:
        return 0.5
    if spot >= barrier:
        return 1.0
    d = math.log(barrier / spot) / (sigma * math.sqrt(years_to_expiry))
    # Reflection principle: P(max >= B) = 2 * (1 - N(d)) for drift=0
    return float(min(1.0, 2.0 * (1.0 - norm.cdf(d))))


def prob_touch_below(
    spot: float,
    barrier: float,
    years_to_expiry: float,
    sigma: float,
) -> float:
    if spot <= 0 or barrier <= 0 or years_to_expiry <= 0 or sigma <= 0:
        return 0.5
    if spot <= barrier:
        return 1.0
    d = math.log(spot / barrier) / (sigma * math.sqrt(years_to_expiry))
    return float(min(1.0, 2.0 * (1.0 - norm.cdf(d))))
