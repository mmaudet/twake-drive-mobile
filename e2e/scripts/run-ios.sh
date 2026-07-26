#!/usr/bin/env bash
set -euo pipefail
# Local E2E smoke on the iOS simulator (in-app only: no native File Provider /
# Share extension). Prerequisite: app installed AND logged in.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SIM="${SIMULATOR:-booted}"

xcrun simctl bootstatus "$SIM" -b >/dev/null 2>&1 || xcrun simctl boot "$SIM" || true

if [ -n "${APP_PATH:-}" ]; then
  echo "Installing $APP_PATH on the simulator…"
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
