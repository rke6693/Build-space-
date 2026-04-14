"""Risk manager — the only thing standing between a moonshot and a zero.

Enforces:
  1. Hard shutdown if bankroll drops below floor (HARD_SHUTDOWN_USDC).
  2. Daily drawdown circuit breaker (DAILY_DRAWDOWN_PCT).
  3. Max concurrent positions.
  4. Max fraction of bankroll per single market.
  5. Fractional-Kelly sizing gated by minimum edge.
  6. Target reached -> switch to "take profit" mode.

Every bet the executor wants to place is routed through `evaluate()` first.
If it returns None, the trade is rejected.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional

from .bankroll import Bankroll
from .config import get_settings
from .logger import get_logger

log = get_logger("risk")


@dataclass
class TradeIntent:
    market_id: str
    token_id: str
    outcome: str
    price: float                  # current best ask we'd pay
    model_probability: float      # our estimate of true YES probability
    strategy: str
    stop_price: Optional[float] = None
    take_profit: Optional[float] = None
    max_stake_usdc: Optional[float] = None  # hard cap from strategy
    meta: Optional[Dict] = None


@dataclass
class SizedTrade:
    intent: TradeIntent
    stake_usdc: float
    shares: float
    edge_bps: int


class RiskManager:
    def __init__(self, bankroll: Bankroll) -> None:
        self.bankroll = bankroll
        self.settings = get_settings()

    # ---- gate checks ----
    def pre_flight(self, mark_prices: Optional[Dict[str, float]] = None) -> Optional[str]:
        """Returns a reason string if trading should be halted, else None."""
        st = self.bankroll.state
        if st.halted:
            return f"bot halted: {st.halt_reason}"

        total = self.bankroll.total_bankroll(mark_prices)

        if total <= self.settings.hard_shutdown_usdc:
            self.bankroll.halt(f"hard floor tripped at {total:.2f}")
            return self.bankroll.state.halt_reason

        if total >= self.settings.target_bankroll_usdc:
            # Target reached. Bot stops opening new positions; closes remain.
            return f"target reached: {total:.2f} >= {self.settings.target_bankroll_usdc}"

        dd = self.bankroll.day_drawdown(mark_prices)
        if dd >= self.settings.daily_drawdown_pct:
            return f"daily drawdown tripped: {dd*100:.1f}%"

        return None

    # ---- sizing ----
    def evaluate(
        self,
        intent: TradeIntent,
        *,
        mark_prices: Optional[Dict[str, float]] = None,
    ) -> Optional[SizedTrade]:
        # Block if pre-flight fails
        halt = self.pre_flight(mark_prices)
        if halt:
            log.warning("risk.blocked", reason=halt, intent=intent.market_id)
            return None

        st = self.bankroll.state

        # Concurrency cap
        if len(st.positions) >= self.settings.max_concurrent_positions:
            # Allow if this is averaging into an existing position
            if intent.token_id not in st.positions:
                log.info("risk.reject.concurrency", open=len(st.positions))
                return None

        # Edge check
        edge = intent.model_probability - intent.price
        edge_bps = int(edge * 10_000)
        if edge_bps < self.settings.min_edge_bps:
            log.debug("risk.reject.edge", edge_bps=edge_bps)
            return None

        # Fractional Kelly sizing.
        # b = (1/price) - 1 = payoff per dollar risked (net)
        # p = model prob, q = 1 - p
        # Kelly f* = (bp - q) / b
        if intent.price <= 0 or intent.price >= 1:
            return None
        b = (1.0 / intent.price) - 1.0
        p = intent.model_probability
        q = 1.0 - p
        kelly_star = (b * p - q) / b
        if kelly_star <= 0:
            return None

        frac = kelly_star * self.settings.kelly_fraction
        frac = max(0.0, min(frac, self.settings.max_position_frac))

        bankroll = self.bankroll.total_bankroll(mark_prices)
        stake = frac * bankroll

        if intent.max_stake_usdc is not None:
            stake = min(stake, intent.max_stake_usdc)

        # Leave a small cushion so we don't burn all cash
        stake = min(stake, st.cash_usdc * 0.98)

        # Absolute floor: don't place microscopic orders
        if stake < 2.0:
            log.debug("risk.reject.min_stake", stake=stake)
            return None

        shares = stake / intent.price

        sized = SizedTrade(
            intent=intent,
            stake_usdc=round(stake, 4),
            shares=round(shares, 4),
            edge_bps=edge_bps,
        )
        log.info(
            "risk.sized",
            strategy=intent.strategy,
            market=intent.market_id,
            price=intent.price,
            p=p,
            edge_bps=edge_bps,
            stake=sized.stake_usdc,
            shares=sized.shares,
            kelly_star=round(kelly_star, 4),
        )
        return sized
