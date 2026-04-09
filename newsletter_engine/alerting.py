"""Alerting: webhook notifications for pipeline events.

Sends alerts to Slack/Discord/generic webhooks when:
- Pipeline fails with errors
- High research failure rate
- Resolution check finds new outcomes
- Daily summary after successful run

All alerts are fire-and-forget (won't crash the pipeline on failure).
"""

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import httpx

from .config import Config

logger = logging.getLogger(__name__)


@dataclass
class Alert:
    """A single alert to send."""
    level: str  # "info", "warning", "error"
    title: str
    message: str
    fields: dict = None

    def to_slack_payload(self) -> dict:
        """Format as a Slack incoming webhook payload."""
        color_map = {"info": "#36a64f", "warning": "#ff9900", "error": "#ff0000"}
        color = color_map.get(self.level, "#cccccc")

        attachments = [{
            "color": color,
            "title": self.title,
            "text": self.message,
            "ts": int(datetime.now(timezone.utc).timestamp()),
        }]

        if self.fields:
            attachments[0]["fields"] = [
                {"title": k, "value": str(v), "short": True}
                for k, v in self.fields.items()
            ]

        return {"attachments": attachments}

    def to_discord_payload(self) -> dict:
        """Format as a Discord webhook payload."""
        color_map = {"info": 3066993, "warning": 16776960, "error": 15158332}
        color = color_map.get(self.level, 0)

        embed = {
            "title": self.title,
            "description": self.message,
            "color": color,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        if self.fields:
            embed["fields"] = [
                {"name": k, "value": str(v), "inline": True}
                for k, v in self.fields.items()
            ]

        return {"embeds": [embed]}

    def to_generic_payload(self) -> dict:
        """Generic JSON payload for any webhook."""
        return {
            "level": self.level,
            "title": self.title,
            "message": self.message,
            "fields": self.fields or {},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


class AlertManager:
    """Sends alerts to configured webhook endpoints."""

    def __init__(self):
        self.client = httpx.Client(timeout=10.0)
        self._webhook_url = Config.ALERT_WEBHOOK_URL
        self._webhook_type = Config.ALERT_WEBHOOK_TYPE

    @property
    def enabled(self) -> bool:
        return bool(self._webhook_url)

    def send(self, alert: Alert):
        """Send an alert. Fire-and-forget: never raises."""
        if not self.enabled:
            return

        # Respect minimum alert level
        level_order = {"info": 0, "warning": 1, "error": 2}
        min_level = Config.ALERT_MIN_LEVEL
        if level_order.get(alert.level, 0) < level_order.get(min_level, 0):
            return

        try:
            self._send_webhook(alert)
        except Exception as e:
            # Alerting should NEVER crash the pipeline
            logger.debug(f"Alert delivery failed (non-fatal): {e}")

    def _send_webhook(self, alert: Alert):
        """Send to the configured webhook."""
        if self._webhook_type == "slack":
            payload = alert.to_slack_payload()
        elif self._webhook_type == "discord":
            payload = alert.to_discord_payload()
        else:
            payload = alert.to_generic_payload()

        resp = self.client.post(
            self._webhook_url,
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        resp.raise_for_status()
        logger.debug(f"Alert sent: [{alert.level}] {alert.title}")

    def alert_pipeline_success(self, date: str, markets: int, predictions: int):
        """Send a success summary alert."""
        self.send(Alert(
            level="info",
            title=f"Market Edge Daily — {date}",
            message=f"Newsletter generated successfully.",
            fields={
                "Markets featured": markets,
                "Predictions logged": predictions,
            },
        ))

    def alert_pipeline_error(self, date: str, errors: list[str]):
        """Send an error alert when the pipeline has problems."""
        self.send(Alert(
            level="error",
            title=f"Pipeline Errors — {date}",
            message="\n".join(f"- {e}" for e in errors[:5]),
            fields={"Error count": len(errors)},
        ))

    def alert_resolutions(self, resolved: int, checked: int):
        """Send alert when predictions are resolved."""
        if resolved > 0:
            self.send(Alert(
                level="info",
                title="Predictions Resolved",
                message=f"{resolved} of {checked} predictions resolved.",
                fields={"Resolved": resolved, "Checked": checked},
            ))

    def alert_high_failure_rate(self, failed: int, total: int):
        """Send alert when research failure rate is high."""
        self.send(Alert(
            level="error",
            title="High Research Failure Rate",
            message=(
                f"{failed}/{total} markets failed research. "
                f"Check API keys and quotas."
            ),
            fields={"Failed": failed, "Total": total},
        ))

    def close(self):
        self.client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
