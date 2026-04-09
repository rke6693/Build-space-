"""Configuration management for the newsletter engine."""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()


class Config:
    # API Keys
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    SERPER_API_KEY: str = os.getenv("SERPER_API_KEY", "")  # For web search

    # Paths
    NEWSLETTER_DIR: Path = Path(os.getenv("NEWSLETTER_DIR", str(Path.home() / "newsletter")))
    TRACKER_DB: Path = Path(os.getenv("TRACKER_DB", str(Path.home() / "newsletter" / "predictions.json")))
    ACCURACY_DIR: Path = Path(os.getenv("ACCURACY_DIR", str(Path.home() / "newsletter" / "accuracy")))

    # Market settings
    RESOLUTION_WINDOW_DAYS: int = int(os.getenv("RESOLUTION_WINDOW_DAYS", "14"))
    TOP_DIVERGENCE_COUNT: int = int(os.getenv("TOP_DIVERGENCE_COUNT", "5"))
    BRIEFING_WORD_TARGET: int = int(os.getenv("BRIEFING_WORD_TARGET", "500"))

    # Schedule
    DAILY_RUN_HOUR: int = int(os.getenv("DAILY_RUN_HOUR", "5"))
    DAILY_RUN_MINUTE: int = int(os.getenv("DAILY_RUN_MINUTE", "0"))

    # LLM settings
    LLM_MODEL: str = os.getenv("LLM_MODEL", "gpt-4o")
    LLM_TEMPERATURE: float = float(os.getenv("LLM_TEMPERATURE", "0.3"))

    @classmethod
    def ensure_dirs(cls):
        """Create required directories if they don't exist."""
        cls.NEWSLETTER_DIR.mkdir(parents=True, exist_ok=True)
        cls.ACCURACY_DIR.mkdir(parents=True, exist_ok=True)
