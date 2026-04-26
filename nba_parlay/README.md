# NBA Parlay — prediction model + elite parlay generator + daily email

A self-contained Python pipeline that turns the
[`shufinskiy/nba_data`](https://github.com/shufinskiy/nba_data) season archives
into a predictive model, prices it against live sportsbook lines, surfaces
the best **multi-leg parlays** by expected value, and emails the result every
morning.

Lives at `nba_parlay/` inside this repo (next to the existing Next.js app)
and runs independently — the daily report is shipped on a GitHub Actions cron.

---

## What it does

1. **Pull historical data.** `shufinskiy/nba_data` publishes per-season NBA
   datasets (box scores, play-by-play, shot detail, etc.) as compressed
   release assets. The downloader discovers them via the GitHub API,
   decompresses, and caches as parquet for fast re-loads.
2. **Engineer features.** Per-player rolling form (3/5/10 game means + EWM),
   opponent points-allowed, days-of-rest, back-to-back flag, home/away. All
   shifted by one game so a row's outcome never leaks into its own features.
3. **Train models.** For each prop target (`pts`, `reb`, `ast`, `fg3m`),
   LightGBM **quantile regressors** at five quantiles produce a full
   predictive distribution. A separate LightGBM regressor predicts each
   side's points and is composed into total / spread / moneyline probs via
   a normal residual model.
4. **Fetch today's slate + live odds.** NBA's public schedule endpoint plus
   [The Odds API](https://the-odds-api.com) — game markets in one call,
   player props per-event to keep quota usage minimal.
5. **Score every leg, pick the best parlays.** Edge = model_prob -
   implied_prob (devigged). Combinatorial search over 2..N leg parlays
   ranks by EV, with a same-game **correlation adjustment** so we don't
   pretend two correlated legs are independent. Output includes a
   fractional-Kelly stake suggestion.
6. **Email the report.** A clean Jinja-rendered HTML email (plus plaintext
   fallback) goes out to the configured recipients via SMTP.

---

## Quickstart

```bash
cd nba_parlay
python -m venv .venv && source .venv/bin/activate
pip install -e .

cp config.example.yaml config.yaml
cp .env.example .env   # then fill in THE_ODDS_API_KEY, SMTP_USER, SMTP_PASSWORD

# 1. Pull seasons listed in config.yaml
nba-parlay fetch

# 2. Train models (one-time / weekly)
nba-parlay train

# 3. Generate today's parlays + email the report
nba-parlay daily

# Print to stdout instead of emailing:
nba-parlay daily --dry-run
```

---

## Layout

```
nba_parlay/
├── pyproject.toml
├── requirements.txt
├── config.example.yaml      # all knobs documented inline
├── .env.example
├── Makefile
├── templates/daily_report.html.j2
├── src/nba_parlay/
│   ├── cli.py               # `nba-parlay {fetch,train,daily}`
│   ├── config.py            # pydantic config (YAML + env)
│   ├── data/
│   │   ├── downloader.py    # shufinskiy/nba_data fetcher (parquet cache)
│   │   ├── slate.py         # today's NBA games (cdn.nba.com)
│   │   └── odds.py          # The Odds API client + best-price reducer
│   ├── features.py          # rolling, rest, opp DvP, pace
│   ├── models/
│   │   ├── props.py         # quantile-regression prop model
│   │   ├── game.py          # team-points -> total/spread/ML
│   │   └── train.py         # training entrypoints
│   ├── parlay.py            # pricing, correlation, Kelly, optimizer
│   ├── report.py            # Jinja HTML render + SMTP send
│   └── pipeline.py          # daily end-to-end run
└── tests/                   # parlay math + feature leakage guards
```

Daily scheduler lives at `.github/workflows/nba-parlay-daily.yml`.

---

## Configuration

Two surfaces:

- **`config.yaml`** — non-secret behavior (seasons, edge thresholds,
  Kelly fraction, recipients, SMTP host).
- **Environment variables** — secrets (`THE_ODDS_API_KEY`, `SMTP_USER`,
  `SMTP_PASSWORD`).

Key knobs to tune to your taste:

| Setting | What it does |
|---|---|
| `parlay.edge_threshold` | Minimum model-vs-book probability gap a leg must clear (default 5pts) |
| `parlay.min_legs` / `max_legs` | Search range for parlay length (default 2..4) |
| `parlay.correlation_mode` | `penalize` (Gaussian-copula nudge), `block` (forbid same-game pairs), or `ignore` |
| `parlay.kelly_fraction` | Fractional Kelly for the suggested stake (default 0.25) |
| `models.prop_quantiles` | Which quantiles to fit for prop distributions |
| `data.train_seasons` | Historical seasons used to train (older seasons get exponentially less weight) |

---

## Daily automation

The bundled GitHub Action runs every day at **14:30 UTC** (configurable via
the cron expression). Add three repository secrets and you're done:

- `THE_ODDS_API_KEY`
- `SMTP_USER`
- `SMTP_PASSWORD`

Trained model artifacts and parquet caches are persisted between runs via
`actions/cache`, so most days the workflow only needs to fetch the new
games and the latest box scores.

For a self-hosted setup, replace the workflow with cron:

```cron
30 14 * * *  cd /opt/nba_parlay && /opt/nba_parlay/.venv/bin/nba-parlay daily >> /var/log/nba_parlay.log 2>&1
```

---

## Modeling notes

- **Why quantile regression for props?** Counts are skewed and zero-inflated
  (especially threes / assists for bench players). A point estimate +
  Gaussian assumption mis-prices the tails — exactly where the over/under
  contract pays. Fitting five quantiles and interpolating with PCHIP gives
  us a calibrated CDF directly.
- **Why a residual-noise model for game totals?** Predicting each team's
  points then summing keeps the same feature inputs feeding total / spread /
  ML, which guarantees internal consistency between the three derived
  markets — important when checking parlay correlations.
- **Correlation handling.** `parlay.py` carries a small calibrated table
  of pairwise rho values for common same-game leg-type pairs (e.g. `totals
  over` ↔ `player_points over` ≈ +0.20). The `penalize` mode multiplies
  the independent joint by a Gaussian-copula-style nudge bounded to `[0.1,
  3.0]` so the adjustment is meaningful but never explosive.
- **Edge filter + fractional Kelly.** Even with calibrated probabilities
  the model has finite-sample noise, so we (a) require a 5pt edge per leg
  before considering it, and (b) bet a fraction of full Kelly. Both knobs
  are configurable.

---

## Testing

```bash
make test
```

The suite covers:

- American↔decimal odds round-trip and devig math.
- Kelly stake = 0 when there's no edge; matches closed-form when there is.
- Joint probability with no correlation collapses to the independent
  product; positive same-game correlation strictly inflates it.
- Generator filters out no-edge legs and rejects redundant
  moneyline-plus-spread combos on the same team.
- Feature builders never leak future info (rolling means use a one-game
  shift; rest correctly flags back-to-backs).

---

## Disclaimer

Predictions are statistical estimates, not certainties. Sportsbooks set
sharp lines; even a well-calibrated model loses bets every day. Never stake
more than you can afford to lose. This codebase is for research and
entertainment. It does not constitute financial advice and is not legal in
all jurisdictions — verify your local laws before placing real bets.
