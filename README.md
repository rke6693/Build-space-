# PolyBot — Polymarket Moonshot Trading Bot

A fully-autonomous Polymarket trading bot designed to run on a Mac mini M4.
Starts with $100 USDC, targets a $1,000 exit, halts forever at $20.

## Realistic expectations (read this first)

Turning $100 into $1,000 in under 30 days is a **10x / ~8% daily compound**
target. No systematic strategy reliably produces that. The only realistic
path is concentrated, high-conviction, aggressively-sized directional bets
— which means the honest outcome distribution for a run looks roughly like:

| Outcome bucket | Rough probability |
|---|---|
| < $50 (partial loss or wipeout) | ~55% |
| $50 – $300 | ~25% |
| $300 – $1,500 | ~15% |
| $1,500+ | ~5% |

The bot is built to take the moonshot shot without blowing up catastrophically:
hard shutdown at $20, daily drawdown circuit breaker, fractional-Kelly sizing,
slippage guards, and automated stop-loss / take-profit on every position.

## Strategies

| Edge | Idea | Data |
|---|---|---|
| `crypto_lag` | Polymarket crypto markets reprice slower than spot & vol. Price every live BTC/ETH/SOL/etc market with GBM closed-form + realized vol from Binance WS, bet the side with > 400 bps edge. | Binance WS + Polymarket Gamma + CLOB |
| `news_reactor` | Fresh wire headlines classified by Claude Haiku 4.5 against a shortlist of liquid non-crypto markets. Fires on high-confidence directional hits. | RSS feeds + Claude + Gamma + CLOB |
| `resolver_sniper` | Markets within 24h of resolution where one side trades $0.85-$0.97 but outcome is effectively decided. Claude double-checks certainty. | Gamma + Claude + CLOB |

All three compete for the same bankroll; the orchestrator sizes by best raw
edge first and respects all risk caps.

## Requirements

- Mac mini M4 (or any macOS on Apple silicon, Linux/x86 works too)
- Python 3.11+
- A funded Polymarket account:
  - Polygon wallet with USDC
  - Polymarket proxy wallet address
  - Private key of the EOA that funds the proxy
- Anthropic API key (for Claude Haiku 4.5)
- Telegram bot token + chat id (via [@BotFather](https://t.me/BotFather))

## Setup

```bash
git clone https://github.com/rke6693/build-space-.git
cd build-space-
git checkout claude/polymarket-trading-bot-Zfd5T
./scripts/setup.sh
```

`setup.sh` will:

1. Install Python 3.12 via Homebrew if missing.
2. Create a `.venv` and install dependencies.
3. Copy `.env.example` to `.env` (you still need to fill it in).
4. Install the launchd plist into `~/Library/LaunchAgents`.

Then edit `.env`:

```bash
nano .env   # or your editor of choice
```

Required values:

| Key | Where to get it |
|---|---|
| `POLYMARKET_PRIVATE_KEY` | Private key of the EOA you deposited with (hex, 0x-prefixed). Keep it secret. |
| `POLYMARKET_PROXY_ADDRESS` | Your Polymarket proxy wallet address. Find it at polymarket.com → profile → Deposit. |
| `POLYMARKET_SIG_TYPE` | `1` for email/magic-link accounts, `2` for MetaMask-style. |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys |
| `TELEGRAM_BOT_TOKEN` | Create a bot with [@BotFather](https://t.me/BotFather). |
| `TELEGRAM_CHAT_ID` | Message [@userinfobot](https://t.me/userinfobot) to get your chat id. |

## Running

**First run (manual, dry-run recommended):**

```bash
# set DRY_RUN=true in .env
source .venv/bin/activate
python main.py
```

You should see:

- `boot` log line with strategies enabled
- `warmup.wait_binance` → WS connects within a few seconds
- `crypto_lag.scan` every ~15 seconds
- A Telegram message saying "PolyBot online"

Let it run for ~15 minutes in `DRY_RUN=true` mode and watch for:

- No crashes
- `crypto_lag.hit` lines showing candidate trades
- Telegram "OPEN" messages with the simulated trades

When you're happy, flip `DRY_RUN=false` and restart:

```bash
# Ctrl-C the running process, then:
python main.py
```

**Install as a launchd service (auto-start on boot):**

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.polybot.plist
launchctl enable   gui/$(id -u)/com.polybot
launchctl kickstart -k gui/$(id -u)/com.polybot
```

Logs live at:

- `state/logs/bot.jsonl` — structured JSON events
- `state/logs/launchd.out` / `.err` — stdout/stderr from launchd

**Stop the service:**

```bash
launchctl bootout gui/$(id -u)/com.polybot
```

## Operations

### Daily report
At 00:05 UTC the bot posts a Telegram summary: bankroll, realised P&L,
open positions, high-water mark.

### Halting
The bot halts permanently (writes `halted: true` into `state/bankroll.json`)
when any of these trip:

- Total bankroll <= `HARD_SHUTDOWN_USDC` (default $20)
- Target reached: bankroll >= `TARGET_BANKROLL_USDC` (default $1000)
- Daily drawdown >= `DAILY_DRAWDOWN_PCT` (default 35%, resets daily)

To resume after a halt, edit `state/bankroll.json` and set `halted` to
`false` (or delete the file to start fresh).

### Tuning risk
All risk knobs are in `.env`. Safer presets:

```env
KELLY_FRACTION=0.5          # standard fractional Kelly
MAX_POSITION_FRAC=0.15      # max 15% per market
MIN_EDGE_BPS=600            # only trade with 6%+ edge
DAILY_DRAWDOWN_PCT=0.20     # trip earlier
```

### Disabling a strategy
Set `ENABLE_<name>=false` in `.env` and restart.

### Claude budget
`CLAUDE_MAX_SPEND_USD_DAILY=5.0` caps LLM spend. If exhausted, the
`news_reactor` and `resolver_sniper` go idle until UTC midnight.
`crypto_lag` is LLM-free and always runs.

## Project layout

```
core/
    config.py         env loader + validation
    logger.py         structlog setup (JSON + console)
    bankroll.py       persistent ledger of cash + positions
    risk.py           risk gates + Kelly sizing
    notifier.py       Telegram
    polymarket_client.py    py-clob-client wrapper
    executor.py       turns intents -> fills -> bankroll mutations
data/
    binance_ws.py     multi-symbol WebSocket price tape
    polymarket_gamma.py     market discovery REST client
    news_sources.py   RSS poller
models/
    vol.py            realized volatility
    gbm.py            closed-form GBM / first-passage probabilities
edges/
    base.py
    crypto_lag.py
    news_reactor.py
    resolver_sniper.py
main.py               orchestrator
scripts/
    setup.sh
    com.polybot.plist
state/
    bankroll.json     (generated)
    logs/             (generated)
```

## Safety checklist

Before you flip `DRY_RUN=false`:

- [ ] `.env` is filled in and **not** committed
- [ ] Dry-run for ≥15 min, `crypto_lag.hit` lines appear, no crashes
- [ ] Telegram alerts arrive
- [ ] Proxy wallet has USDC deposited (check on Polymarket)
- [ ] `STARTING_BANKROLL_USDC` matches what's actually deposited
- [ ] Risk caps (`MAX_POSITION_FRAC`, `HARD_SHUTDOWN_USDC`) are set where
      you can sleep at night if they trigger

## Legal

This is personal-use software for your own account. Prediction markets
are not legal in every jurisdiction. **You are responsible for checking
that Polymarket is legal for you to use.** The bot has no warranty and
can lose your entire bankroll. Run it with money you can afford to lose.
