# ebay-sniper

A personal-use eBay auction sniper bot. CLI-driven, Playwright-backed, SQLite-persisted.

> **Heads up.** Automated bidding is against eBay's Terms of Service. This project is intended for personal and educational use only. It makes no attempt to evade rate limits or obscure itself, drives a real logged-in browser session at a human-like pace, and stays off any eBay API that isn't authorized for this use case. Use at your own risk.

## What it does

- Watch any number of ebay.com auctions.
- On `run`, schedule one bid per auction that fires a configurable number of seconds (default **6**) before the auction closes.
- Uses your real logged-in eBay session via a persistent Playwright profile — you log in once, session cookies are reused for every subsequent run.
- Treats your max bid as a true ceiling: it submits that amount and lets eBay's proxy-bidding system only charge you one increment above the runner-up.
- Keeps its own clock honest by reading eBay's `Date` HTTP header and computing the offset from the local clock. All schedules are built against eBay server time.
- Detects **collisions**: if two auctions would overlap in the bid window (e.g. both closing within a few seconds of each other), the later one is skipped with a warning, because only one Playwright bid flow can run cleanly at a time.
- One fast retry on bid failure, then emails you.
- Full `--dry-run` mode that runs every step against real auctions except the final "Confirm bid" click, so you can validate timing end-to-end.
- Email notifications (SMTP) on snipe success, error, and startup collision warnings.

## Install

```bash
cd ebay-sniper
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
python -m playwright install chromium
```

## One-time setup

```bash
# Write an example config file to ~/.config/ebay-sniper/config.toml
ebay-sniper init-config

# Edit it to add SMTP settings (or skip — the bot will log notifications instead).
$EDITOR ~/.config/ebay-sniper/config.toml

# Open a headed browser so you can log in to eBay manually (handles 2FA, captcha).
# Your session is saved to ~/.local/share/ebay-sniper/browser-profile/.
ebay-sniper login
```

## Usage

```bash
# Add an auction to watch.
ebay-sniper add "https://www.ebay.com/itm/123456789012" --max 42.50

# Override the default lead time and add a note.
ebay-sniper add "https://www.ebay.com/itm/987654321098" --max 99.99 --lead 4 --note "vinyl"

# See what's watched.
ebay-sniper list

# Start the daemon. It refreshes end times from each item page on startup,
# plans all snipes (detecting collisions), then sleeps until each one fires.
ebay-sniper run

# Same, but does not click the final Confirm button. Use this first.
ebay-sniper run --dry-run

# Stop watching an auction.
ebay-sniper remove 3

# Past snipe attempts.
ebay-sniper history
ebay-sniper history --item 123456789012
```

## How a snipe works

1. On `run`, the bot opens a headless Chromium with your saved profile and checks you're logged in.
2. For every watched auction with an unknown end time (or when `--refresh` is passed), it visits the item page and scrapes the title, current price, and auction end time.
3. It starts a background time-sync task: every 60 seconds, it issues `HEAD https://www.ebay.com/` and parses the `Date` response header. The local → eBay clock offset is updated.
4. It builds a schedule by sorting auctions by `end_time - lead_time` (the "bid-at" moment, in eBay time). Any auction whose `[bid_at, end_at]` window overlaps an already-accepted window is marked as a collision and skipped (with an email). One bid flow can run cleanly at a time.
5. For each plan, it sleeps until the local-clock time corresponding to `bid_at - offset`, then runs the bid flow: load item → click "Place bid" → fill the max-bid amount → click "Review bid" → click "Confirm bid".
6. On failure, one fast retry (~250 ms later). If that also fails, it records an error and emails you.
7. In `--dry-run`, every step runs except the final Confirm click — a dry-run row is recorded and an email is sent.

## Data locations

| File                                              | Purpose                             |
| ------------------------------------------------- | ----------------------------------- |
| `~/.config/ebay-sniper/config.toml`               | Lead time default, SMTP settings    |
| `~/.local/share/ebay-sniper/sniper.db`            | SQLite database                     |
| `~/.local/share/ebay-sniper/browser-profile/`     | Playwright persistent Chromium profile |
| `~/.local/share/ebay-sniper/logs/sniper.log`      | Rotating log file                   |

## Configuration (`config.toml`)

```toml
default_lead_time_s = 6
ebay_host = "www.ebay.com"

[smtp]
host = "smtp.example.com"
port = 587
username = "you@example.com"
password = "app-password"   # or set EBAY_SNIPER_SMTP_PASSWORD env var
from = "sniper@example.com"
to = "you@example.com"
use_tls = true
```

The SMTP password may also be provided via `EBAY_SNIPER_SMTP_PASSWORD`, which overrides the config file so you don't have to store it on disk.

## Project layout

```
ebay-sniper/
├── pyproject.toml
├── README.md
├── src/ebay_sniper/
│   ├── __init__.py
│   ├── cli.py           # click entrypoint
│   ├── config.py        # TOML + XDG paths
│   ├── db.py            # SQLite schema + queries
│   ├── ebay_client.py   # Playwright flows: login, fetch, bid
│   ├── notifier.py      # SMTP email
│   ├── scheduler.py     # planner + collision detection + runner
│   ├── time_sync.py     # eBay Date-header offset
│   └── url_parse.py     # eBay item URL → (host, item_id)
└── tests/
    ├── test_db.py
    ├── test_scheduler.py
    ├── test_time_sync.py
    └── test_url_parse.py
```

## Running the tests

```bash
pytest -q
```

The tests cover: URL parsing, time-offset math, the SQLite schema and CRUD, and the scheduler's planning / collision / retry logic. They don't touch the network or Playwright.

## Known limitations

- **ebay.com only.** Other locales (`ebay.co.uk`, `ebay.de`, …) are not supported in this version.
- **One bid flow at a time.** Auctions ending within each other's lead-time windows are skipped with a warning. If you regularly bid on simultaneously-ending items, that model will need to change.
- **Scraper brittleness.** eBay's HTML changes. Selectors in `ebay_client.py` are deliberately forgiving, but a UI refresh will require updating them.
- **Success detection is best-effort.** After clicking Confirm, the bot looks for eBay's "You're the high bidder" banner, but doesn't fail the snipe if the banner isn't found — some pages load it asynchronously or localize it. Check `ebay-sniper history` and eBay's "Bids/Offers" page to confirm.
- **No GUI, no web UI.** CLI only by design.

## Legal / safety notes

- Do not distribute this tool as a product.
- Do not run it against accounts you don't control.
- Respect eBay's rate limits — the bot does not spam their servers, but you shouldn't either.
- If eBay asks you to stop, stop.
