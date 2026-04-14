"""Configuration loading and XDG path helpers."""

from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

from platformdirs import user_config_dir, user_data_dir

APP_NAME = "ebay-sniper"
DEFAULT_LEAD_TIME_S = 6
DEFAULT_EBAY_HOST = "www.ebay.com"


@dataclass
class SmtpConfig:
    host: str
    port: int
    username: str
    password: str
    from_addr: str
    to_addr: str
    use_tls: bool = True


@dataclass
class Config:
    default_lead_time_s: int = DEFAULT_LEAD_TIME_S
    ebay_host: str = DEFAULT_EBAY_HOST
    smtp: SmtpConfig | None = None
    # Populated at load time from XDG dirs:
    data_dir: Path = field(default_factory=lambda: Path(user_data_dir(APP_NAME)))
    config_dir: Path = field(default_factory=lambda: Path(user_config_dir(APP_NAME)))

    @property
    def db_path(self) -> Path:
        return self.data_dir / "sniper.db"

    @property
    def browser_profile_dir(self) -> Path:
        return self.data_dir / "browser-profile"

    @property
    def log_dir(self) -> Path:
        return self.data_dir / "logs"

    @property
    def log_file(self) -> Path:
        return self.log_dir / "sniper.log"

    @property
    def config_file(self) -> Path:
        return self.config_dir / "config.toml"

    def ensure_dirs(self) -> None:
        for p in (self.data_dir, self.config_dir, self.browser_profile_dir, self.log_dir):
            p.mkdir(parents=True, exist_ok=True)


def load_config() -> Config:
    """Load config from the XDG config file, falling back to defaults.

    SMTP password may also be supplied via `EBAY_SNIPER_SMTP_PASSWORD` env var,
    which overrides any value in the config file.
    """
    cfg = Config()
    cfg.ensure_dirs()

    if cfg.config_file.exists():
        raw = tomllib.loads(cfg.config_file.read_text(encoding="utf-8"))
        cfg.default_lead_time_s = int(raw.get("default_lead_time_s", DEFAULT_LEAD_TIME_S))
        cfg.ebay_host = str(raw.get("ebay_host", DEFAULT_EBAY_HOST))

        smtp_raw = raw.get("smtp")
        if smtp_raw:
            password = os.environ.get("EBAY_SNIPER_SMTP_PASSWORD") or smtp_raw.get("password", "")
            cfg.smtp = SmtpConfig(
                host=str(smtp_raw["host"]),
                port=int(smtp_raw.get("port", 587)),
                username=str(smtp_raw.get("username", "")),
                password=str(password),
                from_addr=str(smtp_raw["from"]),
                to_addr=str(smtp_raw["to"]),
                use_tls=bool(smtp_raw.get("use_tls", True)),
            )
    return cfg


EXAMPLE_CONFIG_TOML = """# ebay-sniper config
default_lead_time_s = 6
ebay_host = "www.ebay.com"

# Optional SMTP notification settings. The password may also be supplied via
# the EBAY_SNIPER_SMTP_PASSWORD environment variable, which takes precedence.
# [smtp]
# host = "smtp.example.com"
# port = 587
# username = "you@example.com"
# password = "app-password"
# from = "sniper@example.com"
# to = "you@example.com"
# use_tls = true
"""
