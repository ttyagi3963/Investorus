# 0015. Design for the reviewer's 2 GB machine

## Status
Accepted, 2026-11-01. Deciders: Tarun (owner), Claude.

## Context
- The reviewer runs one `docker compose up --build` on a 2 GB x86_64 machine. The build must
  finish within 20 minutes and the home page must answer within 5. The zip must be 100 MB or less
  and need no secrets or outside accounts.
- The stack is seven services: postgres, redis, sandbox, migrate (one-shot), api, worker, and web.
- The product depends on outside services: a CRM, email and SMS, and object storage. Operations
  must be able to switch an outage of each one on and off (FR-075), and delivery must survive
  outages (XIV, XVIII; ADR 0009).
- Early rehearsals found real failures: pnpm started one worker thread per visible core and the
  build ran out of memory (fixed in T232); and Node's default heap grows with the machine's
  memory, so four default Node processes together exceed 2 GB.

## Decision
We will treat the reviewer's machine as the production environment and measure against it.
- **One command, demo values only.** The committed `.env` holds demo values and no real secret.
  There is no hosted dependency.
- **A stand-in for each outside service.** `apps/sandbox` is a small Express service with its own
  Postgres schema: a CRM that dedupes by `Idempotency-Key`, an email and SMS capture, and
  HMAC-signed object storage. Each has four modes: `up`, `down` (503), `slow` (10 s more latency),
  and `garbage` (malformed JSON) (R9). The platform calls it over real HTTP through the same ports
  a vendor would use (ADR 0006).
- **A build that fits.** One Dockerfile with shared install and build stages: `PNPM_MAX_WORKERS=2`;
  `turbo run build --concurrency=1` with a 1,280 MB build heap; `pnpm deploy --prod` per app, so
  each image carries only production dependencies.
- **Measured runtime caps (T391).** Under 1,800 concurrent page loads the peak resident memory was
  web 289 MiB, api 152, worker 166, sandbox 33; parsing a 5 MB, 10,000-row investor file alone
  holds about 120 MiB of live heap. From those, V8 heap caps: web 384 MiB, api 256, worker 384,
  sandbox 128. Postgres runs with `shared_buffers=64MB`; Redis with `maxmemory 64mb`,
  `noeviction`, and no persistence (ADR 0012). No compose `mem_limit`s: a hard limit kills a
  container, while a heap cap makes V8 collect sooner.
- **Ordered start with healthchecks.** Postgres and Redis first; then migrate (migrations and the
  seed, then it exits) and the sandbox; then the api and the worker; then the web app once the api
  is healthy. The api, worker, and sandbox stop within 8 s, inside compose's 10 s grace period.
- **A rehearsal in CI.** `scripts/submission/rehearse.sh` runs from `submission.yml` on every push
  to `main` and on PRs that change source, Docker files, dependencies, migrations, or the seed. It
  proves the cap is real (a canary that tries to use 2.6 GB must be killed), starts a
  Docker-in-Docker daemon with 2 GB, no swap, and 2 pinned cores, unzips the submission, runs the
  one command, signs in with every demo account, and fails on the time limits or any
  out-of-memory kill. `scripts/verify-limits.sh` repeats the measurement on a real VM.

## Alternatives considered
- **A hosted demo:** breaks "no outside accounts", and replaces the reviewer's own run with ours.
- **In-process mocks:** cannot show timeouts, 503s, malformed responses, or idempotent receivers
  across a process boundary, and those failures are what the outbox exists to handle.
- **Third-party mock containers (MinIO, WireMock):** cost memory that 2 GB cannot spare; MinIO
  alone uses roughly 150 MB or more (R9).
- **Hard memory limits per container:** rejected above, in favour of heap caps.

## Consequences
- **Positive:** the CI rehearsal on the Sprint 9 PR (GitHub Actions run 41405559240) measured a
  202 s build, the home page 3 s after start, a peak of 1,423 MB of 2,048, and 0 out-of-memory
  kills. A cold run on a real 2 GB EC2 t3.small (the owner's test, Sprint 8) measured a 4.0 min
  build, the home page 29 s after start, a peak of 1,695 MiB, and 0 out-of-memory kills. The
  limits are 20 min and 5 min.
- **Positive:** outages can be demonstrated live from the operations console.
- **Negative:** memory is the thin margin, and the Next.js build is the peak. The sandbox is code
  we maintain that production will never run.
- **Negative:** the rehearsal takes minutes, so it is path-filtered; a startup change outside its
  paths needs a manual run. It caps memory and cores but not CPU speed or disk, which is why one
  real run was needed.
- **Revisit when:** the build grows (moving `prisma` to a dev dependency and shrinking the images
  would add headroom); real providers replace the sandbox behind the same ports; or the stack moves
  to an orchestrator with a secrets manager.

## Evidence
- [compose.yaml](../../compose.yaml), [Dockerfile](../../Dockerfile),
  [rehearse.sh](../../scripts/submission/rehearse.sh),
  [submission.yml](../../.github/workflows/submission.yml),
  [verify-limits.sh](../../scripts/verify-limits.sh),
  [README.md "Checking the limits"](../../README.md#checking-the-limits)
- Spec documents (available on request): research R9, R19, R20; plan.md Complexity Tracking and
  Prototype Shortcuts; tasks T232, T233, T364, T391
