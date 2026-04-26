"""Command-line interface for nba-parlay."""
from __future__ import annotations

import logging
from datetime import date, datetime
from pathlib import Path
from typing import Optional

import typer
from rich.logging import RichHandler

from .config import load_config
from .data.downloader import fetch_many
from .models.train import train_game_model, train_prop_models
from .pipeline import run_daily

app = typer.Typer(add_completion=False, help="NBA prediction + parlay generator.")


def _setup_logging(verbose: bool = False) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(message)s",
        datefmt="%H:%M:%S",
        handlers=[RichHandler(rich_tracebacks=True, show_time=True, show_path=False)],
    )


@app.command()
def fetch(
    config: Optional[Path] = typer.Option(None, "--config", "-c", help="Path to config.yaml"),
    refresh: bool = typer.Option(False, help="Force re-download of cached seasons"),
):
    """Download and cache shufinskiy/nba_data archives for the configured seasons."""
    _setup_logging()
    cfg = load_config(config)
    seasons = cfg.data.train_seasons + [cfg.data.current_season]
    out = fetch_many(cfg.data.shufinskiy_datasets, seasons, cfg.data.cache_dir, refresh=refresh)
    for name, df in out.items():
        typer.echo(f"{name}: {len(df):,} rows across {df['__season'].nunique() if '__season' in df else 0} seasons")


@app.command()
def train(
    config: Optional[Path] = typer.Option(None, "--config", "-c"),
    skip_props: bool = typer.Option(False),
    skip_game: bool = typer.Option(False),
):
    """Train all models."""
    _setup_logging()
    cfg = load_config(config)
    if not skip_props:
        train_prop_models(cfg)
    if not skip_game:
        train_game_model(cfg)
    typer.echo("training complete")


@app.command()
def daily(
    config: Optional[Path] = typer.Option(None, "--config", "-c"),
    target: Optional[str] = typer.Option(None, help="Date YYYY-MM-DD; defaults to today (UTC)"),
    dry_run: bool = typer.Option(False, help="Print report instead of emailing"),
):
    """Run the daily pipeline: predict, generate parlays, email."""
    _setup_logging()
    cfg = load_config(config)
    if dry_run:
        cfg.smtp_user = None
        cfg.smtp_password = None
    target_date: date = datetime.strptime(target, "%Y-%m-%d").date() if target else datetime.utcnow().date()
    run_daily(cfg, target_date=target_date)


@app.command()
def version():
    from . import __version__
    typer.echo(__version__)


if __name__ == "__main__":
    app()
