# Whatnot $1 Auction Sniper

A personal-use auction sniper for [Whatnot](https://www.whatnot.com) live
streams. Watches multiple streams in parallel in real Chromium, automatically
discovers new live streams from Whatnot's listings page, detects auctions
that started at $1 (or any price you configure), and fires a bid in the
last fraction of a second before the lot closes.

> **You are responsible for how you use this.** Whatnot's ToS may restrict
> automation. Use it on your own account, for personal sniping, and respect
> the platform. Start in **dry-run mode** — it's the default.

## Highlights

- **Multi-stream surveillance.** A pool of N watchers (default 5) each
  drives its own browser tab on a different livestream, so you have many
  chances at $1 lots simultaneously.
- **Automatic stream discovery.** A dedicated tab scrapes Whatnot's live
  listings every 30 s, filters by optional title keywords, and tops up
  the watcher pool with new streams as old ones end.
- **Tight snipe loop.** Each watcher polls its auction card every ~120 ms
  and fires inside a configurable last-second window
  (`snipe_window_close ≤ t ≤ snipe_window_open`).
- **Self-healing pool.** Watchers self-terminate when their stream goes
  idle; the coordinator reaps them and replaces them from the candidate
  list.
- **Safe by default.** `dry_run: true` is on out of the box. `--live` is
  required to actually click. Hard `max_bid` ceiling is checked before
  every click.
- **All selectors live in YAML.** When Whatnot reshuffles its DOM, fix it
  in 30 seconds without touching Python.

## Architecture

```
sniper/
├── parsing.py       # money / time-string parsers (pure)
├── config.py        # YAML loading + dataclasses
├── dom.py           # AuctionSnapshot + read_auction(page)
├── strategy.py      # decide(snap, cfg) -> SnipeDecision (pure)
├── discovery.py     # discover_streams() + filter_candidates()
├── watcher.py       # StreamWatcher: one tab, one tight poll loop
├── coordinator.py   # Pool of watchers + discovery rebalancing
├── log.py           # Rich-console logging helpers
├── cli.py           # argparse + signal wiring
└── __main__.py      # `python -m sniper`
```

The pure layers (`parsing`, `strategy`, `discovery`'s `filter_candidates`)
are unit-tested. Playwright-touching layers are kept thin so the bulk of
the logic stays testable without a browser.

## Setup

```bash
cd sniper
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
cp config.example.yaml config.yaml
```

Edit `config.yaml`. The interesting bits:

- `max_start_price` — max start price for "$1 auctions" you care about.
- `max_bid` — hard ceiling. The bot will never bid above this, ever.
- `discovery.max_streams` — how many tabs the bot may open in parallel.
- `discovery.listing_urls` — which Whatnot pages to scrape for live
  streams. Add category pages here to bias discovery toward what you
  collect.
- `discovery.title_keywords` — optional substring filter on stream
  titles. Empty = match all live streams.

## First run (dry-run, always)

```bash
python -m sniper
```

A Chromium window opens at whatnot.com. If you're not logged in, log in.
Switch back to the terminal and press Enter. The bot:

1. Spawns watchers for any `streams:` you've pinned in config.
2. Scrapes the live listings every `refresh_interval_seconds` and tops
   up the watcher pool with new streams (up to `max_streams`).
3. Each watcher reads its auction card on a tight loop and prints every
   decision it would make. **No bids are placed.**
4. A summary line prints every ~10 s:
   `=== 5 active | snapshots=812 $lots=37 snipes=4 clicked=0 ===`

## Going live

When you're confident the selectors are correct and the strategy is
firing on the right lots, run with `--live`:

```bash
python -m sniper --live
```

## CLI

```
python -m sniper [options]

  --config PATH         Config file (default: config.yaml)
  --stream URL          Pin a stream URL. May be passed multiple times.
  --no-discovery        Disable automatic stream discovery for this run.
  --max-streams N       Override discovery.max_streams for this run.
  --keyword WORD        Title keyword filter (case-insensitive). Repeatable.
  --live                Disable dry-run. DANGEROUS.
```

Examples:

```bash
# Watch only manually pinned streams; no discovery.
python -m sniper --no-discovery \
  --stream https://www.whatnot.com/live/abc \
  --stream https://www.whatnot.com/live/def

# Discover streams but only ones whose title mentions Pokemon or TCG,
# capped at 3 parallel tabs, real bids on.
python -m sniper --keyword pokemon --keyword tcg --max-streams 3 --live
```

## When selectors break

Whatnot changes its markup. If the bot stops finding auction cards or
stops finding streams:

1. Open devtools in the Chromium window the bot launched.
2. Inspect the auction card / current-bid text / timer / bid button,
   or the live-listing card if discovery is broken.
3. Update the matching key in `selectors:` in `config.yaml`. Every
   selector the bot uses lives there — nothing is hard-coded.

## Tests

Pure-logic tests run without a browser:

```bash
python -m unittest discover tests
```

Coverage:

| module     | what's tested                                     |
|------------|---------------------------------------------------|
| `parsing`  | money + time string parsers, ended tokens         |
| `strategy` | every snipe decision branch                       |
| `discovery`| keyword filter, blocklist, dedupe, slug, normalize|

## Safety knobs

- `dry_run: true` — default, never clicks.
- `max_bid` — hard ceiling, checked before every click.
- `snipe_window_close` — guards against clicking after the lot closed.
- Per-lot fingerprinting — won't fire twice on the same lot.
- `discovery.idle_timeout_seconds` — dead streams are reaped.
- Per-watcher exception isolation — a crashing tab is logged and
  replaced, the rest of the pool keeps running.
