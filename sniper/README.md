# Whatnot $1 Auction Sniper

A personal-use auction sniper for [Whatnot](https://www.whatnot.com) live
streams. Watches a livestream in a real browser, detects auctions that
started at $1 (or any price you configure), and fires a bid in the last
fraction of a second before the lot closes.

> **You are responsible for how you use this.** Whatnot's ToS may restrict
> automation. Use it on your own account, for personal sniping, and respect
> the platform. Start in **dry-run mode** — it's the default.

## How it works

Whatnot has no public bidding API, so the bot drives a real Chromium session
via [Playwright](https://playwright.dev). It uses a persistent browser
profile, so you log in once and every subsequent run reuses the session.

Each loop iteration:

1. Reads the live auction card from the DOM (`auction_root` selector).
2. Parses current bid, start price, and time remaining.
3. Asks the strategy layer whether to bid. A bid only fires when:
   - the lot started at ≤ `max_start_price`,
   - the next legal bid is ≤ `max_bid`,
   - the clock is inside the snipe window
     (`snipe_window_close` ≤ t ≤ `snipe_window_open`).
4. If all criteria pass, clicks the bid button (and the confirm button if
   one appears).

The poll cadence is ~120 ms by default, which is plenty to catch a 1-second
snipe window without hammering the page.

## Setup

```bash
cd sniper
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
cp config.example.yaml config.yaml
```

Edit `config.yaml` — at minimum set a `streams:` URL.

## First run (dry-run, always)

```bash
python sniper.py --stream https://www.whatnot.com/live/<id>
```

A Chromium window opens. If you're not logged in, log in. Then switch back
to the terminal and press Enter. The bot starts watching and prints every
decision it would make. **No bids are placed.**

## Going live

When you're confident the selectors are correct and the strategy is firing
on the right lots, run with `--live`:

```bash
python sniper.py --stream https://www.whatnot.com/live/<id> --live
```

## When selectors break

Whatnot changes its markup. If the bot stops finding auction cards:

1. Open devtools in the Chromium window the bot launched.
2. Inspect the auction card, current-bid text, timer, and bid button.
3. Update the `selectors:` block in `config.yaml`. The file lists every
   selector the bot uses; nothing is hard-coded.

## Tests

Pure-logic tests (parsing + strategy) run without a browser:

```bash
python -m unittest sniper.tests.test_parsing
```

## Files

| file                  | purpose                                            |
|-----------------------|----------------------------------------------------|
| `sniper.py`           | All the bot logic, in one auditable file          |
| `config.example.yaml` | Annotated config template                         |
| `tests/test_parsing.py` | Unit tests for money/time parsing + strategy    |
| `requirements.txt`    | Runtime deps                                       |

## Safety knobs

- `dry_run: true` — default, never clicks.
- `max_bid` — hard ceiling, checked before every click.
- `snipe_window_close` — guards against clicking after the lot closed.
- Per-lot fingerprinting — won't fire twice on the same lot in a row.
