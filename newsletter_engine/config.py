"""Configuration management for the newsletter engine."""

import logging
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


class Config:
    # === API Keys ===
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    SERPER_API_KEY: str = os.getenv("SERPER_API_KEY", "")

    # === Delivery ===
    BUTTONDOWN_API_KEY: str = os.getenv("BUTTONDOWN_API_KEY", "")
    RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")
    RESEND_FROM_EMAIL: str = os.getenv("RESEND_FROM_EMAIL", "")
    RESEND_TO_EMAILS: str = os.getenv("RESEND_TO_EMAILS", "")  # comma-separated
    DELIVERY_DRAFT_MODE: bool = os.getenv("DELIVERY_DRAFT_MODE", "false").lower() == "true"

    # === Alerting ===
    ALERT_WEBHOOK_URL: str = os.getenv("ALERT_WEBHOOK_URL", "")
    ALERT_WEBHOOK_TYPE: str = os.getenv("ALERT_WEBHOOK_TYPE", "slack")  # slack, discord, generic
    ALERT_MIN_LEVEL: str = os.getenv("ALERT_MIN_LEVEL", "warning")  # info, warning, error

    # === Paths ===
    NEWSLETTER_DIR: Path = Path(os.getenv("NEWSLETTER_DIR", str(Path.home() / "newsletter")))
    TRACKER_DB: Path = Path(os.getenv("TRACKER_DB", str(Path.home() / "newsletter" / "predictions.json")))
    ACCURACY_DIR: Path = Path(os.getenv("ACCURACY_DIR", str(Path.home() / "newsletter" / "accuracy")))

    # === Market settings ===
    RESOLUTION_WINDOW_DAYS: int = int(os.getenv("RESOLUTION_WINDOW_DAYS", "14"))
    TOP_DIVERGENCE_COUNT: int = int(os.getenv("TOP_DIVERGENCE_COUNT", "5"))
    BRIEFING_WORD_TARGET: int = int(os.getenv("BRIEFING_WORD_TARGET", "500"))

    # === Schedule ===
    DAILY_RUN_HOUR: int = int(os.getenv("DAILY_RUN_HOUR", "5"))
    DAILY_RUN_MINUTE: int = int(os.getenv("DAILY_RUN_MINUTE", "0"))

    # === LLM settings ===
    LLM_MODEL: str = os.getenv("LLM_MODEL", "gpt-4o")
    LLM_TEMPERATURE: float = float(os.getenv("LLM_TEMPERATURE", "0.3"))

    # === Cache ===
    SEARCH_CACHE_TTL: int = int(os.getenv("SEARCH_CACHE_TTL", str(6 * 3600)))  # 6 hours

    @classmethod
    def ensure_dirs(cls):
        """Create required directories if they don't exist."""
        cls.NEWSLETTER_DIR.mkdir(parents=True, exist_ok=True)
        cls.ACCURACY_DIR.mkdir(parents=True, exist_ok=True)

    @classmethod
    def validate(cls) -> list[str]:
        """Validate configuration, returning a list of warnings."""
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

        if not cls.BUTTONDOWN_API_KEY and not cls.RESEND_API_KEY:
            warnings.append(
                "No delivery backend configured (BUTTONDOWN_API_KEY or RESEND_API_KEY). "
                "Newsletter will only be saved to disk."
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
