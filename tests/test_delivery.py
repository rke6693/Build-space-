"""Tests for delivery sender and alerting."""

import re

import pytest

from newsletter_engine.delivery.sender import DeliverySender
from newsletter_engine.alerting import Alert, AlertManager


class TestMarkdownToHtml:
    def test_headers(self):
        html = DeliverySender._markdown_to_html("# Title\n## Subtitle")
        assert "<h1>Title</h1>" in html
        assert "<h2>Subtitle</h2>" in html

    def test_bold(self):
        html = DeliverySender._markdown_to_html("This is **bold** text")
        assert "<strong>bold</strong>" in html

    def test_italic(self):
        html = DeliverySender._markdown_to_html("This is *italic* text")
        assert "<em>italic</em>" in html

    def test_links(self):
        html = DeliverySender._markdown_to_html("[Click here](https://example.com)")
        assert '<a href="https://example.com">Click here</a>' in html

    def test_horizontal_rules(self):
        html = DeliverySender._markdown_to_html("Above\n---\nBelow")
        assert "<hr>" in html

    def test_frontmatter_removed(self):
        md = "---\ntitle: Test\ndate: 2026-01-01\n---\n# Content"
        html = DeliverySender._markdown_to_html(md)
        assert "title: Test" not in html
        assert "<h1>Content</h1>" in html

    def test_list_items(self):
        html = DeliverySender._markdown_to_html("- Item one\n- Item two")
        assert "<li>Item one</li>" in html
        assert "<li>Item two</li>" in html


class TestAlertPayloads:
    def test_slack_payload(self):
        alert = Alert(
            level="error",
            title="Test Error",
            message="Something went wrong",
            fields={"Count": 5},
        )
        payload = alert.to_slack_payload()

        assert "attachments" in payload
        assert payload["attachments"][0]["title"] == "Test Error"
        assert payload["attachments"][0]["color"] == "#ff0000"
        assert payload["attachments"][0]["fields"][0]["title"] == "Count"

    def test_discord_payload(self):
        alert = Alert(
            level="info",
            title="Success",
            message="All good",
        )
        payload = alert.to_discord_payload()

        assert "embeds" in payload
        assert payload["embeds"][0]["title"] == "Success"
        assert payload["embeds"][0]["color"] == 3066993  # green

    def test_generic_payload(self):
        alert = Alert(
            level="warning",
            title="Caution",
            message="Check this",
        )
        payload = alert.to_generic_payload()

        assert payload["level"] == "warning"
        assert payload["title"] == "Caution"
        assert "timestamp" in payload

    def test_alert_manager_disabled_when_no_url(self):
        manager = AlertManager()
        assert not manager.enabled
        # Should not raise even when sending
        manager.send(Alert(level="error", title="Test", message="Test"))
