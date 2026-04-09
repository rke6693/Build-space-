#!/usr/bin/env python3
"""Market Edge Daily — Prediction Market Newsletter CLI.

Usage:
    python run_newsletter.py                     # Generate today's newsletter
    python run_newsletter.py --date 2026-04-09   # Generate for specific date
    python run_newsletter.py --resolve           # Check & resolve past predictions
    python run_newsletter.py --accuracy          # Generate accuracy report
    python run_newsletter.py --stats             # Show prediction stats
    python run_newsletter.py --schedule          # Run on daily schedule (5am)
"""

import argparse
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

from newsletter_engine.config import Config
from newsletter_engine.pipeline import NewsletterPipeline
from newsletter_engine.tracker import PredictionTracker, AccuracyScorer
from newsletter_engine.tracker.resolver import ResolutionChecker


def setup_logging(verbose: bool = False):
    """Configure logging."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    # Quiet noisy libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("openai").setLevel(logging.WARNING)


def cmd_generate(args):
    """Generate the daily newsletter."""
    date = args.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    with NewsletterPipeline() as pipeline:
        output_path = pipeline.run(date=date)

    print(f"\nNewsletter saved to: {output_path}")
    print(f"Word count: ~{len(output_path.read_text().split())}")


def cmd_resolve(args):
    """Check and resolve past predictions."""
    tracker = PredictionTracker()
    resolver = ResolutionChecker(tracker)

    print("Checking market resolutions...")
    stats = resolver.check_and_resolve_all()

    print(f"\nResolution Results:")
    print(f"  Checked:   {stats['checked']}")
    print(f"  Resolved:  {stats['resolved']}")
    print(f"  Remaining: {stats['remaining']}")

    resolver.close()


def cmd_accuracy(args):
    """Generate an accuracy report."""
    date = args.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    tracker = PredictionTracker()
    scorer = AccuracyScorer(tracker)

    report = scorer.generate_weekly_report(date)
    scorer.save_report(report)

    # Also save as markdown
    md = scorer.render_accuracy_markdown(report)
    md_path = Config.ACCURACY_DIR / f"accuracy_{date}.md"
    md_path.write_text(md)

    print(md)
    print(f"\nReport saved to: {md_path}")


def cmd_stats(args):
    """Show prediction tracking stats."""
    tracker = PredictionTracker()
    stats = tracker.get_stats()

    print("\nPrediction Tracker Stats:")
    print(f"  Total predictions:  {stats['total_predictions']}")
    print(f"  Resolved:           {stats['resolved']}")
    print(f"  Unresolved:         {stats['unresolved']}")

    if stats.get("our_avg_brier") is not None:
        print(f"\n  Our avg Brier:      {stats['our_avg_brier']:.4f}")
    if stats.get("market_avg_brier") is not None:
        print(f"  Market avg Brier:   {stats['market_avg_brier']:.4f}")
        diff = stats['market_avg_brier'] - stats['our_avg_brier']
        better = "better" if diff > 0 else "worse"
        print(f"  Edge vs market:     {abs(diff):.4f} ({better})")


def cmd_schedule(args):
    """Run on a daily schedule."""
    import schedule as sched

    hour = Config.DAILY_RUN_HOUR
    minute = Config.DAILY_RUN_MINUTE
    time_str = f"{hour:02d}:{minute:02d}"

    print(f"Scheduling daily newsletter generation at {time_str} UTC")
    print("Press Ctrl+C to stop.\n")

    def daily_job():
        print(f"\n[{datetime.now(timezone.utc).isoformat()}] Running daily newsletter...")
        try:
            with NewsletterPipeline() as pipeline:
                output = pipeline.run()
            print(f"Done. Saved to: {output}")
        except Exception as e:
            logging.error(f"Pipeline failed: {e}")

    sched.every().day.at(time_str).do(daily_job)

    # Also run immediately if --now flag
    if args.now:
        daily_job()

    try:
        while True:
            sched.run_pending()
            time.sleep(60)
    except KeyboardInterrupt:
        print("\nScheduler stopped.")


def main():
    parser = argparse.ArgumentParser(
        description="Market Edge Daily — Prediction Market Newsletter",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose logging")

    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # generate
    gen_parser = subparsers.add_parser("generate", help="Generate today's newsletter")
    gen_parser.add_argument("--date", type=str, help="Override date (YYYY-MM-DD)")

    # resolve
    subparsers.add_parser("resolve", help="Check & resolve past predictions")

    # accuracy
    acc_parser = subparsers.add_parser("accuracy", help="Generate accuracy report")
    acc_parser.add_argument("--date", type=str, help="Week ending date (YYYY-MM-DD)")

    # stats
    subparsers.add_parser("stats", help="Show prediction tracking stats")

    # schedule
    sched_parser = subparsers.add_parser("schedule", help="Run on daily schedule")
    sched_parser.add_argument("--now", action="store_true", help="Also run immediately")

    args = parser.parse_args()
    setup_logging(args.verbose)

    if args.command is None:
        # Default: generate
        args.date = None
        cmd_generate(args)
    elif args.command == "generate":
        cmd_generate(args)
    elif args.command == "resolve":
        cmd_resolve(args)
    elif args.command == "accuracy":
        cmd_accuracy(args)
    elif args.command == "stats":
        cmd_stats(args)
    elif args.command == "schedule":
        cmd_schedule(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
