#!/usr/bin/env bash
# Copies a Pipecat Character Studio export into the client: its data files to
# public/avatar/, served at /avatar/, and its runtime to src/avatar-runtime/.
# Re-run with a newer export of the character to update both.
#
#   scripts/use-avatar.sh ~/Sites/pipecat-character-studio/out/exports/pipecat-momo-20261028-215559
set -euo pipefail

bundle="$(cd "${1:?usage: $0 <export folder>}" && pwd)"
client="$(cd "$(dirname "$0")/.." && pwd)"

for file in character.svg rig.json face.json animation.json runtime/avatar-runtime.js; do
  [[ -f "$bundle/$file" ]] || { echo "$bundle has no $file: is it an export folder?" >&2; exit 1; }
done

rm -rf "$client/public/avatar"
mkdir -p "$client/public/avatar" "$client/src/avatar-runtime"
cp "$bundle"/{character.svg,rig.json,face.json,animation.json} "$client/public/avatar/"
cp "$bundle"/runtime/{avatar-runtime.js,avatar-runtime.d.ts,avatar-react.js,avatar-react.d.ts,NOTICE.md} \
  "$client/src/avatar-runtime/"
printf '{ "bundle": "%s" }\n' "$(basename "$bundle")" > "$client/public/avatar/source.json"
echo "public/avatar/ and src/avatar-runtime/ from $(basename "$bundle")"
