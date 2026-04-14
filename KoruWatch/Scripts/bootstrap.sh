#!/usr/bin/env bash
# ============================================================================
# Koru — one-shot bootstrap
# ============================================================================
#
# Generates Koru.xcodeproj from project.yml. Run once, then open Koru.xcodeproj.
# Requires: macOS 14+, Xcode 16+, brew install xcodegen
#
# Usage:   ./Scripts/bootstrap.sh
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "==> xcodegen not found. Install with:  brew install xcodegen"
  exit 1
fi

echo "==> Regenerating Koru.xcodeproj from project.yml"
xcodegen generate --spec project.yml

echo ""
echo "==> Done. Open Koru.xcodeproj in Xcode, set your team under Signing &"
echo "    Capabilities on both the Koru and KoruWidgets targets, and run on"
echo "    an Apple Watch Ultra 2 or Series 9 simulator/device."
echo ""
