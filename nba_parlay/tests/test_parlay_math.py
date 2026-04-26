"""Pricing, Kelly, and parlay-generator math."""
from __future__ import annotations

import math

import pytest

from nba_parlay.parlay import (
    Leg,
    american_to_decimal,
    decimal_to_american,
    devig_two_way,
    generate_parlays,
    implied_prob,
    joint_probability,
    kelly_stake,
    pairwise_rho,
)


def test_american_decimal_round_trip():
    for a in [-300, -150, -110, +100, +110, +250, +700]:
        d = american_to_decimal(a)
        assert decimal_to_american(d) == a, f"failed for {a}"


def test_implied_probability():
    assert implied_prob(2.0) == pytest.approx(0.5)
    assert implied_prob(1.91) == pytest.approx(1 / 1.91)


def test_devig_sums_to_one():
    a, b = devig_two_way(0.55, 0.50)  # vigged book prices
    assert a + b == pytest.approx(1.0)
    assert a > b


def test_kelly_zero_when_no_edge():
    # 50% true prob at -110 -> negative EV -> stake 0.
    d = american_to_decimal(-110)
    assert kelly_stake(0.5, d) == 0.0


def test_kelly_positive_when_edge():
    # 60% true prob at +100 -> clear edge.
    stake = kelly_stake(0.60, 2.0, fraction=1.0)
    # Full Kelly on +100 with 60% = 0.20 of bankroll.
    assert stake == pytest.approx(0.20, abs=1e-6)
    half = kelly_stake(0.60, 2.0, fraction=0.5)
    assert half == pytest.approx(0.10, abs=1e-6)


def test_joint_independence_when_no_correlation():
    a = Leg("g1", "h2h", "Lakers", None, None, 2.0, 0.55)
    b = Leg("g2", "h2h", "Celtics", None, None, 2.0, 0.55)
    joint, mult, _ = joint_probability([a, b], mode="penalize")
    assert mult == 1.0
    assert joint == pytest.approx(0.55 * 0.55)


def test_joint_inflates_for_positive_same_game_correlation():
    a = Leg("g1", "totals", "Over", "over", 225.5, 1.91, 0.55)
    b = Leg("g1", "player_points", "LeBron James", "over", 25.5, 1.91, 0.55)
    joint, mult, notes = joint_probability([a, b], mode="penalize")
    indep = 0.55 * 0.55
    assert joint > indep
    assert mult > 1.0
    assert any("corr" in n for n in notes)


def test_pairwise_rho_zero_across_games():
    a = Leg("g1", "totals", "Over", "over", 225.5, 1.91, 0.55)
    b = Leg("g2", "totals", "Over", "over", 218.5, 1.91, 0.55)
    assert pairwise_rho(a, b) == 0.0


def test_generator_filters_no_edge_and_returns_top_n():
    # Two clear +EV legs and one no-edge filler.
    good1 = Leg("g1", "h2h", "Hawks", None, None, 2.20, 0.60)   # edge ~ 0.145
    good2 = Leg("g2", "h2h", "Heat",  None, None, 2.10, 0.60)   # edge ~ 0.124
    flat  = Leg("g3", "h2h", "Pacers", None, None, 1.91, 0.523) # edge ~ 0
    parlays = generate_parlays(
        [good1, good2, flat],
        min_legs=2,
        max_legs=2,
        edge_threshold=0.05,
        min_leg_prob=0.45,
        max_leg_prob=0.85,
        top_n=3,
    )
    assert len(parlays) == 1     # only the (good1, good2) combo passes filters
    p = parlays[0]
    assert p.expected_value > 0
    assert p.combined_decimal == pytest.approx(2.20 * 2.10)
    assert p.kelly_fraction > 0


def test_generator_disallows_redundant_ml_plus_spread():
    a = Leg("g1", "h2h", "home", None, None, 1.83, 0.62)
    b = Leg("g1", "spreads", "home", None, -3.5, 1.91, 0.60)
    parlays = generate_parlays(
        [a, b],
        min_legs=2, max_legs=2,
        edge_threshold=0.0,
        min_leg_prob=0.0, max_leg_prob=1.0,
    )
    assert parlays == []
