#!/usr/bin/env bash
set -euo pipefail

# One-time (or on-rotation): push the signing/distribution secrets to the
# twake-drive-mobile GitHub repo. GitHub Actions secrets are WRITE-ONLY — this
# script is the only way to (re)set them, and it is how you replicate the ones
# shared with visio-mobile (same Apple team + match repo + Firebase/Play).
#
# VALUES never live in git: you provide them in a local, gitignored
# .release-secrets.env (copy .release-secrets.env.example and fill it in).
# This script reads that file and calls `gh secret set` for each — so the
# values pass straight from your machine to GitHub, never through anyone else.
#
# Usage: scripts/setup-release-secrets.sh [repo]
#   repo defaults to mmaudet/twake-drive-mobile.

REPO="${1:-mmaudet/twake-drive-mobile}"
ROOT="$(git rev-parse --show-toplevel)"
ENV_FILE="$ROOT/.release-secrets.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy .release-secrets.env.example and fill it in." >&2
  exit 1
fi
command -v gh >/dev/null || { echo "GitHub CLI (gh) not found." >&2; exit 1; }

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

echo "Setting secrets on $REPO …"

set_secret() {
  local name="$1" value="${2:-}"
  if [[ -z "$value" ]]; then echo "  · skip $name (not provided)"; return; fi
  printf '%s' "$value" | gh secret set "$name" --repo "$REPO"
  echo "  ✓ $name"
}

# --- File-sourced secrets (base64 / raw contents) ---
[[ -n "${ANDROID_KEYSTORE_FILE:-}" ]]        && set_secret ANDROID_KEYSTORE_BASE64          "$(base64 < "$ANDROID_KEYSTORE_FILE" | tr -d '\n')"
[[ -n "${GCP_SERVICE_ACCOUNT_FILE:-}" ]]     && set_secret FIREBASE_SERVICE_ACCOUNT_BASE64  "$(base64 < "$GCP_SERVICE_ACCOUNT_FILE" | tr -d '\n')"
[[ -n "${APP_STORE_CONNECT_API_KEY_FILE:-}" ]] && set_secret APP_STORE_CONNECT_API_KEY_CONTENT "$(base64 < "$APP_STORE_CONNECT_API_KEY_FILE" | tr -d '\n')"
[[ -n "${MATCH_DEPLOY_KEY_FILE:-}" ]]        && set_secret MATCH_DEPLOY_KEY                 "$(cat "$MATCH_DEPLOY_KEY_FILE")"

# --- Direct-value secrets ---
set_secret ANDROID_KEYSTORE_PASSWORD          "${ANDROID_KEYSTORE_PASSWORD:-}"
set_secret ANDROID_KEY_ALIAS                  "${ANDROID_KEY_ALIAS:-}"
set_secret ANDROID_KEY_PASSWORD               "${ANDROID_KEY_PASSWORD:-}"
set_secret FIREBASE_APP_ID                    "${FIREBASE_APP_ID:-}"
set_secret APPLE_TEAM_ID                      "${APPLE_TEAM_ID:-}"
set_secret APP_STORE_CONNECT_API_KEY_ID       "${APP_STORE_CONNECT_API_KEY_ID:-}"
set_secret APP_STORE_CONNECT_ISSUER_ID        "${APP_STORE_CONNECT_ISSUER_ID:-}"
# Allow the ASC key + match deploy key as direct values too (if not file-sourced above).
[[ -z "${APP_STORE_CONNECT_API_KEY_FILE:-}" ]] && set_secret APP_STORE_CONNECT_API_KEY_CONTENT "${APP_STORE_CONNECT_API_KEY_CONTENT:-}"
set_secret MATCH_GIT_URL                      "${MATCH_GIT_URL:-}"
set_secret MATCH_PASSWORD                     "${MATCH_PASSWORD:-}"
[[ -z "${MATCH_DEPLOY_KEY_FILE:-}" ]]         && set_secret MATCH_DEPLOY_KEY                 "${MATCH_DEPLOY_KEY:-}"

echo "Done. Verify names with:  gh secret list --repo $REPO"
