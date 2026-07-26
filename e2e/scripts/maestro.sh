#!/usr/bin/env bash
set -euo pipefail
# Maestro wrapper: injects JDK 17 (Maestro requires it, the system Java is
# often 11) and puts ~/.maestro/bin on the PATH. Passes all arguments through
# to the Maestro CLI.
#   ./e2e/scripts/maestro.sh test e2e/maestro/flows
#   ./e2e/scripts/maestro.sh hierarchy
# Prerequisite: ./e2e/scripts/setup-ios-automation.sh

JDK17_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null || true)"
[ -z "$JDK17_HOME" ] && [ -x /opt/homebrew/opt/openjdk@17/bin/java ] && JDK17_HOME=/opt/homebrew/opt/openjdk@17
[ -n "$JDK17_HOME" ] || { echo "JDK 17 not found. Run ./e2e/scripts/setup-ios-automation.sh" >&2; exit 1; }
[ -x "$HOME/.maestro/bin/maestro" ] || { echo "Maestro not found. Run ./e2e/scripts/setup-ios-automation.sh" >&2; exit 1; }

export JAVA_HOME="$JDK17_HOME"
export PATH="$JAVA_HOME/bin:$HOME/.maestro/bin:$PATH"
export MAESTRO_CLI_NO_ANALYTICS="${MAESTRO_CLI_NO_ANALYTICS:-1}"
exec maestro "$@"
