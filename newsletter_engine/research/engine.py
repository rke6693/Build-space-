"""Research engine: web search, evidence gathering, and probability assessment.

Uses web search (via Serper API) and LLM analysis to independently assess
the probability of each market question resolving YES.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from openai import OpenAI

from ..config import Config
from ..models import Market, ResearchResult

logger = logging.getLogger(__name__)


class ResearchEngine:
    """Researches market questions and produces independent probability assessments."""

    def __init__(self):
        self.search_client = httpx.Client(timeout=20.0)
        self.llm_client: Optional[OpenAI] = None
        if Config.OPENAI_API_KEY:
            self.llm_client = OpenAI(api_key=Config.OPENAI_API_KEY)

    def research_market(self, market: Market) -> ResearchResult:
        """Research a single market and produce an assessed probability.

        Steps:
        1. Generate search queries from the market question
        2. Execute web searches
        3. Gather and synthesize findings
        4. Apply base rate analysis
        5. Produce final probability assessment

        Args:
            market: The market to research.

        Returns:
            ResearchResult with assessed probability and supporting evidence.
        """
        logger.info(f"Researching: {market.title}")

        # Step 1: Generate search queries
        queries = self._generate_search_queries(market)

        # Step 2: Execute searches
        all_findings: list[str] = []
        data_sources: list[str] = []
        for query in queries[:3]:  # Limit to 3 queries per market
            results = self._web_search(query)
            for result in results[:5]:
                finding = f"[{result.get('title', 'N/A')}] {result.get('snippet', '')}"
                all_findings.append(finding)
                if result.get("link"):
                    data_sources.append(result["link"])

        # Step 3-5: Synthesize and assess with LLM
        assessment = self._llm_assess(market, all_findings)

        return ResearchResult(
            market_id=market.id,
            search_queries=queries,
            key_findings=all_findings[:10],
            base_rate_analysis=assessment.get("base_rate_analysis", ""),
            data_sources=data_sources[:10],
            assessed_probability=assessment.get("probability", market.current_price),
            confidence=assessment.get("confidence", 0.3),
            reasoning=assessment.get("reasoning", "Insufficient data for independent assessment."),
            researched_at=datetime.now(timezone.utc),
        )

    def research_markets(self, markets: list[Market]) -> list[ResearchResult]:
        """Research multiple markets."""
        results = []
        for market in markets:
            try:
                result = self.research_market(market)
                results.append(result)
            except Exception as e:
                logger.error(f"Failed to research market {market.id}: {e}")
                # Return a low-confidence fallback
                results.append(ResearchResult(
                    market_id=market.id,
                    assessed_probability=market.current_price,
                    confidence=0.1,
                    reasoning=f"Research failed: {e}",
                ))
        return results

    def _generate_search_queries(self, market: Market) -> list[str]:
        """Generate web search queries for a market question."""
        if self.llm_client:
            try:
                resp = self.llm_client.chat.completions.create(
                    model=Config.LLM_MODEL,
                    temperature=0.2,
                    messages=[
                        {"role": "system", "content": (
                            "You generate web search queries to research prediction market questions. "
                            "Return exactly 3 queries as a JSON array of strings. "
                            "Focus on: (1) recent news, (2) relevant data/statistics, (3) expert analysis."
                        )},
                        {"role": "user", "content": (
                            f"Market question: {market.title}\n"
                            f"Description: {market.description[:500]}\n"
                            f"Resolution date: {market.resolution_date}\n\n"
                            "Generate 3 search queries to research this question."
                        )},
                    ],
                    response_format={"type": "json_object"},
                )
                content = resp.choices[0].message.content
                data = json.loads(content)
                queries = data.get("queries", data.get("search_queries", []))
                if isinstance(queries, list) and queries:
                    return [str(q) for q in queries[:3]]
            except Exception as e:
                logger.debug(f"LLM query generation failed: {e}")

        # Fallback: simple query derivation
        title = market.title.rstrip("?")
        return [
            f"{title} latest news {datetime.now().year}",
            f"{title} probability analysis",
            f"{title} data statistics",
        ]

    def _web_search(self, query: str) -> list[dict]:
        """Execute a web search using Serper API.

        Falls back to empty results if API key is not configured.
        """
        if not Config.SERPER_API_KEY:
            logger.debug("No SERPER_API_KEY configured, skipping web search")
            return self._fallback_search(query)

        try:
            resp = self.search_client.post(
                "https://google.serper.dev/search",
                headers={
                    "X-API-KEY": Config.SERPER_API_KEY,
                    "Content-Type": "application/json",
                },
                json={
                    "q": query,
                    "num": 5,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("organic", [])
        except Exception as e:
            logger.error(f"Web search failed for '{query}': {e}")
            return []

    def _fallback_search(self, query: str) -> list[dict]:
        """Fallback when no search API is available.

        Returns empty results — the LLM will rely on its training data.
        """
        return []

    def _llm_assess(self, market: Market, findings: list[str]) -> dict:
        """Use LLM to synthesize findings and assess probability.

        Returns dict with keys: probability, confidence, reasoning, base_rate_analysis.
        """
        if not self.llm_client:
            return self._heuristic_assess(market, findings)

        findings_text = "\n".join(f"- {f}" for f in findings) if findings else "No web search results available."

        try:
            resp = self.llm_client.chat.completions.create(
                model=Config.LLM_MODEL,
                temperature=Config.LLM_TEMPERATURE,
                messages=[
                    {"role": "system", "content": (
                        "You are a prediction market analyst. Given a market question and research findings, "
                        "produce an independent probability assessment.\n\n"
                        "You MUST return a JSON object with these exact keys:\n"
                        "- probability: float 0.0-1.0, your assessed probability of YES\n"
                        "- confidence: float 0.0-1.0, how confident you are in your assessment\n"
                        "- reasoning: string, 2-3 sentence summary of your reasoning\n"
                        "- base_rate_analysis: string, what base rates or reference classes apply\n\n"
                        "Be calibrated. Acknowledge uncertainty. Don't anchor on the current market price. "
                        "Consider base rates for similar events. Think about what evidence would change your mind."
                    )},
                    {"role": "user", "content": (
                        f"## Market Question\n{market.title}\n\n"
                        f"## Description\n{market.description[:1000]}\n\n"
                        f"## Current Market Price\n{market.current_price:.1%} YES\n\n"
                        f"## Resolution Date\n{market.resolution_date}\n\n"
                        f"## Research Findings\n{findings_text}\n\n"
                        "Produce your independent probability assessment. "
                        "Do NOT simply anchor to the market price — reason from the evidence."
                    )},
                ],
                response_format={"type": "json_object"},
            )
            content = resp.choices[0].message.content
            result = json.loads(content)

            # Validate and clamp
            prob = float(result.get("probability", market.current_price))
            prob = max(0.01, min(0.99, prob))

            return {
                "probability": prob,
                "confidence": max(0.1, min(1.0, float(result.get("confidence", 0.3)))),
                "reasoning": str(result.get("reasoning", "")),
                "base_rate_analysis": str(result.get("base_rate_analysis", "")),
            }
        except Exception as e:
            logger.error(f"LLM assessment failed: {e}")
            return self._heuristic_assess(market, findings)

    def _heuristic_assess(self, market: Market, findings: list[str]) -> dict:
        """Heuristic fallback when no LLM is available.

        Applies simple adjustments based on keyword analysis of findings.
        """
        base = market.current_price
        adjustment = 0.0

        positive_keywords = ["confirmed", "likely", "approved", "passed", "agreement", "signed"]
        negative_keywords = ["unlikely", "rejected", "failed", "denied", "postponed", "delayed"]

        text = " ".join(findings).lower()
        for kw in positive_keywords:
            if kw in text:
                adjustment += 0.03
        for kw in negative_keywords:
            if kw in text:
                adjustment -= 0.03

        assessed = max(0.02, min(0.98, base + adjustment))

        return {
            "probability": assessed,
            "confidence": 0.2,
            "reasoning": "Heuristic assessment based on keyword analysis (no LLM available).",
            "base_rate_analysis": "No base rate analysis available without LLM.",
        }

    def close(self):
        self.search_client.close()
        if self.llm_client:
            self.llm_client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
