#!/usr/bin/env bash
set -euo pipefail
# Local E2E smoke on an Android device (adb). Prerequisite: app installed AND
# already logged in (see e2e/README.md). Never uninstalls (keeps the session).
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

DEVICE="$(adb devices | awk 'NR>1 && $2=="device"{print $1; exit}')"
[ -z "${DEVICE:-}" ] && { echo "No adb device connected."; exit 1; }
echo "Device: $DEVICE"

# Optional (re)install without wiping data (-r keeps the session)
if [ -n "${APK_PATH:-}" ]; then
  echo "Installing $APK_PATH (data preserved)…"
  adb -s "$DEVICE" install -r "$APK_PATH"
fi

# Seed the fixture image for the share flow
adb -s "$DEVICE" shell mkdir -p /sdcard/Pictures/E2E >/dev/null 2>&1 || true
adb -s "$DEVICE" push "$ROOT/e2e/fixtures/sample.jpg" /sdcard/Pictures/E2E/sample.jpg
adb -s "$DEVICE" shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
  -d file:///sdcard/Pictures/E2E/sample.jpg >/dev/null

# In-app + android cross-app suites; the manual login is excluded.
maestro --platform android test "$ROOT/e2e/maestro/flows" \
  --include-tags inapp,android \
  --exclude-tags login
