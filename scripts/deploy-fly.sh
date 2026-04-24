#!/usr/bin/env bash
# One-shot first-time deploy to Fly.io. Idempotent — safe to re-run.
#
# Prereqs:
#   brew install flyctl
#   fly auth signup    (or fly auth login)
#
# What it does:
#   1. Creates the app if it doesn't exist
#   2. Provisions a hobby-tier Postgres if one isn't attached
#   3. Sets your Keel API key + provider keys as fly secrets
#   4. Applies the schema in docker/initdb/01-schema.sql
#   5. Deploys
#   6. Prints the live URL
#
# Edit the variables below before running.

set -euo pipefail

# --- Configure ---
APP_NAME="${KEEL_APP_NAME:-keel}"
PG_NAME="${KEEL_PG_NAME:-${APP_NAME}-pg}"
REGION="${KEEL_REGION:-iad}"

require() {
  if [ -z "${!1:-}" ]; then
    echo "ERROR: env var $1 must be set."
    echo "  export $1=..."
    exit 2
  fi
}

# Required secrets (must be exported before invoking this script).
require KEEL_API_KEYS
# At least one of these must be set.
if [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "ERROR: set ANTHROPIC_API_KEY and/or OPENAI_API_KEY before deploying."
  exit 2
fi

command -v fly >/dev/null || { echo "fly CLI not found. brew install flyctl"; exit 2; }

echo "=> deploying $APP_NAME to region $REGION"

# 1. Create app if missing.
if ! fly status --app "$APP_NAME" >/dev/null 2>&1; then
  echo "-- creating app $APP_NAME"
  fly apps create --name "$APP_NAME"
fi

# 2. Postgres.
if ! fly postgres list 2>/dev/null | grep -q "$PG_NAME"; then
  echo "-- creating Postgres $PG_NAME (this asks ~5 questions; pick the cheapest options)"
  fly postgres create --name "$PG_NAME" --region "$REGION"
fi

if ! fly secrets list --app "$APP_NAME" 2>/dev/null | grep -q DATABASE_URL; then
  echo "-- attaching Postgres to $APP_NAME"
  fly postgres attach --app "$APP_NAME" "$PG_NAME"
fi

# 3. Secrets.
echo "-- setting secrets"
SECRETS=("KEEL_API_KEYS=$KEEL_API_KEYS")
[ -n "${ANTHROPIC_API_KEY:-}" ] && SECRETS+=("ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY")
[ -n "${OPENAI_API_KEY:-}" ] && SECRETS+=("OPENAI_API_KEY=$OPENAI_API_KEY")
[ -n "${SHADOW_CANDIDATES:-}" ] && SECRETS+=("SHADOW_CANDIDATES=$SHADOW_CANDIDATES")
[ -n "${ROUTING_OVERRIDES:-}" ] && SECRETS+=("ROUTING_OVERRIDES=$ROUTING_OVERRIDES")
fly secrets set --app "$APP_NAME" "${SECRETS[@]}" >/dev/null

# 4. Apply schema. Fly Postgres exposes a Postgres URI we can reach by proxy.
echo "-- applying schema (you'll see one 'connected' line, then it returns)"
fly proxy 5433:5432 --app "$PG_NAME" >/dev/null &
PROXY_PID=$!
trap 'kill $PROXY_PID 2>/dev/null || true' EXIT
sleep 4

PG_URI=$(fly secrets list --app "$APP_NAME" 2>/dev/null | awk '/DATABASE_URL/ {print $2}')
# The fly-emitted URL points at the internal flycast hostname; we proxied
# the same Postgres locally. Rewrite the host portion.
LOCAL_URI=$(echo "$PG_URI" | sed -E 's#@[^:]+:[0-9]+/#@127.0.0.1:5433/#')
PSQL_BIN=$(command -v psql || true)
if [ -n "$PSQL_BIN" ]; then
  "$PSQL_BIN" "$LOCAL_URI" -f docker/initdb/01-schema.sql || true
else
  echo "   psql not on PATH — install with: brew install libpq && brew link --force libpq"
  echo "   then re-run this script. Skipping schema apply for now."
fi

kill $PROXY_PID 2>/dev/null || true
trap - EXIT

# 5. Deploy.
echo "-- fly deploy"
fly deploy --app "$APP_NAME"

# 6. Show the URL.
echo
echo "=> done. Endpoints:"
echo "   landing:    https://$APP_NAME.fly.dev/"
echo "   health:     https://$APP_NAME.fly.dev/health"
echo "   dashboard:  https://$APP_NAME.fly.dev/dashboard/"
echo "   metrics:    https://$APP_NAME.fly.dev/metrics"
echo
echo "Smoke-test:"
echo "   curl -s -X POST https://$APP_NAME.fly.dev/v1/chat/completions \\"
echo "     -H 'Authorization: Bearer \$KEEL_API_KEY' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"model\":\"gpt-4o-mini\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"temperature\":0}'"
