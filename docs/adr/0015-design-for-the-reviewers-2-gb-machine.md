# 0015. Design for the reviewer's 2 GB machine

## Status
Accepted, 2026-11-01. Deciders: Tarun (owner), Claude.

## Context
- The reviewer runs one `docker compose up --build` on a 2 GB x86_64 machine. The build must finish within 20 minutes and the home page must answer within 5 minutes. The zip must be 100 MB or less, and it must need no secrets or outside accounts (CLAUDE.md, hard constraints).
- The stack is seven services: postgres, redis, sandbox, migrate (one-shot), api, worker, and web.
- The product depends on outside services: a CRM, email and SMS, and object storage. Operations must be able to switch an outage of each one on and off (FR-075). Delivery must survive outages (XIV, XVIII).
- Early rehearsals found three real failures:
  - pnpm started one worker per visible core (about 23 on a large CI host), and the build ran out of memory.
  - Dev dependencies leaked into the images (1.65 GB per image).
  - Node's default heap grows with the machine's memory, so four default Node processes together exceed 2 GB (plan.md).

## Decision
We will treat the reviewer's machine as the production environment and measure against it on every change.
- **One command, demo values only.** The committed `.env` holds demo values and no real secret. There is no hosted dependency.
- **A stand-in for each outside service.** `apps/sandbox` is a small Express service with its own Postgres schema. It provides a CRM that deduplicates by `Idempotency-Key`, an email and SMS capture, and HMAC-signed object storage. Each service has four modes: `up`, `down` (503), `slow` (10 seconds more latency), and `garbage` (malformed JSON) (R9). The platform calls it over real HTTP through the same ports that real providers would use.
- **A build that fits.** One Dockerfile with shared install and build stages:
  - `PNPM_MAX_WORKERS=2`;
  - `turbo run build --concurrency=1` with a 1,280 MB build heap;
  - `pnpm deploy --prod` for each app, so each image carries only production dependencies.
- **Measured runtime caps (T391).**
  - Measured peak resident memory under 1,800 concurrent page loads: web 289 MiB, api 152, worker 166, sandbox 33.
  - Parsing a 5 MB, 10,000-row investor file alone holds about 120 MiB of live heap.
  - V8 heap caps set from those measurements: web 384 MiB, api 256, worker 384, sandbox 128.
  - Postgres runs with `shared_buffers=64MB`. Redis runs with `maxmemory 64mb`, `noeviction`, and no persistence.
  - No compose `mem_limit`s: a hard limit kills a container, while a heap cap makes V8 collect sooner.
- **Ordered start with healthchecks.**
  - Postgres and Redis start first.
  - Then migrate (migrations and the seed, then it exits) and the sandbox (a port check).
  - Then the api and the worker.
  - Then the web app, once the api is healthy.
  - Each service stops within 8 s, inside compose's 10 s grace period.
- **A rehearsal in CI.** `scripts/submission/rehearse.sh` runs from `submission.yml` on every push to `main` and on PRs that change source, Docker files, dependencies, migrations, or the seed. It works in five steps:
  1. It proves the cap is real: a canary that tries to use 2.6 GB must be killed.
  2. It starts a Docker-in-Docker daemon with 2 GB of memory, no swap, and 2 pinned cores.
  3. It unzips the submission and runs the one command.
  4. It signs in with every demo account.
  5. It fails on the time limits or on any out-of-memory kill.
- `scripts/verify-limits.sh` repeats the measurement on a real VM.

## Alternatives considered
- **A hosted demo:** it breaks "no outside accounts". It also replaces the reviewer's own run with ours, and that run is the test.
- **In-process mocks:** they cannot show timeouts, 503s, malformed responses, or idempotent receivers across a process boundary, and those failures are what the outbox exists to handle (plan.md, Complexity Tracking).
- **Third-party mock containers (MinIO, WireMock):** they cost memory that 2 GB cannot spare. MinIO alone uses roughly 150 MB or more (R9).
- **Hard memory limits for each container:** they turn memory pressure into a killed container instead of a garbage collection.

## Consequences
- **Positive:**
  - The Sprint 9 PR rehearsal measured a 202 s build, the home page in 3 s, a program-memory peak of 1,423 MB of 2,048, and 0 out-of-memory kills.
  - A cold run on a real EC2 t3.small (2 GB, 2 vCPU) measured a 239 s build, the home page 29 s after start, a peak of 1,695 MiB of 1,909, and 0 out-of-memory kills. The limits are 1,200 s and 300 s.
  - Outages can be demonstrated live from the operations console.
- **Negative:**
  - Memory is the thin margin: about 210 MiB was spare on the real machine, and the Next.js build is the peak.
  - The sandbox is code we maintain that production will never run.
  - The rehearsal takes minutes, so it is path-filtered. A startup change outside its paths needs a manual run.
  - A simulation caps memory and cores but not CPU speed or disk, which is why one real run was needed.
- **Revisit when:**
  - The build grows. Moving `prisma` to a dev dependency and shrinking the images would add headroom.
  - Real providers (HubSpot, SendGrid or Twilio, S3) replace the sandbox behind the same ports.
  - The stack moves to an orchestrator with a secrets manager.

## Evidence
- [research.md R9, R19, R20](../../specs/001-investor-platform-prototype/research.md)
- [plan.md Complexity Tracking and Prototype Shortcuts](../../specs/001-investor-platform-prototype/plan.md)
- [tasks.md T233, T364, T391](../../specs/001-investor-platform-prototype/tasks.md)
- [compose.yaml](../../compose.yaml), [Dockerfile](../../Dockerfile)
- [rehearse.sh](../../scripts/submission/rehearse.sh), [submission.yml](../../.github/workflows/submission.yml), [verify-limits.sh](../../scripts/verify-limits.sh)
- Study notes 28, 29, 57 (local, git-excluded): [57-two-gb-measurements.md](../../study-notes/57-two-gb-measurements.md)
