#!/usr/bin/env bash
set -euo pipefail
# Smoke E2E local sur simulateur iOS (in-app uniquement : pas d'extension
# File Provider / Share native). Pré-requis : app installée ET connectée.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SIM="${SIMULATOR:-booted}"

xcrun simctl bootstatus "$SIM" -b >/dev/null 2>&1 || xcrun simctl boot "$SIM" || true

if [ -n "${APP_PATH:-}" ]; then
  echo "Installation de $APP_PATH sur le simulateur…"
  xcrun simctl install "$SIM" "$APP_PATH"
fi

# On iOS, XCUITest exposes a row's menu button under three ids
# (folder-actions:<name>, -container, -container-outer-layer); the bare id is
# ambiguous, so target the outer layer. Android's resource-id is unique (suffix
# stays empty). Flows read ${MENU_SUFFIX} for the folder-actions selector.
maestro --platform ios test "$ROOT/e2e/maestro/flows" \
  --include-tags inapp \
  --exclude-tags login \
  -e MENU_SUFFIX=-container-outer-layer
