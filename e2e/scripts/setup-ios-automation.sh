#!/usr/bin/env bash
set -euo pipefail
# Installs the tooling to drive the app automatically on the iOS simulator
# (Maestro). Useful for E2E runs AND for perf iteration without manual reload/nav.
# Idempotent: whatever is already present is left as-is.
#
# After this script:
#   npm run ios                       # build + install + launch on the simulator
#   ./e2e/scripts/maestro.sh test ... # drives the app (the wrapper injects JDK 17)
#
# See e2e/maestro/README.md for the full workflow.

info()  { printf '\033[36m›\033[0m %s\n' "$*"; }
ok()    { printf '\033[32m✓\033[0m %s\n' "$*"; }
warn()  { printf '\033[33m!\033[0m %s\n' "$*"; }
die()   { printf '\033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(uname)" = "Darwin" ] || die "macOS required (iOS simulator)."

# --- Xcode / simulators ----------------------------------------------------
command -v xcrun >/dev/null 2>&1 || die "Xcode command line tools missing: xcode-select --install"
xcrun simctl help >/dev/null 2>&1 || die "simctl unavailable: install Xcode from the App Store."
ok "Xcode / simulators available"

# --- Homebrew --------------------------------------------------------------
command -v brew >/dev/null 2>&1 || die "Homebrew required: https://brew.sh"

# --- JDK 17 (Maestro requires it; the system Java is often 11) --------------
JDK17_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null || true)"
if [ -z "$JDK17_HOME" ] && [ -x /opt/homebrew/opt/openjdk@17/bin/java ]; then
  JDK17_HOME=/opt/homebrew/opt/openjdk@17
fi
if [ -z "$JDK17_HOME" ]; then
  info "Installing OpenJDK 17 (Homebrew)…"
  brew install openjdk@17
  JDK17_HOME=/opt/homebrew/opt/openjdk@17
fi
ok "JDK 17: $JDK17_HOME"

# --- Maestro ---------------------------------------------------------------
if [ -x "$HOME/.maestro/bin/maestro" ]; then
  ok "Maestro already installed ($HOME/.maestro/bin)"
else
  info "Installing Maestro…"
  curl -Ls "https://get.maestro.mobile.dev" | bash
  [ -x "$HOME/.maestro/bin/maestro" ] || die "Maestro installation failed."
  ok "Maestro installed"
fi

# --- Verification ----------------------------------------------------------
if JAVA_HOME="$JDK17_HOME" PATH="$JDK17_HOME/bin:$HOME/.maestro/bin:$PATH" \
     MAESTRO_CLI_NO_ANALYTICS=1 maestro --version >/dev/null 2>&1; then
  VER="$(JAVA_HOME="$JDK17_HOME" PATH="$JDK17_HOME/bin:$HOME/.maestro/bin:$PATH" \
         MAESTRO_CLI_NO_ANALYTICS=1 maestro --version 2>/dev/null | tail -1)"
  ok "Maestro operational (JDK 17) — version ${VER:-?}"
else
  die "Maestro does not start with JDK 17. Check $JDK17_HOME."
fi

cat <<EOF

$(ok "Tooling ready.")
Run the flows through the wrapper (it injects JDK 17):
    ./e2e/scripts/maestro.sh test e2e/maestro/flows
For a global Maestro in your shell, add to your profile:
    export JAVA_HOME="$JDK17_HOME"
    export PATH="\$JAVA_HOME/bin:\$HOME/.maestro/bin:\$PATH"
EOF
