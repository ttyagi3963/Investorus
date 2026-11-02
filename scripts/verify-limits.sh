#!/usr/bin/env bash
# Measures the submission limits on the machine it runs on (T364): run it from an unzipped copy on a
# real 2 GB x86_64 VM to check what scripts/submission/rehearse.sh simulates. It times
# `docker compose build` (limit 20 minutes), starts the stack and times the home page's first 200
# (limit 5 minutes), then adds up the containers' memory (limit 2 GB). Exits 1 if a limit is broken.
#
# Usage: scripts/verify-limits.sh [--clean]
#   --clean  empties Docker's build cache first (`docker builder prune -af`), so the build is timed
#            as the reviewer's first one. It deletes cached layers for every project on the machine.
# Needs: docker with compose, curl. Ports 3000, 4000, and 4100 must be free.
set -euo pipefail

BUILD_LIMIT_S=1200
HOME_LIMIT_S=300
MEMORY_LIMIT_MIB=2048
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
# MemUsage reads "512MiB / 1.9GiB"; the first field is the use. Docker writes binary units (KiB,
# MiB, GiB) and other tools SI ones (kB, MB, GB), so both convert; an unknown unit stops the script.
total_mib=$(docker stats --no-stream --format '{{.MemUsage}}' $(docker compose ps -q) | awk '
  BEGIN { n = split("B 1 kB 1e3 KB 1e3 KiB 1024 MB 1e6 MiB 1048576 GB 1e9 GiB 1073741824", t, " ")
          for (i = 1; i < n; i += 2) bytes[t[i]] = t[i + 1] }
  { unit = $1; sub(/^[0-9.]+/, "", unit)
    if (!(unit in bytes)) { print "unknown memory unit: " $1 > "/dev/stderr"; bad = 1; exit 1 }
    total += $1 * bytes[unit] / 1048576 }
  END { if (bad) exit 1; printf "%.0f\n", total }')
echo "total: ${total_mib} MiB (limit ${MEMORY_LIMIT_MIB} MiB)"
if [ "$total_mib" -gt "$MEMORY_LIMIT_MIB" ]; then
  echo "FAIL: the containers use ${total_mib} MiB, over ${MEMORY_LIMIT_MIB} MiB" >&2
  failed=1
fi

if [ "$failed" -ne 0 ]; then exit 1; fi
echo "== within the limits; stop with: docker compose down"
