#!/usr/bin/env bash
# Submission rehearsal (T233): run the zip the way Clever's reviewer does, on a machine the size
# they describe, and fail if any published limit is broken.
#
#   1. Prove the memory cap is real: a canary capped at 2 GB that tries to use 2.6 GB must be
#      killed by the kernel (exit 137). Otherwise "passes in 2 GB" would prove nothing.
#   2. Start a Docker-in-Docker daemon capped at 2 GB of memory, no swap, and pinned to 2 CPU
#      cores. Pinning, not just a CPU quota, matters: tools size their thread pools from the
#      core count they can see, so a quota on a 24-core host would not act like a 2-CPU box.
#      Every image build and container of the rehearsal runs inside that cap.
#   3. Unzip the submission into an empty folder inside it and run only
#      `docker compose up --build`. The build must finish within 20 minutes.
#   4. GET / must answer 200 within 5 minutes of the containers starting.
#   5. Sign in through the api with every demo account the seed creates (read from the seed in the
#      zip), so the reviewer's credentials are proven to work, not just listed.
#   6. Report memory: the highest program memory (anonymous memory, sampled every 2 s, excluding
#      the file cache Linux fills and frees on demand) and the out-of-memory kill count, which
#      must be 0.
#
# Usage: scripts/submission/rehearse.sh <submission.zip>
# Needs: docker on the host and curl. Ports 3000, 4000, and 4100 must be free.
set -euo pipefail

ZIP="$1"
MEMORY=2g
CPUS=2
DIND_IMAGE=docker:29.9.2-dind
BUILD_LIMIT_S=1200
HOME_LIMIT_S=300
NAME="submission-rehearsal"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"
failures=()

log() { printf '\n== %s\n' "$*"; }
fail() { failures+=("$1"); echo "FAIL: $1" >&2; [ "${GITHUB_ACTIONS:-}" = "true" ] && echo "::error title=Submission rehearsal::$1"; return 0; }
in_dind() { docker exec "$NAME" "$@"; }

cleanup() {
  if [ "${#failures[@]}" -gt 0 ] && docker ps -q --filter "name=^${NAME}$" | grep -q .; then
    log "compose status and recent logs (for diagnosis)"
    in_dind sh -c 'cd /submission && docker compose ps -a && docker compose logs --tail 60' || true
  fi
  docker rm -f "$NAME" > /dev/null 2>&1 || true
}
trap cleanup EXIT

# --- 1. the memory cap is enforced ------------------------------------------------------------
log "1/6 proving the ${MEMORY} memory cap is enforced"
set +e
docker run --rm --memory="$MEMORY" --memory-swap="$MEMORY" alpine:3 \
  sh -c 'head -c 2600m /dev/zero | tail > /dev/null'
canary=$?
set -e
if [ "$canary" -eq 137 ]; then
  echo "ok: a process that needed 2.6 GB was killed (exit 137), so the cap is real"
else
  fail "memory cap not enforced: the 2.6 GB canary exited $canary instead of being killed (137)"
fi

# --- 2. a 2 GB Docker-in-Docker daemon --------------------------------------------------------
log "2/6 starting Docker-in-Docker (${MEMORY} memory, no swap, ${CPUS} CPUs)"
docker rm -f "$NAME" > /dev/null 2>&1 || true
docker run -d --name "$NAME" --privileged \
  --memory="$MEMORY" --memory-swap="$MEMORY" --cpuset-cpus="0-$((CPUS - 1))" \
  -e DOCKER_TLS_CERTDIR= \
  -p 3000:3000 -p 4000:4000 -p 4100:4100 \
  "$DIND_IMAGE" > /dev/null
for _ in $(seq 1 60); do in_dind docker info > /dev/null 2>&1 && break; sleep 1; done
in_dind docker info > /dev/null 2>&1 || { fail "the Docker-in-Docker daemon did not start"; exit 1; }
cap=$(in_dind cat /sys/fs/cgroup/memory.max)
echo "Docker-in-Docker memory.max = $cap bytes"
# Sample program memory (anon) for the whole rehearsal; the file cache is reclaimable, so it
# is not what decides whether a 2 GB machine copes.
in_dind sh -c 'while sleep 2; do awk "/^anon /{print \$2}" /sys/fs/cgroup/memory.stat; done > /tmp/anon.samples' &

# --- 3. unzip into an empty folder and run only `docker compose up --build` -------------------
log "3/6 unzipping into an empty folder and running docker compose up --build"
# Streamed through stdin, so it works the same from a Linux or a Windows shell.
docker exec -i "$NAME" sh -c 'cat > /tmp/submission.zip' < "$ZIP"
in_dind sh -c 'mkdir /submission && cd /submission && unzip -q /tmp/submission.zip && rm /tmp/submission.zip'
files=$(in_dind sh -c 'find /submission -type f | wc -l' | tr -d ' ')
bytes=$(in_dind sh -c 'du -sb /submission | cut -f1')
echo "unzipped: $files files, $bytes bytes"

start=$(date +%s)
set +e
in_dind sh -c 'cd /submission && docker compose up --build -d' 2>&1 | tail -25
up_rc=${PIPESTATUS[0]}
set -e
build_s=$(( $(date +%s) - start ))
started_at=$(date +%s)
echo "docker compose up --build exited $up_rc after ${build_s}s"
[ "$up_rc" -eq 0 ] || fail "docker compose up --build failed (exit $up_rc)"
[ "$build_s" -le "$BUILD_LIMIT_S" ] || fail "build took ${build_s}s, over the 20-minute limit"

# --- 4. the home page within 5 minutes --------------------------------------------------------
log "4/6 waiting for GET / (limit ${HOME_LIMIT_S}s)"
home_s=""
if [ "$up_rc" -eq 0 ]; then
  while :; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3000/ || true)
    elapsed=$(( $(date +%s) - started_at ))
    if [ "$code" = "200" ]; then home_s=$elapsed; echo "GET / answered 200 after ${home_s}s"; break; fi
    if [ "$elapsed" -ge "$HOME_LIMIT_S" ]; then fail "GET / did not answer 200 within 5 minutes (last status: ${code:-none})"; break; fi
    sleep 3
  done
fi

# --- 5. every seeded demo account signs in -------------------------------------------------------
log "5/6 signing in with every seeded demo account"
signed_in=0
if [ -n "$home_s" ]; then
  # The accounts come from the seed inside the zip: the ones the reviewer can really sign in with.
  seed=$(in_dind cat /submission/packages/core/src/infra/seed/seed.ts)
  password=$(printf '%s\n' "$seed" | sed -n 's/.*DEMO_PASSWORD = "\([^"]*\)".*/\1/p')
  emails=$(printf '%s\n' "$seed" | grep -o 'email: "[^"]*"' | sed 's/email: "\(.*\)"/\1/' | sort -u)
  [ -n "$password" ] && [ -n "$emails" ] || fail "could not read the demo accounts from the seed"
  for email in $emails; do
    body=$(printf '{"email":"%s","password":"%s"}' "$email" "$password")
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST http://localhost:4000/api/v1/sessions \
      -H 'Content-Type: application/json' -d "$body" || true)
    if [ "$code" = "201" ]; then
      signed_in=$((signed_in + 1)); echo "ok: $email signed in"
    else
      fail "$email could not sign in (HTTP ${code:-none})"
    fi
  done
fi

# --- 6. peak memory ---------------------------------------------------------------------------
log "6/6 resource use"
cap_mb=$([ "$cap" != "max" ] && echo $(( cap / 1024 / 1024 )) || echo "max")
anon_max=$(in_dind sh -c 'sort -n /tmp/anon.samples | tail -1' 2> /dev/null || echo "")
anon_mb=$([ -n "$anon_max" ] && echo $(( anon_max / 1024 / 1024 )) || echo "n/a")
oom_kills=$(in_dind sh -c 'awk "/^oom_kill /{print \$2}" /sys/fs/cgroup/memory.events' 2> /dev/null || echo "?")
echo "program memory peak (excludes reclaimable file cache): ${anon_mb} MB of ${cap_mb} MB"
echo "out-of-memory kills: ${oom_kills}"
[ "$oom_kills" = "0" ] || fail "the kernel killed $oom_kills process(es) for lack of memory"
in_dind docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}' || true
in_dind sh -c 'cd /submission && docker compose ps -a --format "{{.Service}}\t{{.State}}\t{{.Status}}"' || true
unhealthy=$(in_dind sh -c 'cd /submission && docker compose ps -a --format "{{.Service}} {{.State}} {{.Status}}"' \
  | awk '$1 != "migrate" && $2 != "running" {print $1} $1 == "migrate" && $0 !~ /Exited \(0\)/ {print $1}' || true)
[ -z "$unhealthy" ] || fail "services not running as expected: $(echo $unhealthy)"

status=$([ "${#failures[@]}" -eq 0 ] && echo "passed" || echo "FAILED")
cat >> "$SUMMARY" <<EOF
## Submission rehearsal: $status

| Measure | Result | Limit |
| --- | --- | --- |
| Memory cap enforced (2.6 GB canary killed) | $([ "$canary" -eq 137 ] && echo yes || echo "no (exit $canary)") | required |
| Machine | ${MEMORY} memory, no swap, ${CPUS} CPUs (Docker-in-Docker) | 2 GB x86_64 |
| \`docker compose up --build\` | ${build_s}s | 1200s (20 min) |
| GET / answered 200 | ${home_s:-no}${home_s:+s after start} | 300s (5 min) |
| Program memory peak (build and run, excludes file cache) | ${anon_mb} MB | ${cap_mb} MB |
| Out-of-memory kills | ${oom_kills} | 0 |
| Unzipped | $files files, $(( bytes / 1024 / 1024 )) MB | 20,000 files, 500 MB |
| Demo accounts signed in | ${signed_in} | every seeded account |
EOF

if [ "${#failures[@]}" -gt 0 ]; then
  printf '\nRehearsal FAILED:\n'; printf ' - %s\n' "${failures[@]}"; exit 1
fi
printf '\nRehearsal passed: build %ss, home page %ss, program memory peak %s MB of %s MB, out-of-memory kills %s.\n' \
  "$build_s" "$home_s" "$anon_mb" "$cap_mb" "$oom_kills"
