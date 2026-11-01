#!/usr/bin/env bash
# Measures the submission limits on the machine it runs on (T364): run it from an unzipped copy on a
# real 2 GB x86_64 VM to check what scripts/submission/rehearse.sh simulates. It times
# `docker compose build` (limit 20 minutes), starts the stack and times the home page's first 200
# (limit 5 minutes), then prints the containers' total memory. Exits 1 if a limit is broken.
#
# Usage: scripts/verify-limits.sh [--clean]
#   --clean  empties Docker's build cache first (`docker builder prune -af`), so the build is timed
#            as the reviewer's first one. It deletes cached layers for every project on the machine.
# Needs: docker with compose, curl. Ports 3000, 4000, and 4100 must be free.
set -euo pipefail

BUILD_LIMIT_S=1200
HOME_LIMIT_S=300
cd "$(dirname "$0")/.."

if [ "${1:-}" = "--clean" ]; then
  echo "== emptying the Docker build cache"
  docker builder prune -af > /dev/null
fi

failed=0

echo "== building (limit ${BUILD_LIMIT_S}s)"
start=$(date +%s)
docker compose build
build_s=$(( $(date +%s) - start ))
echo "build took ${build_s}s"
if [ "$build_s" -gt "$BUILD_LIMIT_S" ]; then
  echo "FAIL: the build took ${build_s}s, over ${BUILD_LIMIT_S}s" >&2
  failed=1
fi

echo "== starting, then waiting for the home page (limit ${HOME_LIMIT_S}s from the start)"
# The clock starts before `up`, which itself waits for the migrations, the seed, and the api's
# health check: the reviewer waits for all of it.
start=$(date +%s)
docker compose up -d
left=$(( HOME_LIMIT_S - ($(date +%s) - start) ))
if [ "$left" -le 0 ] || ! sh scripts/wait-for-home.sh "http://localhost:3000/" "$left"; then
  echo "FAIL: the home page did not answer 200 within ${HOME_LIMIT_S}s of the start" >&2
  failed=1
fi
echo "home page answered $(( $(date +%s) - start ))s after the start"

echo "== memory now (each container, then the total)"
docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' $(docker compose ps -q)
docker stats --no-stream --format '{{.MemUsage}}' $(docker compose ps -q) | awk '
  { split($1, v, /[A-Za-z]+/); unit = $1; gsub(/[0-9.]/, "", unit)
    mib = v[1] * (unit == "GiB" ? 1024 : unit == "KiB" ? 1 / 1024 : unit == "B" ? 1 / 1048576 : 1)
    total += mib }
  END { printf "total: %.0f MiB\n", total }'

if [ "$failed" -ne 0 ]; then exit 1; fi
echo "== within the limits; stop with: docker compose down"
