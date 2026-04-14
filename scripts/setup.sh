#!/usr/bin/env bash
# One-shot setup for Mac mini (Apple silicon).
# Safe to re-run.

set -euo pipefail

cd "$(dirname "$0")/.."

# ---------- 1. Python ----------
if ! command -v python3.11 >/dev/null 2>&1 && ! command -v python3.12 >/dev/null 2>&1; then
    echo ">>> Installing Python via Homebrew"
    if ! command -v brew >/dev/null 2>&1; then
        echo "Install Homebrew first: https://brew.sh"; exit 1
    fi
    brew install python@3.12
fi

PY="$(command -v python3.12 || command -v python3.11)"
echo ">>> Using Python: $PY"

# ---------- 2. Virtualenv ----------
if [ ! -d .venv ]; then
    echo ">>> Creating .venv"
    "$PY" -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate
python -m pip install --upgrade pip wheel
pip install -r requirements.txt

# ---------- 3. Dotenv ----------
if [ ! -f .env ]; then
    echo ">>> Creating .env from template"
    cp .env.example .env
    echo "    Edit .env before starting the bot."
fi

# ---------- 4. State dir ----------
mkdir -p state/logs

# ---------- 5. launchd plist ----------
PLIST_SRC="scripts/com.polybot.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.polybot.plist"
ABS_PATH="$(pwd)"
USER_NAME="$(whoami)"

if [ ! -f "$PLIST_DST" ]; then
    echo ">>> Installing launchd plist"
    sed "s|/REPLACE_PATH|$ABS_PATH|g; s|REPLACE_USER|$USER_NAME|g" \
        "$PLIST_SRC" > "$PLIST_DST"
    echo "    Plist installed at $PLIST_DST"
    echo "    Start with:"
    echo "      launchctl bootstrap gui/\$(id -u) $PLIST_DST"
    echo "      launchctl enable   gui/\$(id -u)/com.polybot"
    echo "      launchctl kickstart -k gui/\$(id -u)/com.polybot"
fi

echo ">>> Setup complete. Next steps:"
echo "    1. Edit .env (POLYMARKET_PRIVATE_KEY, POLYMARKET_PROXY_ADDRESS,"
echo "       ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)"
echo "    2. Test manually: source .venv/bin/activate && python main.py"
echo "    3. When happy: launchctl bootstrap as shown above"
