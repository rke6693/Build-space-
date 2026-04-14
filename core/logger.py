"""Structured logging via structlog, JSON-to-file + pretty-to-console.

Every log line has: ts, level, event, and whatever kv pairs the call site
passes. The JSON log is the source of truth for post-mortem analysis.
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

import structlog

from .config import get_settings


def setup_logging() -> structlog.stdlib.BoundLogger:
    settings = get_settings()
    log_dir = settings.state_path / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "bot.jsonl"

    level = getattr(logging, settings.log_level.upper(), logging.INFO)

    # stdlib root: console pretty, file JSON
    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(level)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    root.addHandler(console_handler)

    file_handler = logging.FileHandler(log_file)
    file_handler.setLevel(level)
    root.addHandler(file_handler)

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
    return structlog.get_logger("polybot")


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name or "polybot")
