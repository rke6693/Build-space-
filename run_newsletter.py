#!/usr/bin/env python3
"""Market Edge Daily — Prediction Market Newsletter CLI.

Usage:
    python run_newsletter.py generate                  # Generate + deliver today's newsletter
    python run_newsletter.py generate --date 2026-04-09
    python run_newsletter.py generate --dry-run        # Full pipeline, no side effects
    python run_newsletter.py resolve                   # Check & resolve past predictions
    python run_newsletter.py accuracy                  # Generate accuracy report
    python run_newsletter.py stats                     # Show prediction stats
    python run_newsletter.py migrate                   # Migrate JSON tracker to SQLite
    python run_newsletter.py schedule                  # Run on daily schedule (5am)
    python run_newsletter.py schedule --resolve-interval 6  # Also resolve every 6 hours
"""

import argparse
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from newsletter_engine.config import Config
from newsletter_engine.pipeline import NewsletterPipeline
from newsletter_engine.tracker.database import PredictionDB
from newsletter_engine.tracker.accuracy import AccuracyScorer
from newsletter_engine.tracker.resolver import ResolutionChecker


def setup_logging(verbose: bool = False, json_format: bool = False):
    """Configure logging with optional structured JSON output."""
    level = logging.DEBUG if verbose else logging.INFO

    if json_format:
        import json as json_mod

        class JsonFormatter(logging.Formatter):
            def format(self, record):
                log_obj = {
                    "ts": self.formatTime(record),
                    "level": record.levelname,
                    "logger": record.name,
                    "msg": record.getMessage(),
                }
                if record.exc_info and record.exc_info[0]:
                    log_obj["exception"] = self.formatException(record.exc_info)
                return json_mod.dumps(log_obj)

        handler = logging.StreamHandler()
        handler.setFormatter(JsonFormatter())
        logging.root.handlers = [handler]
        logging.root.setLevel(level)
    else:
        logging.basicConfig(
            level=level,
            format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("openai").setLevel(logging.WARNING)


def cmd_generate(args):
    """Generate the daily newsletter."""
    Config.log_warnings()

    date = args.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    dry_run = getattr(args, "dry_run", False)

    if dry_run:
        print("Running in DRY RUN mode — no predictions saved, no delivery sent.\n")

    try:
        with NewsletterPipeline() as pipeline:
            output_path = pipeline.run(date=date, dry_run=dry_run)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"\nNewsletter saved to: {output_path}")
    print(f"Word count: ~{len(output_path.read_text().split())}")


def cmd_resolve(args):
    """Check and resolve past predictions."""
    db = PredictionDB()
    resolver = ResolutionChecker(db=db)

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
    db = PredictionDB()
    scorer = AccuracyScorer(db=db)

    report = scorer.generate_weekly_report(date)
    scorer.save_report(report)

    md = scorer.render_accuracy_markdown(report)
    Config.ensure_dirs()
    md_path = Config.ACCURACY_DIR / f"accuracy_{date}.md"
    md_path.write_text(md)

    print(md)
    print(f"\nReport saved to: {md_path}")


def cmd_stats(args):
    """Show prediction tracking stats."""
    db = PredictionDB()
    stats = db.get_stats()

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


def cmd_migrate(args):
    """Migrate data from JSON tracker to SQLite."""
    json_path = Config.TRACKER_DB
    print(f"Migrating from: {json_path}")

    db = PredictionDB()
    db.migrate_from_json(json_path)

    stats = db.get_stats()
    print(f"\nMigration complete. SQLite now has:")
    print(f"  Total predictions: {stats['total_predictions']}")
    print(f"  Resolved:          {stats['resolved']}")
    print(f"  DB path:           {db.db_path}")


def cmd_schedule(args):
    """Run on a daily schedule with optional resolution checking."""
    import schedule as sched

    hour = Config.DAILY_RUN_HOUR
    minute = Config.DAILY_RUN_MINUTE
    time_str = f"{hour:02d}:{minute:02d}"
    resolve_interval = getattr(args, "resolve_interval", 0)

    print(f"Scheduling daily newsletter generation at {time_str} UTC")
    if resolve_interval > 0:
        print(f"Scheduling resolution checks every {resolve_interval} hours")
    print("Press Ctrl+C to stop.\n")

    def daily_job():
        print(f"\n[{datetime.now(timezone.utc).isoformat()}] Running daily newsletter...")
        try:
            with NewsletterPipeline() as pipeline:
                output = pipeline.run()
            print(f"Done. Saved to: {output}")
        except Exception as e:
            logging.error(f"Pipeline failed: {e}")

    def resolve_job():
        print(f"\n[{datetime.now(timezone.utc).isoformat()}] Checking resolutions...")
        try:
            db = PredictionDB()
            resolver = ResolutionChecker(db=db)
            stats = resolver.check_and_resolve_all()
            resolver.close()
            if stats["resolved"] > 0:
                print(f"  Resolved {stats['resolved']} predictions")
        except Exception as e:
            logging.error(f"Resolution check failed: {e}")

    sched.every().day.at(time_str).do(daily_job)
    if resolve_interval > 0:
        sched.every(resolve_interval).hours.do(resolve_job)

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
    parser.add_argument("--json-log", action="store_true", help="Structured JSON logging")

    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # generate
    gen_parser = subparsers.add_parser("generate", help="Generate today's newsletter")
    gen_parser.add_argument("--date", type=str, help="Override date (YYYY-MM-DD)")
    gen_parser.add_argument(
        "--dry-run", action="store_true",
        help="Run full pipeline without saving predictions or sending delivery",
    )

    # resolve
    subparsers.add_parser("resolve", help="Check & resolve past predictions")

    # accuracy
    acc_parser = subparsers.add_parser("accuracy", help="Generate accuracy report")
    acc_parser.add_argument("--date", type=str, help="Week ending date (YYYY-MM-DD)")

    # stats
    subparsers.add_parser("stats", help="Show prediction tracking stats")

    # migrate
    subparsers.add_parser("migrate", help="Migrate JSON tracker to SQLite")

    # schedule
    sched_parser = subparsers.add_parser("schedule", help="Run on daily schedule")
    sched_parser.add_argument("--now", action="store_true", help="Also run immediately")
    sched_parser.add_argument(
        "--resolve-interval", type=int, default=0,
        help="Also check resolutions every N hours (0 = disabled)",
    )

    args = parser.parse_args()
    setup_logging(args.verbose, getattr(args, "json_log", False))

    commands = {
        "generate": cmd_generate,
        "resolve": cmd_resolve,
        "accuracy": cmd_accuracy,
        "stats": cmd_stats,
        "migrate": cmd_migrate,
        "schedule": cmd_schedule,
    }

    if args.command is None:
        args.date = None
        args.dry_run = False
        cmd_generate(args)
    elif args.command in commands:
        commands[args.command](args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
