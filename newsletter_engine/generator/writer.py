"""Newsletter writer: generates the daily briefing markdown file.

Each newsletter contains:
- Header with date and market summary
- 5 market briefings (~500 words each)
- Accuracy tracker summary
- Footer with methodology notes
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from openai import OpenAI

from ..config import Config
from ..models import DivergenceOpportunity, Briefing, AccuracyReport

logger = logging.getLogger(__name__)

BRIEFING_SYSTEM_PROMPT = """\
You are writing a market briefing for a paid prediction market newsletter.
Your audience is sophisticated — they want evidence, not hype.

Write exactly one briefing section (~500 words) covering:

1. **What the Market Says** (~75 words): Current price, what it implies, how it's moved recently.
2. **What the Evidence Says** (~200 words): Key findings from research. Cite specific data points, events, or statements. Be concrete.
3. **Where the Gap Is** (~150 words): Why our independent assessment differs from the market price. What the market may be over/under-weighting.
4. **What Would Change Our Mind** (~75 words): Specific, falsifiable conditions that would flip our view.

Style rules:
- No hedging filler ("it remains to be seen", "time will tell")
- Lead with the sharpest insight
- Use specific numbers, dates, and names
- One-sentence verdict at the end: your probability vs market price

Return ONLY the markdown content for this one briefing section. No JSON wrapping.
"""


class NewsletterWriter:
    """Generates the daily newsletter markdown file."""

    def __init__(self):
        self.llm_client: Optional[OpenAI] = None
        if Config.OPENAI_API_KEY:
            self.llm_client = OpenAI(api_key=Config.OPENAI_API_KEY)

    def generate_briefings(
        self,
        opportunities: list[DivergenceOpportunity],
    ) -> list[Briefing]:
        """Generate a ~500 word briefing for each opportunity."""
        briefings = []
        for opp in opportunities:
            content = self._write_briefing(opp)
            briefings.append(Briefing(
                market=opp.market,
                research=opp.research,
                divergence=opp.divergence,
                edge_direction=opp.edge_direction,
                content=content,
            ))
        return briefings

    def _write_briefing(self, opp: DivergenceOpportunity) -> str:
        """Write a single market briefing using LLM or template fallback."""
        if self.llm_client:
            return self._llm_briefing(opp)
        return self._template_briefing(opp)

    def _llm_briefing(self, opp: DivergenceOpportunity) -> str:
        """Generate briefing using LLM."""
        findings_text = "\n".join(f"- {f}" for f in opp.research.key_findings[:8])

        try:
            resp = self.llm_client.chat.completions.create(
                model=Config.LLM_MODEL,
                temperature=0.4,
                max_tokens=1200,
                messages=[
                    {"role": "system", "content": BRIEFING_SYSTEM_PROMPT},
                    {"role": "user", "content": (
                        f"## Market\n"
                        f"**{opp.market.title}**\n"
                        f"- Source: {opp.market.source.value}\n"
                        f"- Current Price: {opp.market.current_price:.1%}\n"
                        f"- Our Assessment: {opp.research.assessed_probability:.1%}\n"
                        f"- Divergence: {opp.edge_magnitude:.1%} ({opp.edge_direction})\n"
                        f"- Resolution Date: {opp.market.resolution_date}\n"
                        f"- URL: {opp.market.url}\n\n"
                        f"## Research Findings\n{findings_text}\n\n"
                        f"## Base Rate Analysis\n{opp.research.base_rate_analysis}\n\n"
                        f"## Our Reasoning\n{opp.research.reasoning}\n\n"
                        f"Write the ~500 word briefing section now."
                    )},
                ],
            )
            return resp.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"LLM briefing generation failed: {e}")
            return self._template_briefing(opp)

    def _template_briefing(self, opp: DivergenceOpportunity) -> str:
        """Fallback template-based briefing when no LLM is available."""
        findings = "\n".join(f"- {f}" for f in opp.research.key_findings[:5]) or "- No findings available"

        return f"""\
### What the Market Says

The {opp.market.source.value} market for "{opp.market.title}" currently trades at \
**{opp.market.current_price:.1%}**, implying the market sees a \
{opp.market.current_price:.0%} chance of YES resolution. \
This market resolves on {opp.market.resolution_date.strftime('%B %d, %Y') if opp.market.resolution_date else 'TBD'}.

### What the Evidence Says

Our independent research produced the following key findings:

{findings}

{opp.research.base_rate_analysis}

### Where the Gap Is

Our independent assessment puts the probability at **{opp.research.assessed_probability:.1%}**, \
a **{opp.edge_magnitude:.1%}** divergence from the market price. We believe this market is \
**{opp.edge_direction}**.

{opp.research.reasoning}

Research confidence: {opp.research.confidence:.0%}.

### What Would Change Our Mind

Key factors that could shift our assessment toward the market price:
- New information contradicting our research findings
- Changes in the underlying conditions before resolution
- Evidence that our base rate analysis is miscalibrated

**Verdict:** Our probability {opp.research.assessed_probability:.1%} vs Market {opp.market.current_price:.1%} \
({opp.edge_direction} by {opp.edge_magnitude:.1%})"""

    def render_newsletter(
        self,
        date: str,
        briefings: list[Briefing],
        accuracy: Optional[AccuracyReport] = None,
    ) -> str:
        """Render the complete newsletter as markdown.

        Args:
            date: YYYY-MM-DD format.
            briefings: List of market briefings.
            accuracy: Optional weekly accuracy report to include.

        Returns:
            Complete newsletter markdown string.
        """
        dt = datetime.strptime(date, "%Y-%m-%d")
        formatted_date = dt.strftime("%A, %B %d, %Y")

        sections = []

        # Header
        sections.append(f"""\
---
title: "Market Edge Daily"
date: {date}
markets_analyzed: {len(briefings)}
---

# Market Edge Daily
## {formatted_date}

*Your daily prediction market intelligence briefing. We pull active markets from \
Polymarket and Kalshi, independently research each question, and surface the \
{len(briefings)} biggest divergences between market price and evidence-based probability.*

---
""")

        # Executive Summary
        if briefings:
            sections.append("## Executive Summary\n")
            sections.append("| # | Market | Platform | Market Price | Our Price | Edge | Direction |")
            sections.append("|---|--------|----------|:------------:|:---------:|:----:|:---------:|")
            for i, b in enumerate(briefings, 1):
                sections.append(
                    f"| {i} | {b.market.title[:60]} | {b.market.source.value} | "
                    f"{b.market.current_price:.1%} | {b.research.assessed_probability:.1%} | "
                    f"{abs(b.divergence):.1%} | {b.edge_direction} |"
                )
            sections.append("\n---\n")

        # Individual Briefings
        for i, briefing in enumerate(briefings, 1):
            link = f"[View on {briefing.market.source.value}]({briefing.market.url})" if briefing.market.url else ""
            sections.append(f"## {i}. {briefing.market.title}\n")
            sections.append(f"*{briefing.market.source.value} | Resolves: "
                          f"{briefing.market.resolution_date.strftime('%b %d, %Y') if briefing.market.resolution_date else 'TBD'} | "
                          f"{link}*\n")
            sections.append(briefing.content)
            sections.append("\n---\n")

        # Accuracy section
        if accuracy and accuracy.resolved_predictions > 0:
            sections.append("## Weekly Accuracy Report\n")
            sections.append(f"*Week ending {accuracy.week_ending}*\n")
            sections.append(f"- **Total predictions tracked:** {accuracy.total_predictions}")
            sections.append(f"- **Resolved this week:** {accuracy.resolved_predictions}")
            if accuracy.our_avg_brier is not None:
                sections.append(f"- **Our Brier score:** {accuracy.our_avg_brier:.4f} "
                              f"(lower is better, 0 = perfect)")
            if accuracy.market_avg_brier is not None:
                sections.append(f"- **Market Brier score:** {accuracy.market_avg_brier:.4f}")
            if accuracy.our_avg_brier is not None and accuracy.market_avg_brier is not None:
                diff = accuracy.market_avg_brier - accuracy.our_avg_brier
                better = "better" if diff > 0 else "worse"
                sections.append(f"- **Edge vs market:** {abs(diff):.4f} {better}")
            if accuracy.edge_accuracy_pct is not None:
                sections.append(f"- **Directional accuracy:** {accuracy.edge_accuracy_pct:.1f}% "
                              f"({accuracy.edge_calls_correct}/{accuracy.edge_calls_total})")
            sections.append("\n---\n")

        # Footer
        sections.append(f"""\
## Methodology

This briefing is generated by analyzing all active markets on Polymarket and Kalshi \
resolving within 14 days. For each market, we conduct independent web research, \
apply base rate analysis, and produce a probability assessment. The {len(briefings)} markets \
with the largest divergence between our assessment and the market price are featured.

**Disclaimer:** This newsletter is for informational and educational purposes only. \
It does not constitute financial advice or a recommendation to trade. Prediction markets \
carry risk. Past accuracy does not guarantee future performance.

*Generated by Market Edge Daily Engine v1.0*
""")

        return "\n".join(sections)

    def close(self):
        if self.llm_client:
            self.llm_client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
