# Quickstart

Get Keel running against your own API keys in under 5 minutes.

## Prerequisites

- Node.js 20.11+
- Docker + Docker Compose (for Postgres with pgvector)
- An Anthropic and/or OpenAI API key

## 1. Clone & install

```bash
git clone https://github.com/rke6693/build-space-.git keel
cd keel
npm install
```

## 2. Configure

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# Required at minimum: a gateway API key and at least one upstream provider.
KEEL_API_KEYS=kl_dev_$(openssl rand -hex 16)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
DATABASE_URL=postgres://keel:keel@localhost:5432/keel
```

For semantic caching, keep `EMBEDDING_PROVIDER=openai` (default) and ensure
`OPENAI_API_KEY` is set. To run without semantic caching, set
`EMBEDDING_PROVIDER=off`.

## 3. Start Postgres (with pgvector)

```bash
docker compose -f docker/docker-compose.yml up postgres -d
# Schema applies from docker/initdb/01-schema.sql automatically.
```

Or against an existing Postgres:

```bash
DATABASE_URL=... npm run db:migrate
```

## 4. Run the gateway

Dev:

```bash
npm run dev
```

Docker (prod-ish):

```bash
docker compose -f docker/docker-compose.yml up --build
```

You should see:

```
keel listening  port=8787 providers=[anthropic,openai] postgres=true shadow=false cache=postgres
```

## 5. Call it

```bash
export KEEL_API_KEY=kl_dev_...   # the value you set in step 2

curl -s http://localhost:8787/v1/chat/completions \
  -H "Authorization: Bearer $KEEL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role":"user","content":"Hello, Keel."}]
  }' | jq
```

Every response includes a `keel` block so you can see what happened:

```json
{
  "id": "chatcmpl-...",
  "choices": [...],
  "keel": {
    "request_id": "...",
    "cache_status": "miss",
    "routing_rule": "default",
    "cost_usd": 0.000142
  }
}
```

Repeat the call — `cache_status` becomes `"exact"` and the response is free.
Ask a slightly different phrasing — `cache_status` becomes `"semantic"` if
cosine similarity crosses `SEMANTIC_CACHE_THRESHOLD` (default 0.93).

## 6. Turn on shadow-eval routing

Pick a primary → candidate model pair in `.env`:

```bash
SHADOW_SAMPLE_PERCENT=10
SHADOW_CANDIDATES={"claude-sonnet-4-6":"claude-haiku-4-5","gpt-4o":"gpt-4o-mini"}
SHADOW_JUDGE_MODEL=claude-haiku-4-5
```

Restart. Now ~10% of eligible requests also get a parallel call to the
candidate, and a judge scores them. Read the rolling stats any time:

```bash
curl -s http://localhost:8787/v1/stats -H "Authorization: Bearer $KEEL_API_KEY" | jq
```

When a `(primary, candidate)` pair has a high-enough mean score over enough
samples, promote the candidate in `ROUTING_OVERRIDES`:

```bash
ROUTING_OVERRIDES={"claude-sonnet-4-6":"claude-haiku-4-5"}
```

## Drop-in as OpenAI base URL

Most SDKs accept a custom base URL:

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8787/v1",
    api_key=os.environ["KEEL_API_KEY"],
)
```

```ts
import OpenAI from 'openai';
const client = new OpenAI({
  baseURL: 'http://localhost:8787/v1',
  apiKey: process.env.KEEL_API_KEY,
});
```

## Endpoints at a glance

| Method | Path | Notes |
|---|---|---|
| `POST` | `/v1/chat/completions` | OpenAI-compatible. |
| `POST` | `/v1/messages` | Anthropic-compatible. |
| `GET`  | `/v1/stats` | Cache hit rate, spend, shadow pair scores. |
| `GET`  | `/health` | Liveness. |
| `GET`  | `/health/ready` | Readiness (checks Postgres). |
| `GET`  | `/` | Landing page (can disable with `serveLanding: false`). |

## Troubleshooting

- **`no configured provider supports model '...'`** — you asked for a model prefix (e.g. `gpt-`) but didn't set the matching provider key.
- **Empty `shadow` in `/v1/stats`** — either sampling is 0%, or no `(primary, candidate)` pairs are configured in `SHADOW_CANDIDATES`.
- **`cache_status` always `miss`** — check `temperature` (>0.15 disables caching by design) and `stream` (true also disables caching).

See [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) for the design rationale.
