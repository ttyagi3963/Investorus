# Investorus

**A reference architecture for taking a revenue-producing workflow off a brownfield mesh of
no-code tools, without stopping the business.** The workflow's logic is scattered, its data is
duplicated, its failures are silent, its core records have no owner, and the team running it has
no spare capacity. Investorus is a working implementation of the system that replaces it, built
as a proptech platform.

[![CI](https://github.com/ttyagi3963/Investorus/actions/workflows/ci.yml/badge.svg)](https://github.com/ttyagi3963/Investorus/actions/workflows/ci.yml)

The product is an off-market investor marketplace. An agent publishes a property, the platform
matches it against every investor's buy box (the criteria an investor buys on), notifies the
investors who fit, collects their offers, and tracks the accepted deal to closing. Instead of one
or two buyers contacting the seller directly, many investors compete behind the agent, and the
seller's identity stays private until an offer is accepted.

The rest of this README is about the architecture.

---

## The problems in the existing system, and how each is fixed

The existing workflow runs across a CRM, spreadsheets, automation recipes, low-code apps, and
manual steps. It works and earns revenue, but it has eleven problems. Each one is fixed by a
specific part of the architecture.

| Problem in the existing system | How the architecture fixes it | Patterns |
| --- | --- | --- |
| **The workflow is spread across many tools.** | One modular monolith becomes the workflow's home. The migration is designed to retire the old tools one workflow at a time, behind a routing facade. | Strangler fig, facade, anti-corruption layer |
| **It runs on tribal knowledge.** | Rules are written down as tested code, decisions as ADRs, and engineering rules as a constitution. The migration is designed to start by mapping today's hidden rules with the people who run them. | ADRs, constitution, mapping step |
| **Business logic lives in several systems.** | Each rule has one home, the domain core, shared by the api and the worker. Matching criteria are defined once, in a registry. | Hexagonal core, criterion registry |
| **Data is duplicated, so state is inconsistent.** | One system of record and one writer per field. The CRM receives one-way, ordered updates. Backfill reconciles field by field, not row counts. | Single writer, outbox, sequence ordering, reconciliation |
| **Core records have no clean owner.** Investors, properties, buy boxes, listing packages, offers, and transaction status. | Each has one module in the core and its own repository port, so each has exactly one place where it can change. | Modular monolith, ports and adapters |
| **Failed workflows are hard to diagnose.** | Every match decision is stored with its reasons, the audit log is append-only, and one trace ID follows a request into its background jobs. An operations console shows each listing's timeline and every delivery. | Explainable decisions, audit log, trace context |
| **Outages and retries lose or duplicate work.** | Outside calls leave through an outbox, retry with backoff, and end in a dead-letter queue (DLQ) instead of vanishing. Every request and every delivery is idempotent. | Transactional outbox, idempotency keys, DLQ |
| **Concurrent actions leave inconsistent state.** | Each use case is one transaction. Competing actions take a row lock, stale screens fail a version check, and unique constraints are the last line. | Unit of work, optimistic and pessimistic locking |
| **Bad data: seller intake and buy boxes don't share a vocabulary.** | One typed schema serves the buy box editor, the api, and the legacy import. A bad record is rejected with its reason, never passed downstream. | Shared contracts, validating adapters |
| **The workflow earns revenue, so it can't stop for a rewrite.** | The migration is designed so old and new run side by side in three stages: the platform shadows, then acts while the CRM mirrors, then runs alone. Every cutover gets a rehearsed recovery. | Strangler fig, shadow mode, parallel run |
| **The team has no spare capacity.** | One language, one deployable core, and managed services. No fleet of microservices for a small team to run. | Modular monolith |

The sections below describe each pattern in detail, and mark what is **built** in this repo and
what is **planned** for the migration.

---

## Architecture at a glance

A **modular monolith on one PostgreSQL system of record**, with every outside system behind an
adapter. It runs as three processes that share one domain core, so a rule behaves the same
whichever process applies it.

```
                  Browser
                     |
   +-----------------v-----------------+
   |  web: Next.js 16 + BFF            |   session token in an HttpOnly cookie
   +-----------------+-----------------+
                     |  /api/v1  (trace ID, idempotency key)
   +-----------------v-----------------+       +-----------------------------------+
   |  api: Express 5                   |       |  worker                           |
   |  domain core (hexagonal)          |       |  same domain core                 |
   |  one transaction per use case     |       |  durable jobs, outbox relay       |
   +-----------------+-----------------+       +------+--------------------+-------+
                     |                                |                    |
   +-----------------v--------------------------------v--+       +---------v-------+
   |  PostgreSQL 17: the system of record                |       |  Redis 7        |
   |  state, append-only audit, outbox, jobs,            |       |  delivery queue |
   |  idempotency keys                                   |       |  and DLQ only   |
   +-----------------------------------------------------+       +-----------------+

   Anti-corruption layer (ports and adapters), used by the api and the worker:
     outbound:  CRM, email and SMS, object storage (stand-in and S3), ZIP lookup     [built]
     inbound:   legacy CSV import                                                    [built]
                CRM and automation webhooks, behind the migration facade             [planned]
```

**Why a monolith and not microservices.** The hardest rules here (one accepted offer per listing,
one delivery per event) are far easier to guarantee inside one database transaction than across
services, and a small team can't operate a fleet of them. Lint rules keep the modules apart
without a network between them. Matching is the first module to extract if load ever demands it.

---

## Patterns, and the problem each one solves

Every pattern below is either **built** and running in this repo, or **planned** as part of the
designed migration path. Each links to its architecture decision record (ADR).

### 1. Migrating off the old tools without a big-bang rewrite

| Pattern | Problem it solves | How | Status |
| --- | --- | --- | --- |
| **Strangler fig** | A rewrite can't stop the business | Replace one workflow at a time while the old tools keep running: map, shadow, backfill and reconcile, move write ownership, cut over by cohort, retire | Planned ([0021](docs/adr/0021-migrate-by-strangling-one-workflow-and-one-cohort-at-a-time.md)) |
| **Facade as a routing rule** | Work arrives through many doors, not one | Each opportunity gets a canonical ID and a route, legacy or platform, at intake; every automation checks the route first, so a deal never switches systems halfway | Planned ([0021](docs/adr/0021-migrate-by-strangling-one-workflow-and-one-cohort-at-a-time.md)) |
| **Anti-corruption layer** | Vendor formats leak into business rules | Ports in the domain's own terms; adapters translate, time out after 5 s, validate every answer, and turn vendor errors into "temporary" or "refused" | Outbound and CSV import built; webhooks planned ([0005](docs/adr/0005-use-ports-and-adapters-behind-a-bff.md), [0006](docs/adr/0006-abstract-only-where-a-swap-is-real.md)) |
| **One writer per field** | Two systems silently disagree about one record | The platform owns listings, buy boxes, offers, and deals; the CRM receives one-way updates through the outbox | Built for platform data ([0009](docs/adr/0009-send-every-outside-call-through-a-transactional-outbox.md)) |
| **Shadow mode and parallel run** | Hidden rules get lost in the move | The platform decides but sends nothing, while a daily report explains every difference from the old process | Planned ([0021](docs/adr/0021-migrate-by-strangling-one-workflow-and-one-cohort-at-a-time.md)) |
| **Restartable backfill with reconciliation** | Legacy data has duplicates and gaps | The legacy investor import maps old columns, reports every rejected row with its reason, and skips rows already done on a retry | Built |
| **Expand, migrate, contract** | Old and new code must share one database during a rollout | Forward-only migrations with a drift check in CI; a versioned api (`/api/v1`) | Built |

### 2. Consistency inside the system

| Pattern | Problem it solves | How | Status |
| --- | --- | --- | --- |
| **Unit of work** | A change commits but its audit entry or message doesn't | The state change, its audit entry, its outbox events, and any timer it starts commit in one transaction | Built ([0007](docs/adr/0007-run-each-use-case-in-one-transaction.md)) |
| **Optimistic concurrency** | A stale screen overwrites newer data | Writes name the version they were based on; a mismatch returns 409 | Built ([0008](docs/adr/0008-resolve-concurrency-in-three-layers.md)) |
| **Pessimistic row lock** | Two acceptances, or an offer landing at the deadline | Competing actions on a listing take the same row lock first, backed by unique constraints (one active deal per listing, one live offer per investor per round) | Built ([0008](docs/adr/0008-resolve-concurrency-in-three-layers.md)) |
| **Durable timers in Postgres** | A restart loses a deadline | Deadlines are job rows written with the change; workers claim them with `FOR UPDATE SKIP LOCKED` and a renewed lease, and every handler is safe to run late, twice, or for nothing | Built ([0010](docs/adr/0010-run-time-based-rules-as-durable-jobs-in-postgres.md)) |
| **Effect markers** | A job re-run after a crash repeats a side effect | Each one-time effect claims a key in the same transaction | Built ([0010](docs/adr/0010-run-time-based-rules-as-durable-jobs-in-postgres.md)) |

### 3. Reliable integration with outside systems

| Pattern | Problem it solves | How | Status |
| --- | --- | --- | --- |
| **Transactional outbox** | An outage fails the user's action, or loses the message | The event is a row in the same transaction as the change; the worker delivers it later | Built ([0009](docs/adr/0009-send-every-outside-call-through-a-transactional-outbox.md)) |
| **Idempotency keys** | A retried request or delivery runs twice | Every mutating api request needs an `Idempotency-Key` (a retry replays the stored answer); every delivery sends its own ID so the receiver can drop a repeat | Built ([0011](docs/adr/0011-make-every-mutating-request-idempotent.md)) |
| **Retry with backoff, then a DLQ** | Transient failures need retries; permanent ones need a human | Exponential backoff with jitter for about five minutes, then a dead-letter queue that operations can see and retry from a console | Built ([0009](docs/adr/0009-send-every-outside-call-through-a-transactional-outbox.md)) |
| **Redis as a disposable queue** | Losing the queue must not lose work | Delivery state lives in Postgres; Redis holds only the BullMQ queue, and the relay re-queues anything Redis lost | Built ([0012](docs/adr/0012-use-postgres-as-the-backbone-and-redis-only-for-delivery.md)) |
| **Ordered updates by sequence number** | A late retry overwrites newer CRM data | Each event gets a database sequence number; the receiver keeps only a newer one | Built ([0008](docs/adr/0008-resolve-concurrency-in-three-layers.md)) |
| **Fault injection** | Failure paths that were never exercised | Each stand-in service can be switched to down, slow, or garbage responses from the operations console | Built ([0015](docs/adr/0015-design-for-the-reviewers-2-gb-machine.md)) |

### 4. Explainability, privacy, and observability

| Pattern | Problem it solves | How | Status |
| --- | --- | --- | --- |
| **Rules engine from a criterion registry** | Matching rules grow past understanding | Each of 13 criteria is defined once; a criterion missing from any layer fails the type check; SQL narrows, then evaluators decide | Built ([0016](docs/adr/0016-one-matching-engine-from-a-criterion-registry.md)) |
| **Explainable, replayable decisions** | "Why didn't this investor see this house?" | Every match decision is stored with each criterion's expected and actual values and the rule version; a non-match replays against the versions live at the time | Built ([0016](docs/adr/0016-one-matching-engine-from-a-criterion-registry.md)) |
| **Append-only audit log** | History gets rewritten | A database trigger refuses updates and deletes on the audit table | Built |
| **Privacy by design** | Personal details leak into events, logs, or the wrong view | Field-level AES-256-GCM encryption in the repository layer, a keyed hash for duplicate detection, PII-free view types and event schemas, audited reads | Built ([0013](docs/adr/0013-protect-seller-privacy-by-design.md)) |
| **Trace context** | A failure can't be followed across processes | One W3C trace ID from the BFF through the api into background jobs, on every log line and error | Built; OpenTelemetry export planned ([0014](docs/adr/0014-make-every-request-traceable-and-keep-personal-details-out-of-logs.md)) |
| **Theming as data** | Each partner brand becomes a code fork | Colors, fonts, shapes, names, and logos are validated token files in the database, chosen per request | Built |

---

## Engineering governance: directing AI agents

The platform was built by an engineering lead directing AI agents as an engineering team, under
explicit governance ([0001](docs/adr/0001-use-spec-driven-development-with-spec-kit.md),
[0002](docs/adr/0002-govern-engineering-with-a-constitution.md),
[0003](docs/adr/0003-direct-ai-agents-as-a-team-and-verify-before-trusting.md)).

- **Spec first.** Every change traces to a task in a written specification, plan, and task list
  (GitHub Spec Kit), under an engineering constitution covering privacy, idempotency, layering, and
  testing. No code without a task.
- **Agents split by ownership.** Helper agents work in parallel, each in its own git worktree, and
  each file has one owner per batch. A lead agent reviews and integrates every change.
- **Verify before trusting.** Every review finding, from people or AI, is checked against the
  code, the running system, or Postgres before anything changes. A claim that doesn't hold is
  rejected with the evidence instead of "fixed."
- **Humans own the business rules.** Agents propose; the owner decides, and the record says who
  decided. One agent decision was reversed on review: ADR 0018 is superseded by
  [0019](docs/adr/0019-lock-out-only-a-banned-login.md).

AI made code cheap. Confidence in it is still expensive, so the leader's job shifts to scope,
verification, and decisions.

---

## CI/CD and quality

Quality is a property of the pipeline, not of attention
([0020](docs/adr/0020-hold-quality-with-gates-and-invest-in-the-developer-workflow.md)).

- **Trunk-based delivery.** One branch and one pull request per batch, one commit per task, and a
  pull request merges only when every gate is green.
- **Gates on every pull request:** lint (with architecture-boundary and accessibility rules),
  formatting, and typecheck; offline unit tests; integration tests on real PostgreSQL 17 through
  Testcontainers, with a migration drift check; and a gitleaks secret scan. A dependency audit runs
  as advice.
- **Automated architecture review.** An AI reviewer comments on each pull request against the
  constitution.
- **A production-like rehearsal.** On code and build changes, CI runs the full stack inside a
  Docker daemon limited to 2 GB of memory, no swap, and 2 cores, signs in with every demo account,
  and fails on any time limit or out-of-memory kill
  ([0015](docs/adr/0015-design-for-the-reviewers-2-gb-machine.md)). Measured on such a machine: a
  4-minute build, and the home page answering 29 seconds after start.
- **Tests by tier.** An in-memory fake carries the pure business rules for fast unit tests; locks,
  constraints, races, and SQL are tested on a real database; 21 Playwright tests, including axe
  accessibility checks, drive the running stack. Each important rule gets one test that fails
  without the change.

**Planned for production:** blue/green deploys, feature flags assigned per opportunity (the same
route as the migration facade), canary releases to one market first, OpenTelemetry tracing,
Sentry, and the four DORA metrics tracked against a baseline.

---

## Stack

| Layer | Built | Production path |
| --- | --- | --- |
| Language and repo | TypeScript (strict) on Node 24; pnpm workspaces and Turborepo | Same |
| Web | Next.js 16, React 19, React Aria, Tailwind 4 | Same, behind a CDN |
| API | Express 5, Zod | Same, on a container platform |
| Data | PostgreSQL 17, Prisma 7 | Managed PostgreSQL with point-in-time restore |
| Queue | Redis 7, BullMQ (worker only) | Managed Redis |
| Outside services | Stand-ins with switchable outages; S3 adapter built | Real CRM, email, and SMS adapters behind the same ports |
| Tests | Vitest, Testcontainers, Playwright | Same |
| Delivery | Docker Compose, GitHub Actions | Infrastructure as code, blue/green deploys |

Every rejected alternative is recorded in [ADR 0004](docs/adr/0004-choose-the-technology-stack.md).
All 21 ADRs are indexed in [docs/adr](docs/adr/).

---

## Run it

You need Docker with Compose v2. Nothing else: no secrets, accounts, or extra commands.

```sh
docker compose up --build
```

When **http://localhost:3000** opens, sign in with one press on the home page. Every demo account
uses the password `demo1234`: agents `avery` and `blake`, investors `harbor`, `summit`, `ridge`,
`cobalt`, and `dune`, and operations `morgan` (all `@example.com`). The sandbox at
**http://localhost:4100** shows every email, text, and CRM update the platform sends, live.

**See the outbox and the DLQ work.** As `morgan`, open **Simulations** and set the CRM to **Down**.
In another browser window, publish a listing as `avery`: it succeeds. Back as `morgan`, **Failed
jobs** shows the deliveries retrying, and after about five minutes, waiting for attention. Set the
CRM back to **Up** and press **Retry all**: every delivery is sent exactly once.

**See idempotency work.** The api answers curl on port 4000. Send the same request twice with the
same `Idempotency-Key`, and the second answer is the first one replayed, with
`Idempotent-Replay: true`:

```sh
TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/sessions \
  -H 'Content-Type: application/json' \
  -d '{"email":"morgan@example.com","password":"demo1234"}' \
  | sed -E 's/.*"token":"([^"]+)".*/\1/')
curl -si -X POST http://localhost:4000/api/v1/ops/match-digests \
  -H "Authorization: Bearer $TOKEN" -H 'Idempotency-Key: digest-1'
```

For development: Node 24+ and pnpm 10, then `pnpm install`, `pnpm test` (unit, offline), and
`pnpm test:integration` (needs Docker).

---

## Known shortcuts and their production path

Recorded on purpose, so each one has a planned way out.

| Shortcut | Production path |
| --- | --- |
| Demo encryption key and JWT secret committed in `.env` | A secrets manager and KMS, with key rotation through the cipher's key-version prefix |
| Email and password sign-in, 8-hour JWT | SSO for staff; magic links or passkeys for investors; short-lived tokens with rotation |
| Stand-ins for the CRM, email, and SMS | Vendor adapters behind the same ports (the S3 adapter already shows the swap) |
| Trace IDs in logs, no spans or metrics | OpenTelemetry traces, Prometheus metrics, and alerts on delivery backlog and job lag |
| Single PostgreSQL instance; Redis without persistence | Managed PostgreSQL with replicas and point-in-time restore; managed Redis (the outbox already covers Redis loss) |
| No rate limiting; plain HTTP locally | Edge rate limits and a WAF; TLS at the load balancer |
| A buy box change re-matches every open listing in one job | Incremental matching by changed criteria |
| No cursor pagination on list routes | Keyset pagination |
