"""Safety layer: kill switches and the manager that aggregates them.

Phase 1.1 of the v2 build. New-order paths must consult KillSwitchManager
before submitting any intent.
"""

from polybot.safety.drawdown_guard import DrawdownGuard
from polybot.safety.file_switch import FileKillSwitch
from polybot.safety.heartbeat import HeartbeatGuard
from polybot.safety.kill_switch import KillSwitch, KillSwitchManager, TripStatus

__all__ = [
    "DrawdownGuard",
    "FileKillSwitch",
    "HeartbeatGuard",
    "KillSwitch",
    "KillSwitchManager",
    "TripStatus",
]
