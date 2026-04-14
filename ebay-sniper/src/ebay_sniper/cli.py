"""`ebay-sniper` CLI."""

from __future__ import annotations

import asyncio
import logging
import logging.handlers
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

import click

from .config import EXAMPLE_CONFIG_TOML, load_config
from .db import (
    Auction,
    Database,
    STATUS_SCHEDULED,
    STATUS_SKIPPED_COLLISION,
    STATUS_WATCHING,
)
from .ebay_client import BidResult, EbayClient
from .notifier import Notification, Notifier
from .scheduler import (
    SnipePlan,
    SniperRunner,
    mark_collisions_in_db,
    plan_snipes,
)
from .time_sync import TimeSyncer
from .url_parse import UrlParseError, parse_item_url


def _setup_logging(log_file) -> None:
    root = logging.getLogger()
    if root.handlers:
        return
    root.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")

    stream = logging.StreamHandler()
    stream.setFormatter(fmt)
    root.addHandler(stream)

    file_handler = logging.handlers.RotatingFileHandler(
        log_file, maxBytes=2_000_000, backupCount=3
    )
    file_handler.setFormatter(fmt)
    root.addHandler(file_handler)


def _dollars_to_cents(amount: str) -> int:
    try:
        value = Decimal(amount)
    except InvalidOperation as exc:
        raise click.BadParameter(f"invalid amount: {amount!r}") from exc
    if value <= 0:
        raise click.BadParameter("amount must be positive")
    return int((value * 100).quantize(Decimal("1")))


def _fmt_auction(a: Auction) -> str:
    end = a.end_time_utc.isoformat() if a.end_time_utc else "—"
    title = (a.title or "")[:60]
    return (
        f"#{a.id:<4} {a.item_id:<13} {a.status:<18} "
        f"max={a.max_bid_cents/100:>8.2f} {a.currency} "
        f"lead={a.lead_time_s}s end={end}  {title}"
    )


@click.group()
@click.pass_context
def main(ctx: click.Context) -> None:
    """eBay auction sniper bot (personal use only — against eBay's ToS)."""
    cfg = load_config()
    _setup_logging(cfg.log_file)
    ctx.obj = cfg


@main.command()
@click.argument("url")
@click.option("--max", "max_amount", required=True, help="Max bid amount, e.g. 42.50")
@click.option("--lead", "lead_time_s", type=int, default=None, help="Lead time in seconds")
@click.option("--note", default=None, help="Free-text note")
@click.pass_obj
def add(cfg, url: str, max_amount: str, lead_time_s: int | None, note: str | None) -> None:
    """Add an auction to watch by URL."""
    try:
        item = parse_item_url(url)
    except UrlParseError as exc:
        raise click.ClickException(str(exc))
    lead = lead_time_s if lead_time_s is not None else cfg.default_lead_time_s
    cents = _dollars_to_cents(max_amount)
    with Database(cfg.db_path) as db:
        auction_id = db.add_auction(
            item_id=item.item_id,
            host=item.host,
            url=item.canonical_url,
            max_bid_cents=cents,
            lead_time_s=lead,
            note=note,
        )
    click.echo(
        f"Added auction #{auction_id}: item={item.item_id} max={cents/100:.2f} lead={lead}s"
    )
    click.echo("Run `ebay-sniper run` to start the daemon (or --dry-run to test).")


@main.command(name="list")
@click.pass_obj
def list_cmd(cfg) -> None:
    """List watched auctions."""
    with Database(cfg.db_path) as db:
        auctions = db.list_auctions()
    if not auctions:
        click.echo("No auctions. Use `ebay-sniper add <url> --max <price>`.")
        return
    for a in auctions:
        click.echo(_fmt_auction(a))


@main.command()
@click.argument("auction_id", type=int)
@click.pass_obj
def remove(cfg, auction_id: int) -> None:
    """Stop watching an auction."""
    with Database(cfg.db_path) as db:
        removed = db.remove_auction(auction_id)
    if not removed:
        raise click.ClickException(f"no auction with id {auction_id}")
    click.echo(f"Removed auction #{auction_id}")


@main.command()
@click.option("--item", "item_filter", default=None, help="Filter by item id")
@click.pass_obj
def history(cfg, item_filter: str | None) -> None:
    """Show past snipe attempts."""
    with Database(cfg.db_path) as db:
        filter_id: int | None = None
        if item_filter:
            for a in db.list_auctions():
                if a.item_id == item_filter:
                    filter_id = a.id
                    break
            if filter_id is None:
                raise click.ClickException(f"no watched auction with item id {item_filter}")
        snipes = db.list_snipes(auction_id=filter_id)
    if not snipes:
        click.echo("No snipe history.")
        return
    for s in snipes:
        price = f"{s.final_price_cents/100:.2f}" if s.final_price_cents else "—"
        dry = " (dry)" if s.dry_run else ""
        err = f" error={s.error}" if s.error else ""
        click.echo(
            f"#{s.id:<4} auction={s.auction_id} "
            f"fired_at={s.fired_at_utc.isoformat()} outcome={s.outcome}{dry} "
            f"price={price}{err}"
        )


@main.command()
@click.pass_obj
def login(cfg) -> None:
    """Open a headed browser so you can log in to eBay manually (once)."""

    async def _login() -> None:
        async with EbayClient(
            user_data_dir=cfg.browser_profile_dir,
            headless=False,
            host=cfg.ebay_host,
        ) as client:
            click.echo(
                "A browser window will open. Sign in to eBay, solve any MFA/captcha, "
                "then close the window to save your session."
            )
            # Open a page and wait until the user manually closes it.
            page = await client._ctx().new_page()  # noqa: SLF001
            await page.goto("https://signin.ebay.com/")
            try:
                await page.wait_for_event("close", timeout=0)
            except Exception:  # noqa: BLE001
                pass
            logged_in = await client.is_logged_in()
            if logged_in:
                click.echo("Session saved. You're logged in.")
            else:
                click.echo("Warning: couldn't confirm you're logged in. Try again.")

    asyncio.run(_login())


@main.command()
@click.option("--dry-run", is_flag=True, help="Run every step except final confirm click")
@click.option("--refresh", is_flag=True, help="Refresh item details before planning")
@click.pass_obj
def run(cfg, dry_run: bool, refresh: bool) -> None:
    """Schedule and fire snipes for every watching auction."""

    async def _run() -> None:
        notifier = Notifier(cfg.smtp)

        def notice(subject: str, body: str) -> None:
            notifier.send(Notification(subject=subject, body=body))

        with Database(cfg.db_path) as db:
            auctions = db.list_auctions(active_only=True)
            if not auctions:
                click.echo("No active auctions to snipe.")
                return

            syncer = TimeSyncer()
            await syncer.start()

            async with EbayClient(
                user_data_dir=cfg.browser_profile_dir,
                headless=True,
                host=cfg.ebay_host,
            ) as client:
                if not await client.is_logged_in():
                    await syncer.stop()
                    raise click.ClickException(
                        "Not logged in. Run `ebay-sniper login` first."
                    )

                if refresh or any(a.end_time_utc is None for a in auctions):
                    click.echo("Refreshing item details...")
                    for a in auctions:
                        try:
                            details = await client.fetch_item_details(a.item_id)
                            db.update_auction_end_and_title(
                                a.id, details.end_time_utc, details.title
                            )
                        except Exception as exc:  # noqa: BLE001
                            click.echo(f"warn: refresh failed for {a.item_id}: {exc}")
                    auctions = db.list_auctions(active_only=True)

                now_ebay = syncer.clock.ebay_now()
                result = plan_snipes(auctions, now_ebay=now_ebay)
                mark_collisions_in_db(db, result.skipped)

                if result.skipped:
                    body_lines = [
                        f"- item {p.auction.item_id} (id={p.auction.id}) "
                        f"collided with id={p.collided_with}"
                        for p in result.skipped
                    ]
                    notice(
                        "[ebay-sniper] Auctions skipped due to collision",
                        "\n".join(body_lines),
                    )

                if not result.plans:
                    click.echo("Nothing to schedule.")
                    await syncer.stop()
                    return

                click.echo(f"Scheduling {len(result.plans)} snipes (dry_run={dry_run}):")
                for p in result.plans:
                    click.echo(
                        f"  #{p.auction.id} {p.auction.item_id} "
                        f"bid_at={p.ebay_bid_at.isoformat()} "
                        f"end={p.ebay_end_at.isoformat()}"
                    )

                async def bid_cb(plan: SnipePlan, is_dry: bool) -> BidResult:
                    return await client.place_bid(
                        plan.auction.item_id,
                        plan.auction.max_bid_cents,
                        currency=plan.auction.currency,
                        dry_run=is_dry,
                    )

                runner = SniperRunner(
                    db=db,
                    clock=syncer.clock,
                    bid_callback=bid_cb,
                    notice_callback=notice,
                    dry_run=dry_run,
                )
                try:
                    await runner.run(result.plans)
                finally:
                    await syncer.stop()

    asyncio.run(_run())


@main.command(name="init-config")
@click.pass_obj
def init_config(cfg) -> None:
    """Write an example config.toml if one doesn't exist yet."""
    if cfg.config_file.exists():
        click.echo(f"Config already exists at {cfg.config_file}")
        return
    cfg.config_dir.mkdir(parents=True, exist_ok=True)
    cfg.config_file.write_text(EXAMPLE_CONFIG_TOML, encoding="utf-8")
    click.echo(f"Wrote example config to {cfg.config_file}")


if __name__ == "__main__":
    main()
