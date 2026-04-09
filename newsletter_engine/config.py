"""Configuration management for the newsletter engine."""

import logging
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


class Config:
    # API Keys
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    SERPER_API_KEY: str = os.getenv("SERPER_API_KEY", "")

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

    @classmethod
    def validate(cls) -> list[str]:
        """Validate configuration, returning a list of warnings.

        Returns:
            List of warning strings. Empty if everything looks good.
        """
        warnings = []

        if not cls.OPENAI_API_KEY:
            warnings.append(
                "OPENAI_API_KEY not set. LLM features disabled — "
                "research will use heuristic fallback (low quality)."
            )
        elif not cls.OPENAI_API_KEY.startswith(("sk-", "sess-")):
            warnings.append(
                "OPENAI_API_KEY doesn't look like a valid OpenAI key "
                "(expected 'sk-...' or 'sess-...')"
            )

        if not cls.SERPER_API_KEY:
            warnings.append(
                "SERPER_API_KEY not set. Web search disabled — "
                "research will rely on LLM training data only."
            )

        if cls.RESOLUTION_WINDOW_DAYS < 1 or cls.RESOLUTION_WINDOW_DAYS > 365:
            warnings.append(
                f"RESOLUTION_WINDOW_DAYS={cls.RESOLUTION_WINDOW_DAYS} is unusual "
                f"(expected 1-365)"
            )

        if cls.TOP_DIVERGENCE_COUNT < 1 or cls.TOP_DIVERGENCE_COUNT > 20:
            warnings.append(
                f"TOP_DIVERGENCE_COUNT={cls.TOP_DIVERGENCE_COUNT} is unusual "
                f"(expected 1-20)"
            )

        return warnings

    @classmethod
    def log_warnings(cls):
        """Validate config and log any warnings."""
        for warning in cls.validate():
            logger.warning(f"Config: {warning}")
