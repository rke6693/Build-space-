"""Newsletter delivery: send the generated newsletter to subscribers.

Supports multiple delivery backends:
- Buttondown (newsletter platform, simplest — one API call)
- Resend (transactional email, for direct SMTP-style delivery)
- File-only (default, just saves to disk)

Configure via environment variables. Only one backend needs to be active.
"""

import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

import httpx

from ..config import Config
from ..utils import retry

logger = logging.getLogger(__name__)


class DeliveryError(Exception):
    """Raised when newsletter delivery fails."""
    pass


class DeliverySender:
    """Sends the newsletter via configured delivery backend."""

    def __init__(self):
        self.client = httpx.Client(timeout=30.0)

    def send(self, date: str, newsletter_path: Path, subject: Optional[str] = None) -> dict:
        """Send the newsletter through all configured backends.

        Args:
            date: YYYY-MM-DD of the newsletter.
            newsletter_path: Path to the markdown file.
            subject: Override email subject line.

        Returns:
            Dict with delivery results per backend.
        """
        if not newsletter_path.exists():
            raise DeliveryError(f"Newsletter file not found: {newsletter_path}")

        content = newsletter_path.read_text()
        subject = subject or f"Market Edge Daily — {date}"

        results = {}

        # Try each configured backend
        if Config.BUTTONDOWN_API_KEY:
            results["buttondown"] = self._send_buttondown(subject, content)
        if Config.RESEND_API_KEY:
            results["resend"] = self._send_resend(subject, content, date)

        if not results:
            results["file"] = {
                "status": "saved",
                "path": str(newsletter_path),
                "message": "No delivery backend configured. Newsletter saved to disk only.",
            }
            logger.info(
                "No delivery backend configured (set BUTTONDOWN_API_KEY or RESEND_API_KEY). "
                "Newsletter saved to disk."
            )

        return results

    @retry(max_attempts=3, base_delay=2.0, retryable_exceptions=(httpx.HTTPError,))
    def _send_buttondown(self, subject: str, body: str) -> dict:
        """Send via Buttondown API.

        Buttondown accepts markdown natively, handles subscriber management,
        and provides analytics. This is the recommended backend.

        API docs: https://api.buttondown.email/v1/docs
        """
        resp = self.client.post(
            "https://api.buttondown.email/v1/emails",
            headers={
                "Authorization": f"Token {Config.BUTTONDOWN_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "subject": subject,
                "body": body,
                "status": "draft" if Config.DELIVERY_DRAFT_MODE else "about_to_send",
            },
        )

        if resp.status_code == 401:
            raise DeliveryError("Buttondown API key is invalid")

        resp.raise_for_status()
        data = resp.json()

        status = data.get("status", "unknown")
        email_id = data.get("id", "unknown")

        if status == "about_to_send":
            logger.info(f"Buttondown: newsletter queued for delivery (id={email_id})")
        elif status == "draft":
            logger.info(f"Buttondown: newsletter saved as draft (id={email_id})")
        else:
            logger.info(f"Buttondown: status={status} (id={email_id})")

        return {
            "status": status,
            "id": email_id,
            "backend": "buttondown",
        }

    @retry(max_attempts=3, base_delay=2.0, retryable_exceptions=(httpx.HTTPError,))
    def _send_resend(self, subject: str, body: str, date: str) -> dict:
        """Send via Resend API.

        Resend is a transactional email service. Use this when you manage
        your own subscriber list. Requires RESEND_FROM_EMAIL and
        RESEND_TO_EMAILS to be configured.

        API docs: https://resend.com/docs/api-reference
        """
        if not Config.RESEND_FROM_EMAIL:
            return {"status": "skipped", "reason": "RESEND_FROM_EMAIL not configured"}
        if not Config.RESEND_TO_EMAILS:
            return {"status": "skipped", "reason": "RESEND_TO_EMAILS not configured"}

        # Convert markdown to simple HTML (basic conversion)
        html_body = self._markdown_to_html(body)

        resp = self.client.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {Config.RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "from": Config.RESEND_FROM_EMAIL,
                "to": Config.RESEND_TO_EMAILS.split(","),
                "subject": subject,
                "html": html_body,
                "text": body,  # Plain text fallback
                "tags": [
                    {"name": "newsletter_date", "value": date},
                    {"name": "type", "value": "market_edge_daily"},
                ],
            },
        )

        if resp.status_code == 401:
            raise DeliveryError("Resend API key is invalid")

        resp.raise_for_status()
        data = resp.json()

        email_id = data.get("id", "unknown")
        logger.info(f"Resend: newsletter sent (id={email_id})")

        return {
            "status": "sent",
            "id": email_id,
            "backend": "resend",
            "recipients": len(Config.RESEND_TO_EMAILS.split(",")),
        }

    @staticmethod
    def _markdown_to_html(md: str) -> str:
        """Basic markdown to HTML conversion.

        Handles headers, bold, italic, links, lists, tables, and horizontal rules.
        For production, consider using a proper library like markdown or mistune.
        """
        import re

        html = md

        # Frontmatter removal
        html = re.sub(r'^---\n.*?\n---\n', '', html, flags=re.DOTALL)

        # Headers
        html = re.sub(r'^#### (.+)$', r'<h4>\1</h4>', html, flags=re.MULTILINE)
        html = re.sub(r'^### (.+)$', r'<h3>\1</h3>', html, flags=re.MULTILINE)
        html = re.sub(r'^## (.+)$', r'<h2>\1</h2>', html, flags=re.MULTILINE)
        html = re.sub(r'^# (.+)$', r'<h1>\1</h1>', html, flags=re.MULTILINE)

        # Bold and italic
        html = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', html)
        html = re.sub(r'\*(.+?)\*', r'<em>\1</em>', html)

        # Links
        html = re.sub(r'\[([^\]]+)\]\(([^\)]+)\)', r'<a href="\2">\1</a>', html)

        # Horizontal rules
        html = re.sub(r'^---+$', '<hr>', html, flags=re.MULTILINE)

        # List items
        html = re.sub(r'^- (.+)$', r'<li>\1</li>', html, flags=re.MULTILINE)

        # Simple table handling (wrap in <table>)
        lines = html.split('\n')
        in_table = False
        result = []
        for line in lines:
            if '|' in line and not line.strip().startswith('<'):
                if not in_table:
                    result.append('<table style="border-collapse:collapse;width:100%">')
                    in_table = True
                cells = [c.strip() for c in line.strip().strip('|').split('|')]
                if all(set(c) <= set('-: ') for c in cells):
                    continue  # Skip separator row
                tag = 'th' if not any('<td>' in r for r in result) else 'td'
                row = ''.join(
                    f'<{tag} style="border:1px solid #ddd;padding:6px">{c}</{tag}>'
                    for c in cells
                )
                result.append(f'<tr>{row}</tr>')
            else:
                if in_table:
                    result.append('</table>')
                    in_table = False
                result.append(line)
        if in_table:
            result.append('</table>')

        html = '\n'.join(result)

        # Paragraphs (double newlines)
        html = re.sub(r'\n\n+', '</p><p>', html)
        html = f'<div style="font-family:Georgia,serif;max-width:700px;margin:0 auto;line-height:1.6"><p>{html}</p></div>'

        return html

    def close(self):
        self.client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
