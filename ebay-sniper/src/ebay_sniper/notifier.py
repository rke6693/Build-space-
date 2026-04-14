"""SMTP email notifications.

Sends a plaintext email on: snipe success, snipe loss, snipe error, and
startup collision warnings. Falls back to logging if SMTP isn't configured so
the rest of the system still works for users who haven't set it up.
"""

from __future__ import annotations

import logging
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage

from .config import SmtpConfig

logger = logging.getLogger(__name__)


@dataclass
class Notification:
    subject: str
    body: str


class Notifier:
    def __init__(self, smtp: SmtpConfig | None) -> None:
        self.smtp = smtp

    def send(self, note: Notification) -> None:
        if self.smtp is None:
            logger.info("notifier (no-op, SMTP unconfigured): %s", note.subject)
            return
        try:
            self._send_smtp(note)
        except Exception as exc:  # noqa: BLE001
            logger.exception("SMTP send failed: %s", exc)

    def _send_smtp(self, note: Notification) -> None:
        assert self.smtp is not None
        msg = EmailMessage()
        msg["Subject"] = note.subject
        msg["From"] = self.smtp.from_addr
        msg["To"] = self.smtp.to_addr
        msg.set_content(note.body)

        if self.smtp.use_tls:
            with smtplib.SMTP(self.smtp.host, self.smtp.port, timeout=20) as server:
                server.starttls()
                if self.smtp.username:
                    server.login(self.smtp.username, self.smtp.password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(self.smtp.host, self.smtp.port, timeout=20) as server:
                if self.smtp.username:
                    server.login(self.smtp.username, self.smtp.password)
                server.send_message(msg)
        logger.info("sent email notification: %s", note.subject)
