#!/usr/bin/env bash
set -euo pipefail
# Smoke E2E local sur device Android (adb). Pré-requis : app installée ET
# déjà connectée (cf. e2e/README.md). Ne désinstalle jamais (garde la session).
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

DEVICE="$(adb devices | awk 'NR>1 && $2=="device"{print $1; exit}')"
[ -z "${DEVICE:-}" ] && { echo "Aucun device adb connecté."; exit 1; }
echo "Device: $DEVICE"

# (Ré)installation optionnelle sans effacer les données (-r conserve la session)
if [ -n "${APK_PATH:-}" ]; then
  echo "Installation de $APK_PATH (données conservées)…"
  adb -s "$DEVICE" install -r "$APK_PATH"
fi

# Seed l'image de fixture pour le flow de share
adb -s "$DEVICE" shell mkdir -p /sdcard/Pictures/E2E >/dev/null 2>&1 || true
adb -s "$DEVICE" push "$ROOT/e2e/fixtures/sample.jpg" /sdcard/Pictures/E2E/sample.jpg
adb -s "$DEVICE" shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
  -d file:///sdcard/Pictures/E2E/sample.jpg >/dev/null

# Volets in-app + android cross-app ; le login manuel est exclu.
maestro test "$ROOT/e2e/maestro/flows" \
  --include-tags inapp,android \
  --exclude-tags login
