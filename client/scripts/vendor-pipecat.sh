#!/usr/bin/env bash
# Packs @pipecat-ai/client-js and client-react from a pipecat-client-web commit
# into vendor/, for the unreleased RTVI 2.3.0 standard. Re-run with a newer
# commit, then point package.json at the new tarballs and `pnpm install`.
#
#   scripts/vendor-pipecat.sh 67ddd9d
set -euo pipefail

commit="${1:?usage: $0 <pipecat-client-web commit>}"
vendor="$(cd "$(dirname "$0")/.." && pwd)/vendor"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

git clone --quiet https://github.com/pipecat-ai/pipecat-client-web "$work"
git -C "$work" checkout --quiet "$commit"
short="$(git -C "$work" rev-parse --short=7 HEAD)"

# The repo is an npm workspace; client-js builds first (its tests gate it).
(cd "$work" && npm ci --silent && npm run build --silent)

mkdir -p "$vendor"
for pkg in client-js client-react; do
  tarball="$(cd "$work/$pkg" && npm pack --silent --pack-destination "$work")"
  mv "$work/$tarball" "$vendor/${tarball%.tgz}-$short.tgz"
  echo "vendor/${tarball%.tgz}-$short.tgz"
done
