"""Tiny rich-console logging helpers with stream-name prefixes.

Centralised so every watcher logs in the same shape and the coordinator
can colour-key per-stream output without each call site dealing with rich
markup.
"""

from __future__ import annotations

from rich.console import Console

_console = Console()


def _prefix(label: str, color: str) -> str:
    return f"[{color}]\\[{label}][/{color}]"


class log:
    """Namespace; the methods are static for ergonomics."""

    @staticmethod
    def info(label: str, msg: str) -> None:
        _console.log(f"{_prefix(label, 'cyan')} {msg}")

    @staticmethod
    def dim(label: str, msg: str) -> None:
        _console.log(f"{_prefix(label, 'cyan')} [dim]{msg}[/dim]")

    @staticmethod
    def warn(label: str, msg: str) -> None:
        _console.log(f"{_prefix(label, 'yellow')} [yellow]{msg}[/yellow]")

    @staticmethod
    def snipe(label: str, msg: str) -> None:
        _console.log(f"{_prefix(label, 'green')} [green bold]{msg}[/green bold]")

    @staticmethod
    def dryrun(label: str, msg: str) -> None:
        _console.log(f"{_prefix(label, 'magenta')} [magenta]{msg}[/magenta]")

    @staticmethod
    def banner(msg: str, color: str = "cyan") -> None:
        _console.print(f"[{color}]{msg}[/{color}]")
