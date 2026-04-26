"""Parlay engine: pricing, correlation, EV, Kelly, and combinatorial search.

Pipeline:
  1. Take a list of candidate legs (game_id, market, model_prob, decimal_price).
  2. Filter by edge threshold (model_prob - implied_book_prob).
  3. Search every k-leg combination (k in [min_legs, max_legs]).
  4. Score each combination by expected value AFTER adjusting joint probability
     for within-game correlation. Two same-game legs that are positively
     correlated (e.g. game total OVER + star player points OVER) actually win
     together more often than independence implies — but the parlay payout is
     priced as if they were independent. We discount/inflate accordingly.
  5. Rank by EV, return the top N. Each result includes a fractional Kelly
     stake suggestion against a unit bankroll.
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from itertools import combinations
from typing import Dict, Iterable, List, Optional, Tuple

LOG = logging.getLogger(__name__)


# --- Pricing helpers ---------------------------------------------------------

def american_to_decimal(american: float) -> float:
    return 1.0 + (american / 100.0 if american > 0 else 100.0 / abs(american))


def decimal_to_american(decimal: float) -> int:
    if decimal >= 2.0:
        return int(round((decimal - 1.0) * 100))
    return int(round(-100.0 / (decimal - 1.0)))


def implied_prob(decimal_price: float) -> float:
    """Raw implied prob (vig included). For multi-outcome devigging caller passes book prices."""
    return 1.0 / decimal_price


def devig_two_way(p_a: float, p_b: float) -> Tuple[float, float]:
    """Multiplicative devig for binary markets (over/under, ML)."""
    s = p_a + p_b
    if s <= 0:
        return p_a, p_b
    return p_a / s, p_b / s


# --- Leg data model ----------------------------------------------------------

@dataclass(frozen=True)
class Leg:
    """A single bet under consideration."""
    game_id: str
    market: str          # "h2h", "spreads", "totals", "player_points", ...
    selection: str       # team name OR player name
    side: Optional[str]  # "over" / "under" / None
    point: Optional[float]
    price_decimal: float
    model_prob: float    # our model's probability the leg wins
    book: str = ""

    @property
    def implied_prob(self) -> float:
        return implied_prob(self.price_decimal)

    @property
    def edge(self) -> float:
        return self.model_prob - self.implied_prob

    @property
    def ev_per_dollar(self) -> float:
        # decimal payout - 1 if win, -1 if lose
        return self.model_prob * (self.price_decimal - 1.0) - (1.0 - self.model_prob)


@dataclass
class Parlay:
    legs: List[Leg]
    joint_prob: float
    combined_decimal: float
    expected_value: float
    kelly_fraction: float
    correlation_adjustment: float = 1.0     # multiplier applied to independent joint
    notes: List[str] = field(default_factory=list)

    @property
    def implied_prob(self) -> float:
        return 1.0 / self.combined_decimal

    @property
    def edge(self) -> float:
        return self.joint_prob - self.implied_prob


# --- Correlation -------------------------------------------------------------

# Heuristic correlation coefficients (rho ~ -1..1) between same-game leg types.
# Calibrated from public research and common-sense direction; conservative
# magnitudes so we never over-credit dependence.
SAME_GAME_RHO: Dict[Tuple[str, str], float] = {
    ("totals_over", "player_points_over"): 0.20,
    ("totals_over", "player_threes_over"): 0.18,
    ("totals_over", "player_assists_over"): 0.10,
    ("totals_under", "player_points_under"): 0.20,
    ("totals_under", "player_threes_under"): 0.18,
    ("h2h_home", "spreads_home"): 0.55,        # strongly redundant
    ("h2h_away", "spreads_away"): 0.55,
    ("h2h_home", "player_points_over"): 0.05,  # small same-team boost
    ("player_points_over", "player_assists_over"): 0.10,  # same player, two stats
    ("player_points_over", "player_threes_over"): 0.25,
}


def _leg_kind(leg: Leg) -> str:
    if leg.side in ("over", "under"):
        return f"{leg.market}_{leg.side}"
    if leg.market == "h2h":
        return "h2h_home" if "home" in leg.selection.lower() else "h2h_away"
    if leg.market == "spreads":
        return "spreads_home" if leg.point is not None and leg.point < 0 else "spreads_away"
    return leg.market


def pairwise_rho(a: Leg, b: Leg) -> float:
    """Symmetric pairwise correlation between two legs."""
    if a.game_id != b.game_id:
        return 0.0
    if a.selection == b.selection and a.market == b.market and a.side == b.side and a.point == b.point:
        return 1.0
    ka, kb = _leg_kind(a), _leg_kind(b)
    return SAME_GAME_RHO.get((ka, kb), SAME_GAME_RHO.get((kb, ka), 0.0))


def joint_probability(legs: List[Leg], mode: str = "penalize") -> Tuple[float, float, List[str]]:
    """Estimate joint win probability for a list of legs.

    Returns (joint_prob, correlation_multiplier, notes).

    mode = "ignore"   -> assume independence
    mode = "penalize" -> apply pairwise rho adjustment to independent joint
    mode = "block"    -> caller should not have built same-game combos with rho>0
    """
    independent = math.prod(l.model_prob for l in legs)
    notes: List[str] = []
    if mode == "ignore" or len(legs) < 2:
        return independent, 1.0, notes

    # Use a simple Gaussian-copula-style adjustment:
    # joint ~= independent * prod(1 + rho_ij * geom_mean_overlap).
    # Magnitudes are intentionally small so rho is a nudge, not a leap.
    multiplier = 1.0
    for i, j in combinations(range(len(legs)), 2):
        rho = pairwise_rho(legs[i], legs[j])
        if abs(rho) < 1e-6:
            continue
        pi, pj = legs[i].model_prob, legs[j].model_prob
        overlap = math.sqrt(pi * (1 - pi) * pj * (1 - pj))
        denom = math.sqrt(max(pi * pj, 1e-9))
        nudge = 1.0 + rho * (overlap / denom)
        multiplier *= max(0.1, min(nudge, 3.0))
        if rho > 0:
            notes.append(f"+{rho:.2f} corr between leg{i+1} & leg{j+1}")
        else:
            notes.append(f"{rho:.2f} corr between leg{i+1} & leg{j+1}")
    joint = max(0.0, min(1.0, independent * multiplier))
    return joint, multiplier, notes


# --- Kelly -------------------------------------------------------------------

def kelly_stake(prob: float, decimal_price: float, fraction: float = 0.25) -> float:
    """Fractional Kelly stake as bankroll fraction. Returns 0 if no edge."""
    b = decimal_price - 1.0
    if b <= 0:
        return 0.0
    edge = prob * (b + 1.0) - 1.0
    if edge <= 0:
        return 0.0
    full = edge / b
    return max(0.0, fraction * full)


# --- Generator ---------------------------------------------------------------

def _legal_combo(legs: Tuple[Leg, ...], mode: str) -> bool:
    """Disallow obviously redundant combos (same selection twice; same h2h+spread on same team)."""
    seen_keys = set()
    for l in legs:
        key = (l.game_id, l.market, l.selection, l.side, l.point)
        if key in seen_keys:
            return False
        seen_keys.add(key)
    if mode == "block":
        for a, b in combinations(legs, 2):
            if pairwise_rho(a, b) != 0.0 and a.game_id == b.game_id:
                return False
    # Never combine ML and spread on same team (redundant info, near-1.0 rho).
    for a, b in combinations(legs, 2):
        if a.game_id == b.game_id and {_leg_kind(a), _leg_kind(b)} in (
            {"h2h_home", "spreads_home"}, {"h2h_away", "spreads_away"}
        ):
            return False
    return True


def generate_parlays(
    legs: Iterable[Leg],
    *,
    min_legs: int = 2,
    max_legs: int = 4,
    edge_threshold: float = 0.05,
    min_leg_prob: float = 0.45,
    max_leg_prob: float = 0.85,
    correlation_mode: str = "penalize",
    kelly_fraction: float = 0.25,
    top_n: int = 5,
) -> List[Parlay]:
    """Enumerate candidate parlays and return the top-N by EV.

    For typical daily slates (10-30 candidate legs after filtering) the
    enumeration cost is trivial. For very large pools we cap by edge before
    combining.
    """
    pool = [
        l for l in legs
        if l.edge >= edge_threshold
        and min_leg_prob <= l.model_prob <= max_leg_prob
        and l.price_decimal > 1.0
    ]
    pool.sort(key=lambda l: l.edge, reverse=True)
    # Cap pool to keep combinations manageable.
    pool = pool[:40]

    out: List[Parlay] = []
    for k in range(min_legs, max_legs + 1):
        for combo in combinations(pool, k):
            if not _legal_combo(combo, correlation_mode):
                continue
            joint, mult, notes = joint_probability(list(combo), mode=correlation_mode)
            combined_decimal = math.prod(l.price_decimal for l in combo)
            ev = joint * (combined_decimal - 1.0) - (1.0 - joint)
            if ev <= 0:
                continue
            stake = kelly_stake(joint, combined_decimal, fraction=kelly_fraction)
            out.append(
                Parlay(
                    legs=list(combo),
                    joint_prob=joint,
                    combined_decimal=combined_decimal,
                    expected_value=ev,
                    kelly_fraction=stake,
                    correlation_adjustment=mult,
                    notes=notes,
                )
            )

    out.sort(key=lambda p: p.expected_value, reverse=True)
    return out[:top_n]
