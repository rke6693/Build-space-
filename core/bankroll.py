"""Persistent bankroll ledger.

Tracks: current cash balance, open positions, realised P&L, high-water mark,
daily P&L, all-time P&L. State is flushed to JSON on every mutation so a
crashed/killed bot resumes exactly where it left off.
"""
from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from .config import get_settings
from .logger import get_logger

log = get_logger("bankroll")


@dataclass
class Position:
    market_id: str           # Polymarket condition id
    token_id: str            # CLOB ERC1155 token id for the outcome side
    outcome: str             # "YES" / "NO" / etc
    side: str                # "BUY" (we are long shares)
    shares: float            # number of shares held
    avg_price: float         # average fill price (USDC per share)
    usdc_spent: float        # total USDC committed
    opened_at: float         # unix ts
    strategy: str            # which edge opened it
    stop_price: Optional[float] = None   # price at which to force exit
    take_profit: Optional[float] = None  # price at which to lock gain
    meta: Dict = field(default_factory=dict)

    def notional_at(self, price: float) -> float:
        return self.shares * price

    def unrealised(self, price: float) -> float:
        return self.shares * (price - self.avg_price)


@dataclass
class LedgerState:
    cash_usdc: float
    all_time_pnl: float
    realised_today: float
    day_start_bankroll: float
    day_started_at: float
    high_water: float
    positions: Dict[str, Position] = field(default_factory=dict)
    halted: bool = False
    halt_reason: str = ""

    @classmethod
    def fresh(cls, starting: float) -> "LedgerState":
        now = time.time()
        return cls(
            cash_usdc=starting,
            all_time_pnl=0.0,
            realised_today=0.0,
            day_start_bankroll=starting,
            day_started_at=now,
            high_water=starting,
        )


class Bankroll:
    """Single source of truth for money."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self._path: Path = self.settings.state_path / "bankroll.json"
        self.state: LedgerState = self._load_or_init()

    # ---- persistence ----
    def _load_or_init(self) -> LedgerState:
        if self._path.exists():
            raw = json.loads(self._path.read_text())
            positions = {
                k: Position(**v) for k, v in raw.get("positions", {}).items()
            }
            raw["positions"] = positions
            return LedgerState(**raw)
        st = LedgerState.fresh(self.settings.starting_bankroll_usdc)
        self._flush(st)
        return st

    def _flush(self, st: LedgerState | None = None) -> None:
        st = st or self.state
        data = asdict(st)
        self._path.write_text(json.dumps(data, indent=2, default=str))

    # ---- day rollover ----
    def maybe_rollover_day(self) -> None:
        now = datetime.now(timezone.utc)
        started = datetime.fromtimestamp(self.state.day_started_at, tz=timezone.utc)
        if now.date() != started.date():
            log.info(
                "day.rollover",
                prev_start=self.state.day_start_bankroll,
                prev_realised=self.state.realised_today,
                new_bankroll=self.total_bankroll(),
            )
            self.state.day_start_bankroll = self.total_bankroll()
            self.state.day_started_at = time.time()
            self.state.realised_today = 0.0
            self._flush()

    # ---- accounting ----
    def total_bankroll(self, mark_prices: Optional[Dict[str, float]] = None) -> float:
        """Cash + mark-to-market of all open positions."""
        total = self.state.cash_usdc
        if mark_prices:
            for pos in self.state.positions.values():
                p = mark_prices.get(pos.token_id, pos.avg_price)
                total += pos.notional_at(p)
        else:
            for pos in self.state.positions.values():
                total += pos.notional_at(pos.avg_price)
        return total

    def day_drawdown(self, mark_prices: Optional[Dict[str, float]] = None) -> float:
        if self.state.day_start_bankroll <= 0:
            return 0.0
        now = self.total_bankroll(mark_prices)
        return (self.state.day_start_bankroll - now) / self.state.day_start_bankroll

    # ---- mutations ----
    def record_open(
        self,
        *,
        market_id: str,
        token_id: str,
        outcome: str,
        shares: float,
        fill_price: float,
        strategy: str,
        stop_price: Optional[float] = None,
        take_profit: Optional[float] = None,
        meta: Optional[Dict] = None,
    ) -> Position:
        cost = shares * fill_price
        if cost > self.state.cash_usdc + 1e-9:
            raise RuntimeError(
                f"insufficient cash: need {cost:.4f}, have {self.state.cash_usdc:.4f}"
            )
        self.state.cash_usdc -= cost

        if token_id in self.state.positions:
            # Average into existing
            existing = self.state.positions[token_id]
            new_shares = existing.shares + shares
            new_cost = existing.usdc_spent + cost
            existing.avg_price = new_cost / new_shares if new_shares else 0.0
            existing.shares = new_shares
            existing.usdc_spent = new_cost
            pos = existing
        else:
            pos = Position(
                market_id=market_id,
                token_id=token_id,
                outcome=outcome,
                side="BUY",
                shares=shares,
                avg_price=fill_price,
                usdc_spent=cost,
                opened_at=time.time(),
                strategy=strategy,
                stop_price=stop_price,
                take_profit=take_profit,
                meta=meta or {},
            )
            self.state.positions[token_id] = pos

        self._flush()
        log.info(
            "bankroll.open",
            market=market_id,
            token=token_id,
            shares=shares,
            price=fill_price,
            cash_left=self.state.cash_usdc,
            strategy=strategy,
        )
        return pos

    def record_close(
        self,
        *,
        token_id: str,
        shares: float,
        fill_price: float,
    ) -> float:
        """Returns realised P&L on the closed portion."""
        pos = self.state.positions.get(token_id)
        if pos is None:
            raise RuntimeError(f"no open position for token {token_id}")
        shares = min(shares, pos.shares)
        proceeds = shares * fill_price
        cost_basis = shares * pos.avg_price
        pnl = proceeds - cost_basis

        self.state.cash_usdc += proceeds
        pos.shares -= shares
        pos.usdc_spent -= cost_basis
        if pos.shares < 1e-9:
            self.state.positions.pop(token_id, None)

        self.state.all_time_pnl += pnl
        self.state.realised_today += pnl
        total = self.total_bankroll()
        if total > self.state.high_water:
            self.state.high_water = total

        self._flush()
        log.info(
            "bankroll.close",
            token=token_id,
            shares=shares,
            price=fill_price,
            pnl=pnl,
            cash=self.state.cash_usdc,
            total=total,
        )
        return pnl

    def halt(self, reason: str) -> None:
        self.state.halted = True
        self.state.halt_reason = reason
        self._flush()
        log.error("bankroll.halt", reason=reason)

    def positions(self) -> List[Position]:
        return list(self.state.positions.values())
