#!/bin/bash
# Setup cron job for daily newsletter generation at 5am UTC
#
# Usage: bash setup_cron.sh
#
# This adds a crontab entry that runs the newsletter pipeline daily.
# Logs go to ~/newsletter/cron.log

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PYTHON="$(which python3)"
LOG_FILE="$HOME/newsletter/cron.log"

mkdir -p "$HOME/newsletter"

CRON_CMD="0 5 * * * cd ${SCRIPT_DIR} && ${PYTHON} run_newsletter.py generate >> ${LOG_FILE} 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "run_newsletter.py"; then
    echo "Cron job already exists. Current crontab:"
    crontab -l | grep "run_newsletter"
    echo ""
    read -p "Replace existing cron job? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        crontab -l 2>/dev/null | grep -v "run_newsletter.py" | crontab -
    else
        echo "Keeping existing cron job."
        exit 0
    fi
fi

# Add cron job
(crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -

echo "Cron job installed:"
echo "  ${CRON_CMD}"
echo ""
echo "Newsletter will run daily at 5:00 AM UTC."
echo "Logs: ${LOG_FILE}"
echo ""
echo "To verify: crontab -l"
echo "To remove: crontab -l | grep -v run_newsletter | crontab -"
