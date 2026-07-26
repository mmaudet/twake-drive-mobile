#!/usr/bin/env bash
set -euo pipefail
# Wrapper Maestro : injecte le JDK 17 (Maestro l'exige, le Java système est
# souvent en 11) et met ~/.maestro/bin dans le PATH. Passe tous les arguments
# à la CLI Maestro.
#   ./e2e/scripts/maestro.sh test e2e/maestro/flows
#   ./e2e/scripts/maestro.sh hierarchy
# Pré-requis : ./e2e/scripts/setup-ios-automation.sh

JDK17_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null || true)"
[ -z "$JDK17_HOME" ] && [ -x /opt/homebrew/opt/openjdk@17/bin/java ] && JDK17_HOME=/opt/homebrew/opt/openjdk@17
[ -n "$JDK17_HOME" ] || { echo "JDK 17 introuvable. Lance ./e2e/scripts/setup-ios-automation.sh" >&2; exit 1; }
[ -x "$HOME/.maestro/bin/maestro" ] || { echo "Maestro introuvable. Lance ./e2e/scripts/setup-ios-automation.sh" >&2; exit 1; }

export JAVA_HOME="$JDK17_HOME"
export PATH="$JAVA_HOME/bin:$HOME/.maestro/bin:$PATH"
export MAESTRO_CLI_NO_ANALYTICS="${MAESTRO_CLI_NO_ANALYTICS:-1}"
exec maestro "$@"
