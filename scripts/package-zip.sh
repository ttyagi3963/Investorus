#!/usr/bin/env sh
# Builds the submission zip from git (T213): only committed files, exactly as in HEAD, with no
# wrapping folder, so compose.yaml sits at the top level. Uncommitted changes and ignored files
# (node_modules, dist, .next, assignment.md, ...) can never get in.
#
# Usage: scripts/package-zip.sh [output.zip]    (default: investor-platform.zip)
# Check the result with: python3 scripts/submission/check_zip.py <output.zip>
set -eu

out="${1:-investor-platform.zip}"
cd "$(git rev-parse --show-toplevel)"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "note: uncommitted changes are NOT in the zip; it is built from HEAD only" >&2
fi

rm -f "$out"
git archive --format=zip -9 --output="$out" HEAD
echo "built $out from $(git rev-parse --short=12 HEAD) ($(wc -c < "$out" | tr -d ' ') bytes)"
