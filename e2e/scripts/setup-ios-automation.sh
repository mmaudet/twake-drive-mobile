#!/usr/bin/env bash
set -euo pipefail
# Installe l'outillage pour piloter l'app automatiquement sur le simulateur iOS
# (Maestro). Utile pour les runs E2E ET pour l'itération perf sans reload/nav
# manuel. Idempotent : ce qui est déjà présent est laissé tel quel.
#
# Après ce script :
#   npm run ios                       # build + install + lance sur le simulateur
#   ./e2e/scripts/maestro.sh test ... # pilote l'app (le wrapper injecte le JDK 17)
#
# Voir e2e/maestro/README.md pour le workflow complet.

info()  { printf '\033[36m›\033[0m %s\n' "$*"; }
ok()    { printf '\033[32m✓\033[0m %s\n' "$*"; }
warn()  { printf '\033[33m!\033[0m %s\n' "$*"; }
die()   { printf '\033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(uname)" = "Darwin" ] || die "macOS requis (simulateur iOS)."

# --- Xcode / simulateurs ---------------------------------------------------
command -v xcrun >/dev/null 2>&1 || die "Xcode command line tools manquants : xcode-select --install"
xcrun simctl help >/dev/null 2>&1 || die "simctl indisponible : installe Xcode depuis l'App Store."
ok "Xcode / simulateurs disponibles"

# --- Homebrew --------------------------------------------------------------
command -v brew >/dev/null 2>&1 || die "Homebrew requis : https://brew.sh"

# --- JDK 17 (Maestro l'exige ; le Java système est souvent en 11) ----------
JDK17_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null || true)"
if [ -z "$JDK17_HOME" ] && [ -x /opt/homebrew/opt/openjdk@17/bin/java ]; then
  JDK17_HOME=/opt/homebrew/opt/openjdk@17
fi
if [ -z "$JDK17_HOME" ]; then
  info "Installation d'OpenJDK 17 (Homebrew)…"
  brew install openjdk@17
  JDK17_HOME=/opt/homebrew/opt/openjdk@17
fi
ok "JDK 17 : $JDK17_HOME"

# --- Maestro ---------------------------------------------------------------
if [ -x "$HOME/.maestro/bin/maestro" ]; then
  ok "Maestro déjà installé ($HOME/.maestro/bin)"
else
  info "Installation de Maestro…"
  curl -Ls "https://get.maestro.mobile.dev" | bash
  [ -x "$HOME/.maestro/bin/maestro" ] || die "Installation Maestro échouée."
  ok "Maestro installé"
fi

# --- Vérification ----------------------------------------------------------
if JAVA_HOME="$JDK17_HOME" PATH="$JDK17_HOME/bin:$HOME/.maestro/bin:$PATH" \
     MAESTRO_CLI_NO_ANALYTICS=1 maestro --version >/dev/null 2>&1; then
  VER="$(JAVA_HOME="$JDK17_HOME" PATH="$JDK17_HOME/bin:$HOME/.maestro/bin:$PATH" \
         MAESTRO_CLI_NO_ANALYTICS=1 maestro --version 2>/dev/null | tail -1)"
  ok "Maestro opérationnel (JDK 17) — version ${VER:-?}"
else
  die "Maestro ne démarre pas avec le JDK 17. Vérifie $JDK17_HOME."
fi

cat <<EOF

$(ok "Outillage prêt.")
Lance les flows via le wrapper (il injecte le JDK 17) :
    ./e2e/scripts/maestro.sh test e2e/maestro/flows
Pour Maestro global dans ton shell, ajoute à ton profil :
    export JAVA_HOME="$JDK17_HOME"
    export PATH="\$JAVA_HOME/bin:\$HOME/.maestro/bin:\$PATH"
EOF
