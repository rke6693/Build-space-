"""Common base class + helpers for edge strategies."""
from __future__ import annotations

import abc
from typing import List

from core.risk import TradeIntent


class Edge(abc.ABC):
    name: str

    @abc.abstractmethod
    async def scan(self) -> List[TradeIntent]:
        """Returns a list of TradeIntent candidates from this cycle."""
        raise NotImplementedError
