#!/bin/bash
# Setup cron jobs for daily newsletter generation and resolution checking
#
# Usage: bash setup_cron.sh
#
# This adds crontab entries that:
# 1. Run the newsletter pipeline daily at 5am UTC
# 2. Check market resolutions every 6 hours
# Logs go to ~/newsletter/cron.log

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PYTHON="$(which python3)"
LOG_FILE="$HOME/newsletter/cron.log"

mkdir -p "$HOME/newsletter"

NEWSLETTER_CRON="0 5 * * * cd ${SCRIPT_DIR} && ${PYTHON} run_newsletter.py generate >> ${LOG_FILE} 2>&1"
RESOLVE_CRON="0 */6 * * * cd ${SCRIPT_DIR} && ${PYTHON} run_newsletter.py resolve >> ${LOG_FILE} 2>&1"

# Check if cron jobs already exist
if crontab -l 2>/dev/null | grep -q "run_newsletter.py"; then
    echo "Existing cron jobs found:"
    crontab -l | grep "run_newsletter"
    echo ""
    read -p "Replace existing cron jobs? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        crontab -l 2>/dev/null | grep -v "run_newsletter.py" | crontab -
    else
        echo "Keeping existing cron jobs."
        exit 0
    fi
fi

# Add cron jobs
(crontab -l 2>/dev/null; echo "$NEWSLETTER_CRON"; echo "$RESOLVE_CRON") | crontab -

echo "Cron jobs installed:"
echo ""
echo "  Newsletter (daily 5am UTC):"
echo "    ${NEWSLETTER_CRON}"
echo ""
echo "  Resolution checker (every 6 hours):"
echo "    ${RESOLVE_CRON}"
echo ""
echo "Logs: ${LOG_FILE}"
echo ""
echo "To verify: crontab -l"
echo "To remove: crontab -l | grep -v run_newsletter | crontab -"
