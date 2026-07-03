#!/usr/bin/env bash
set -euo pipefail

# Bump the marketing version and create/push a vX.Y.Z tag. Pushing the tag
# triggers the signed release workflows (release-ios.yml + release-android.yml).
# Build number = the CI run number; marketing version = this tag.
# See docs/ci-cd-signed-release.md.
#
# Usage: scripts/release.sh <X.Y.Z> [remote]
#   remote defaults to "fork" (mmaudet/twake-drive-mobile).

VERSION="${1:-}"
REMOTE="${2:-fork}"

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Usage: $0 <X.Y.Z> [remote]   (e.g. $0 0.2.0)" >&2
  exit 1
fi

TAG="v$VERSION"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

BRANCH="$(git branch --show-current)"
if [[ "$BRANCH" != "main" ]]; then
  echo "Warning: you are on '$BRANCH', not 'main'. Releases are normally cut from main." >&2
  read -r -p "Continue anyway? [y/N] " ok; [[ "$ok" =~ ^[Yy]$ ]] || exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean — commit or stash first." >&2
  exit 1
fi
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "Tag $TAG already exists." >&2
  exit 1
fi

echo "Bumping version to $VERSION …"
node - "$VERSION" <<'NODE'
const fs = require('fs');
const version = process.argv[2];
for (const file of ['package.json', 'app.json']) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (file === 'app.json') json.expo.version = version;
  else json.version = version;
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  console.log(`  updated ${file}`);
}
NODE

git add package.json app.json
git commit -m "chore(release): $TAG"
git tag -a "$TAG" -m "Release $TAG"

echo
echo "Committed the bump and created tag $TAG."
echo "Pushing the tag triggers the signed iOS + Android release workflows."
read -r -p "Push '$TAG' (+ the bump commit) to '$REMOTE' now? [y/N] " reply
if [[ "$reply" =~ ^[Yy]$ ]]; then
  git push "$REMOTE" HEAD
  git push "$REMOTE" "$TAG"
  echo "Pushed. Watch: gh run list --repo mmaudet/twake-drive-mobile"
else
  echo "Not pushed. When ready:"
  echo "  git push $REMOTE HEAD && git push $REMOTE $TAG"
fi
