"""Daily report rendering and email delivery."""
from __future__ import annotations

import logging
import smtplib
from dataclasses import dataclass
from datetime import date
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from pathlib import Path
from typing import List, Optional

from jinja2 import Environment, FileSystemLoader, select_autoescape

from .config import AppConfig
from .parlay import Parlay, decimal_to_american

LOG = logging.getLogger(__name__)

TEMPLATE_DIR = Path(__file__).resolve().parents[2] / "templates"


@dataclass
class GameRow:
    away: str
    home: str
    total: float
    spread: float
    home_win_prob: float


def render_html(
    *,
    report_date: date,
    parlays: List[Parlay],
    games: List[GameRow],
    legs_count: int,
) -> str:
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATE_DIR)),
        autoescape=select_autoescape(["html", "xml"]),
    )
    tmpl = env.get_template("daily_report.html.j2")
    enriched = [
        {
            **p.__dict__,
            "american": decimal_to_american(p.combined_decimal),
            "implied_prob": p.implied_prob,
            "edge": p.edge,
        }
        for p in parlays
    ]
    return tmpl.render(
        report_date=report_date.isoformat(),
        parlays=enriched,
        games=games,
        legs=[None] * legs_count,
    )


def render_text(parlays: List[Parlay]) -> str:
    """Plaintext fallback for clients that don't render HTML."""
    if not parlays:
        return "No parlays cleared the edge threshold today."
    out: List[str] = []
    for i, p in enumerate(parlays, 1):
        out.append(
            f"#{i}  combined {decimal_to_american(p.combined_decimal):+d} ({p.combined_decimal:.2f}x)"
            f"  EV {p.expected_value*100:.1f}%  Kelly {p.kelly_fraction*100:.2f}%"
        )
        for leg in p.legs:
            tail = ""
            if leg.side:
                tail += f" {leg.side}"
            if leg.point is not None:
                tail += f" {leg.point}"
            out.append(
                f"   - {leg.selection}{tail}  ({leg.market}, {leg.book})"
                f"  model {leg.model_prob*100:.1f}% vs book {leg.implied_prob*100:.1f}%"
            )
        out.append("")
    return "\n".join(out)


def send_email(
    cfg: AppConfig,
    *,
    subject: str,
    html: str,
    text: str,
    recipients: Optional[List[str]] = None,
) -> None:
    recipients = recipients or cfg.report.recipients
    if not recipients:
        LOG.warning("no recipients configured; skipping send")
        return
    if not (cfg.smtp_user and cfg.smtp_password):
        LOG.warning("SMTP creds not set; printing report instead")
        print(text)
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"{cfg.report.subject_prefix} {subject}".strip()
    msg["From"] = cfg.report.from_address
    msg["To"] = ", ".join(recipients)
    msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    with smtplib.SMTP(cfg.report.smtp.host, cfg.report.smtp.port, timeout=30) as s:
        if cfg.report.smtp.use_tls:
            s.starttls()
        s.login(cfg.smtp_user, cfg.smtp_password)
        s.sendmail(formataddr(("", cfg.smtp_user)), recipients, msg.as_string())
    LOG.info("daily report sent to %s", recipients)
