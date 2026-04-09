"""Generate a demo newsletter with realistic sample data.

This demonstrates the full newsletter output format without requiring
API keys or live market data. Useful for testing and as a reference.
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from newsletter_engine.config import Config
from newsletter_engine.models import (
    Market, MarketSource, ResearchResult, DivergenceOpportunity, Briefing, AccuracyReport
)
from newsletter_engine.generator.writer import NewsletterWriter
from newsletter_engine.tracker.tracker import PredictionTracker


DEMO_OPPORTUNITIES = [
    {
        "market": Market(
            id="demo-fed-rate",
            source=MarketSource.POLYMARKET,
            title="Will the Fed cut rates at the May 2026 FOMC meeting?",
            description="This market resolves YES if the Federal Reserve announces a federal funds rate cut at the FOMC meeting concluding May 6-7, 2026.",
            url="https://polymarket.com/event/fed-rate-cut-may-2026",
            current_price=0.32,
            volume=4_800_000,
            resolution_date=datetime(2026, 5, 7, tzinfo=timezone.utc),
        ),
        "research": ResearchResult(
            market_id="demo-fed-rate",
            search_queries=["Fed rate cut May 2026", "FOMC May meeting rate decision", "PCE inflation April 2026"],
            key_findings=[
                "[Reuters] March PCE inflation came in at 2.1%, lowest since January 2021",
                "[Bloomberg] Fed Governor Waller signals openness to May cut if data continues softening",
                "[WSJ] Unemployment claims rose for third consecutive week to 245K",
                "[FedWatch] CME FedWatch tool shows 48% implied probability of May cut",
                "[BLS] Non-farm payrolls missed expectations at 125K vs 180K forecast",
            ],
            base_rate_analysis="The Fed has cut rates at ~35% of meetings during easing cycles since 2000. Current conditions (inflation trending toward target, labor market softening) match the pattern of pre-cut environments in 80% of historical cases.",
            data_sources=["reuters.com", "bloomberg.com", "wsj.com", "cmegroup.com", "bls.gov"],
            assessed_probability=0.48,
            confidence=0.65,
            reasoning="Market is underpricing the probability of a May cut. The combination of PCE at 2.1%, softening payrolls, and Waller's recent comments suggest the Fed has enough cover to act. The market appears anchored to the March dot plot which signaled patience, but the data has shifted materially since then.",
        ),
        "edge_direction": "underpriced",
    },
    {
        "market": Market(
            id="demo-ukraine-ceasefire",
            source=MarketSource.KALSHI,
            title="Russia-Ukraine ceasefire agreement by April 23, 2026?",
            description="Resolves YES if both Russia and Ukraine officially agree to a ceasefire (minimum 30-day duration) before April 23, 2026.",
            url="https://kalshi.com/markets/ukraine-ceasefire-apr",
            current_price=0.18,
            volume=2_200_000,
            resolution_date=datetime(2026, 4, 23, tzinfo=timezone.utc),
        ),
        "research": ResearchResult(
            market_id="demo-ukraine-ceasefire",
            search_queries=["Russia Ukraine ceasefire negotiations 2026", "Ukraine peace talks April", "Zelenskyy Putin ceasefire"],
            key_findings=[
                "[AP News] Swiss-hosted talks ended without breakthrough; parties agree to continue dialogue",
                "[Reuters] Russian FM Lavrov calls preconditions 'non-starters' but doesn't reject framework",
                "[BBC] Pentagon assesses Russian forces preparing spring offensive in Zaporizhzhia",
                "[FT] China increases diplomatic pressure on both sides, offers new 6-point plan",
                "[NYT] Zelenskyy signals flexibility on NATO timeline but insists on territorial sovereignty",
            ],
            base_rate_analysis="Of 48 active conflicts since 1990, only 12% achieved formal ceasefire within 2 weeks of a negotiation round without prior framework agreement. The current trajectory most resembles the 2020 Nagorno-Karabakh pattern (military pressure before agreement), but the scale is far larger.",
            data_sources=["apnews.com", "reuters.com", "bbc.com", "ft.com", "nytimes.com"],
            assessed_probability=0.07,
            confidence=0.75,
            reasoning="Market at 18% is significantly overpriced for a 14-day resolution. No framework agreement exists, spring offensive preparations suggest military escalation not de-escalation, and historical base rates for this scenario are ~5-8%. Market may be inflated by hope trading around the Swiss talks.",
        ),
        "edge_direction": "overpriced",
    },
    {
        "market": Market(
            id="demo-bitcoin-100k",
            source=MarketSource.POLYMARKET,
            title="Bitcoin above $100,000 on April 20, 2026?",
            description="Resolves YES if the price of Bitcoin (BTC/USD) is at or above $100,000.00 at 12:00 PM ET on April 20, 2026, per CoinGecko.",
            url="https://polymarket.com/event/bitcoin-100k-apr20",
            current_price=0.55,
            volume=8_500_000,
            resolution_date=datetime(2026, 4, 20, tzinfo=timezone.utc),
        ),
        "research": ResearchResult(
            market_id="demo-bitcoin-100k",
            search_queries=["Bitcoin price forecast April 2026", "BTC ETF inflows 2026", "crypto market analysis"],
            key_findings=[
                "[CoinDesk] BTC currently trading at $97,400, up 3.2% this week",
                "[Bloomberg] Spot Bitcoin ETFs saw $1.2B net inflows in past 5 trading days",
                "[Glassnode] Long-term holder supply at 18-month high, reducing sell pressure",
                "[CoinTelegraph] Options market shows max pain at $95K for April expiry",
                "[TradingView] 20-day realized volatility at 42%, implying ±$8,000 range over 11 days",
            ],
            base_rate_analysis="When BTC is within 5% of a round number level with 10+ days to resolution, it crosses that level ~62% of the time historically. Current implied vol suggests a range of $89K-$106K at one standard deviation.",
            data_sources=["coindesk.com", "bloomberg.com", "glassnode.com", "cointelegraph.com"],
            assessed_probability=0.62,
            confidence=0.50,
            reasoning="At $97.4K with 11 days to go, the market at 55% is slightly underpricing. Strong ETF inflows, low sell pressure from long-term holders, and the historical tendency to test round numbers point toward ~62%. The main risk is a macro shock (tariff escalation, rate scare) that could trigger a broad risk-off move.",
        ),
        "edge_direction": "underpriced",
    },
    {
        "market": Market(
            id="demo-spacex-starship",
            source=MarketSource.POLYMARKET,
            title="SpaceX Starship successful orbital flight by April 22?",
            description="Resolves YES if SpaceX achieves a full orbital insertion with Starship (all stages perform nominally) before April 22, 2026.",
            url="https://polymarket.com/event/starship-orbital-apr",
            current_price=0.41,
            volume=3_100_000,
            resolution_date=datetime(2026, 4, 22, tzinfo=timezone.utc),
        ),
        "research": ResearchResult(
            market_id="demo-spacex-starship",
            search_queries=["SpaceX Starship launch schedule April 2026", "Starship IFT-8 status", "FAA Starship license"],
            key_findings=[
                "[SpaceNews] Starship IFT-8 targeting April 15 launch window, per Musk post",
                "[NASASpaceFlight] FAA license amendment approved for Boca Chica orbital attempt",
                "[Reuters] SpaceX completed successful static fire of Ship 32 on April 3",
                "[Ars Technica] Previous flight (IFT-7) achieved 94% of orbital velocity before RUD",
                "[Aviation Week] SpaceX has 3 backup launch windows through April 21",
            ],
            base_rate_analysis="SpaceX Starship flights have shown monotonic improvement: IFT-5 (40% success), IFT-6 (75%), IFT-7 (94% of orbital velocity). Extrapolating the improvement curve and accounting for the specific failure mode fix, base rate for IFT-8 success is roughly 55-65%.",
            data_sources=["spacenews.com", "nasaspaceflight.com", "reuters.com", "arstechnica.com"],
            assessed_probability=0.58,
            confidence=0.55,
            reasoning="Market at 41% is underpricing SpaceX's improving trajectory. IFT-7 was tantalizingly close, the failure mode has been identified and addressed, and FAA clearance is already in hand. The main risks are weather delays compressing the window and the inherent uncertainty of orbital-class rocketry.",
        ),
        "edge_direction": "underpriced",
    },
    {
        "market": Market(
            id="demo-tariff-china",
            source=MarketSource.KALSHI,
            title="Will US impose additional tariffs on China before April 20?",
            description="Resolves YES if the US government announces new tariffs specifically targeting Chinese imports (beyond currently scheduled rates) before April 20, 2026.",
            url="https://kalshi.com/markets/us-china-tariff-apr",
            current_price=0.72,
            volume=5_600_000,
            resolution_date=datetime(2026, 4, 20, tzinfo=timezone.utc),
        ),
        "research": ResearchResult(
            market_id="demo-tariff-china",
            search_queries=["US China tariffs April 2026", "trade war escalation 2026", "USTR China tariff announcement"],
            key_findings=[
                "[Reuters] USTR reviewing Section 301 tariff expansion, decision expected by mid-April",
                "[FT] White House trade advisor signals 'imminent action' on Chinese EV battery imports",
                "[Bloomberg] China pre-emptively announced retaliatory tariff framework",
                "[CNBC] Treasury Secretary expressed caution about tariff escalation at G7",
                "[Politico] Senate trade caucus letter urges restraint on broad-based tariffs",
            ],
            base_rate_analysis="In the current administration's first 15 months, tariff announcements have followed 'imminent action' signals 83% of the time (5/6 cases). However, Treasury pushback has delayed 2 of those by 2-4 weeks.",
            data_sources=["reuters.com", "ft.com", "bloomberg.com", "cnbc.com", "politico.com"],
            assessed_probability=0.61,
            confidence=0.60,
            reasoning="Market at 72% is moderately overpriced. While USTR is clearly preparing action, Treasury pushback and the G7 diplomatic calendar create incentives to delay past April 20. The 83% base rate for 'signal-to-action' drops to ~60% when there's active inter-agency friction, which we're clearly seeing.",
        ),
        "edge_direction": "overpriced",
    },
]


def generate_demo_newsletter(date: str = "2026-04-09"):
    """Generate a complete demo newsletter."""
    Config.ensure_dirs()

    writer = NewsletterWriter()

    # Build DivergenceOpportunity objects
    opportunities = []
    for item in DEMO_OPPORTUNITIES:
        opp = DivergenceOpportunity(
            market=item["market"],
            research=item["research"],
            divergence=item["research"].assessed_probability - item["market"].current_price,
            edge_direction=item["edge_direction"],
            edge_magnitude=abs(item["research"].assessed_probability - item["market"].current_price),
        )
        opportunities.append(opp)

    # Generate briefings using template (no LLM needed)
    briefings = writer.generate_briefings(opportunities)

    # Create a sample accuracy report
    accuracy = AccuracyReport(
        week_ending="2026-04-06",
        total_predictions=35,
        resolved_predictions=12,
        our_avg_brier=0.1842,
        market_avg_brier=0.2103,
        edge_calls_correct=8,
        edge_calls_total=12,
        edge_accuracy_pct=66.7,
        our_calibration={
            "0-10%": {"count": 2, "avg_predicted": 0.07, "avg_actual": 0.0, "calibration_error": 0.07},
            "30-40%": {"count": 3, "avg_predicted": 0.35, "avg_actual": 0.33, "calibration_error": 0.02},
            "50-60%": {"count": 4, "avg_predicted": 0.55, "avg_actual": 0.50, "calibration_error": 0.05},
            "70-80%": {"count": 3, "avg_predicted": 0.73, "avg_actual": 0.67, "calibration_error": 0.06},
        },
    )

    # Render the newsletter
    newsletter_md = writer.render_newsletter(
        date=date,
        briefings=briefings,
        accuracy=accuracy,
    )

    # Save
    output_path = Config.NEWSLETTER_DIR / f"{date}.md"
    output_path.write_text(newsletter_md)

    # Also log predictions
    tracker = PredictionTracker()
    tracker.log_predictions(date, opportunities)

    print(f"Demo newsletter saved to: {output_path}")
    print(f"Word count: ~{len(newsletter_md.split())}")

    writer.close()
    return output_path


if __name__ == "__main__":
    generate_demo_newsletter()
