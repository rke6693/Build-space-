"""Initial schema — markets, snapshots, order book, whales, arbitrage, API keys.

Revision ID: 001
Revises: None
Create Date: 2026-04-09
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable TimescaleDB extension if available
    op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE")

    # ── Markets table ──────────────────────────────────────
    op.create_table(
        "markets",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("platform", sa.String(32), nullable=False, index=True),
        sa.Column("platform_market_id", sa.String(256), nullable=False),
        sa.Column("title", sa.Text, nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("category", sa.String(128), index=True),
        sa.Column("subcategory", sa.String(128)),
        sa.Column("yes_price", sa.Float),
        sa.Column("no_price", sa.Float),
        sa.Column("last_trade_price", sa.Float),
        sa.Column("volume_24h", sa.Float, server_default="0"),
        sa.Column("volume_total", sa.Float, server_default="0"),
        sa.Column("liquidity", sa.Float, server_default="0"),
        sa.Column("open_interest", sa.Float, server_default="0"),
        sa.Column("status", sa.String(32), server_default="active", index=True),
        sa.Column("resolution", sa.String(32), server_default="pending"),
        sa.Column("resolution_source", sa.Text),
        sa.Column("end_date", sa.DateTime),
        sa.Column("resolved_at", sa.DateTime),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("tags", JSONB, server_default="[]"),
        sa.Column("metadata", JSONB, server_default="{}"),
    )
    op.create_index("ix_platform_market", "markets", ["platform", "platform_market_id"], unique=True)
    op.create_index("ix_category_status", "markets", ["category", "status"])

    # ── Price snapshots (TimescaleDB hypertable) ───────────
    op.create_table(
        "price_snapshots",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("market_id", sa.String(64), sa.ForeignKey("markets.id"), nullable=False, index=True),
        sa.Column("timestamp", sa.DateTime, nullable=False, index=True),
        sa.Column("yes_price", sa.Float),
        sa.Column("no_price", sa.Float),
        sa.Column("mid_price", sa.Float),
        sa.Column("spread", sa.Float),
        sa.Column("volume", sa.Float),
        sa.Column("liquidity", sa.Float),
        sa.Column("platform", sa.String(32)),
    )
    op.create_index("ix_snapshot_market_time", "price_snapshots", ["market_id", "timestamp"])

    # Convert to TimescaleDB hypertable for efficient time-series queries
    op.execute("SELECT create_hypertable('price_snapshots', 'timestamp', if_not_exists => TRUE)")

    # ── Order book entries ─────────────────────────────────
    op.create_table(
        "order_book_entries",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("market_id", sa.String(64), sa.ForeignKey("markets.id"), nullable=False, index=True),
        sa.Column("timestamp", sa.DateTime, nullable=False),
        sa.Column("side", sa.String(8), nullable=False),
        sa.Column("price", sa.Float, nullable=False),
        sa.Column("size", sa.Float, nullable=False),
        sa.Column("platform", sa.String(32)),
    )

    # ── Whale trades ───────────────────────────────────────
    op.create_table(
        "whale_trades",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("market_id", sa.String(64), sa.ForeignKey("markets.id"), nullable=False, index=True),
        sa.Column("timestamp", sa.DateTime, nullable=False, index=True),
        sa.Column("wallet_address", sa.String(256), index=True),
        sa.Column("side", sa.String(8), nullable=False),
        sa.Column("price", sa.Float, nullable=False),
        sa.Column("size", sa.Float, nullable=False),
        sa.Column("usd_value", sa.Float, nullable=False),
        sa.Column("platform", sa.String(32)),
        sa.Column("is_new_position", sa.Boolean, server_default="false"),
        sa.Column("tags", JSONB, server_default="[]"),
    )
    op.create_index("ix_whale_wallet_time", "whale_trades", ["wallet_address", "timestamp"])

    # ── Arbitrage opportunities ────────────────────────────
    op.create_table(
        "arbitrage_opportunities",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("market_a_id", sa.String(64), sa.ForeignKey("markets.id"), nullable=False),
        sa.Column("market_b_id", sa.String(64), sa.ForeignKey("markets.id"), nullable=False),
        sa.Column("platform_a", sa.String(32)),
        sa.Column("platform_b", sa.String(32)),
        sa.Column("price_a", sa.Float, nullable=False),
        sa.Column("price_b", sa.Float, nullable=False),
        sa.Column("spread_pct", sa.Float, nullable=False),
        sa.Column("detected_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("expired_at", sa.DateTime),
        sa.Column("estimated_profit_bps", sa.Float),
        sa.Column("is_active", sa.Boolean, server_default="true", index=True),
    )

    # ── API keys ───────────────────────────────────────────
    op.create_table(
        "api_keys",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(64), nullable=False, index=True),
        sa.Column("key_hash", sa.String(256), nullable=False, unique=True),
        sa.Column("tier", sa.String(32), server_default="free"),
        sa.Column("rate_limit", sa.Integer, server_default="60"),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime),
        sa.Column("last_used_at", sa.DateTime),
        sa.Column("request_count", sa.BigInteger, server_default="0"),
        sa.Column("metadata", JSONB, server_default="{}"),
    )

    # ── Compression policy for old snapshots ───────────────
    op.execute("""
        SELECT add_compression_policy('price_snapshots', INTERVAL '7 days', if_not_exists => TRUE)
    """)

    # ── Retention policy — drop snapshots older than 2 years
    op.execute("""
        SELECT add_retention_policy('price_snapshots', INTERVAL '2 years', if_not_exists => TRUE)
    """)


def downgrade() -> None:
    op.drop_table("api_keys")
    op.drop_table("arbitrage_opportunities")
    op.drop_table("whale_trades")
    op.drop_table("order_book_entries")
    op.drop_table("price_snapshots")
    op.drop_table("markets")
