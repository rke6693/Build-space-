"""24h realized-PnL drawdown guard.

The guard is event-driven: a PnL service feeds it the rolling 24h realized
PnL and current NAV; computing those windows is not this module's job.
Once tripped the guard latches until reset() is called by an operator, so a
flapping NAV cannot silently re-arm trading after a real drawdown.
"""

from __future__ import annotations


class DrawdownGuard:
    DEFAULT_THRESHOLD_PCT = -0.05  # halt at -5% of NAV over 24h

    def __init__(
        self,
        threshold_pct: float = DEFAULT_THRESHOLD_PCT,
        name: str = "drawdown_24h",
    ) -> None:
        if threshold_pct >= 0:
            raise ValueError(
                f"threshold_pct must be negative (loss threshold), got {threshold_pct}"
            )
        self.name = name
        self.threshold_pct = float(threshold_pct)
        self._tripped_reason: str | None = None
        self._last_ratio: float | None = None

    def update(self, realized_pnl_24h: float, nav: float) -> None:
        """Record latest 24h PnL / NAV. Trips (and latches) if ratio breaches.

        nav <= 0 is treated as a no-op on the assumption that NAV is briefly
        unavailable; reconciliation, not the drawdown guard, is responsible
        for surfacing missing NAV.
        """
        if self._tripped_reason is not None:
            return
        if nav <= 0:
            return
        ratio = realized_pnl_24h / nav
        self._last_ratio = ratio
        if ratio <= self.threshold_pct:
            self._tripped_reason = (
                f"24h realized PnL {ratio:.4%} of NAV "
                f"breached threshold {self.threshold_pct:.4%}"
            )

    @property
    def tripped(self) -> bool:
        return self._tripped_reason is not None

    @property
    def last_ratio(self) -> float | None:
        return self._last_ratio

    def reason(self) -> str | None:
        return self._tripped_reason

    def reset(self) -> None:
        """Operator action: clear the latch. Caller is responsible for auditing."""
        self._tripped_reason = None
