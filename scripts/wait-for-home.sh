#!/usr/bin/env sh
# Polls the home page until it answers 200, up to 300 s (the assignment allows 5 minutes).
# Prints the elapsed seconds; exits 1 on timeout (T102).
set -eu

url="${1:-http://localhost:3000/}"
limit="${2:-300}"
start=$(date +%s)

while :; do
  elapsed=$(( $(date +%s) - start ))
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" || true)
  if [ "$code" = "200" ]; then
    echo "home page answered 200 after ${elapsed}s: $url"
    exit 0
  fi
  if [ "$elapsed" -ge "$limit" ]; then
    echo "timed out after ${elapsed}s waiting for $url (last status: ${code:-none})" >&2
    exit 1
  fi
  sleep 3
done
