# Investorus

Investorus is an off-market investor marketplace for proptech. An agent publishes a listing
package, the platform matches it against every investor's buy box, notifies the investors who fit,
collects competing offers, and tracks the accepted deal to closing. Many investors compete behind
the agent, and the seller's identity stays private until an offer is accepted.

This project was built to demonstrate more than a working marketplace. The core goal was to show
how I would replace a revenue-producing workflow that runs on a brownfield mesh of tools (a CRM,
spreadsheets, no-code automations, low-code apps, and manual steps) with one reliable system,
without stopping the business. It focuses on production-minded engineering choices around data
consistency, failure handling, outside integrations, explainability, and a migration path off the
old tools.

[![CI](https://github.com/ttyagi3963/Investorus/actions/workflows/ci.yml/badge.svg)](https://github.com/ttyagi3963/Investorus/actions/workflows/ci.yml)

## The Problem It Solves

The existing workflow works and earns revenue, but it is held together by people. It has the
problems these systems usually have:

- The workflow is spread across many tools, and much of it lives in tribal knowledge.
- Important business logic exists in several systems at once.
- Data is duplicated, so state drifts and nobody knows which copy is true.
- Core concepts (investors, properties, buy boxes, listing packages, offers, and transaction
  status) have no clean technical owner.
- When a workflow fails, it fails silently and is hard to diagnose.
- Retries and third-party outages lose work or do it twice.
- Two people acting on the same deal at once can both succeed.
- Seller intake and investor buy boxes don't share a vocabulary, so bad data gets through.
- The business can't stop for a big-bang rewrite, and the team has no spare capacity.

Every engineering decision below answers one or more of these.

## Architecture Overview

Investorus is a modular monolith on one PostgreSQL system of record, deployed as three processes
that share one domain core:

```text
Browser
  -> web: Next.js App Router UI + BFF (session in an HttpOnly cookie, brand chosen per request)
  -> api: Express 5 (one database transaction per use case)
  -> PostgreSQL 17 (state, append-only audit log, outbox, durable jobs, idempotency keys, brands)
  -> worker: durable jobs, outbox relay, delivery through BullMQ on Redis 7
  -> adapters: CRM, email and SMS, object storage (stand-ins locally, S3 adapter built)
```

At a code level, the project follows a strict hexagonal shape:

```text
Routes -> Services -> Repository and Provider Ports -> Adapters
```

That separation is what makes it possible to:

- keep every business rule in one place, shared by the api and the worker
- run the whole platform locally against stand-ins, and swap in real vendors without touching
  business logic
- keep outside formats from leaking into the core, so the old tools can be migrated off one at a
  time
- test business rules offline, and test locks, constraints, and SQL against a real database

## Key Engineering Decisions

Each decision has an architecture decision record in [docs/adr](docs/adr/) with the
alternatives considered and the trade-offs.

### 1. A Modular Monolith, Not Microservices

The hardest rules here (one accepted offer per listing, one delivery per event) are far easier to
guarantee inside one database transaction than across services, and a small team cannot run a
fleet of them. Custom ESLint boundary rules keep the modules apart without a network between
them. Matching is the first module to extract if load ever demands it.

### 2. Hexagonal Architecture with Manual Dependency Injection

Services own every rule and depend only on ports. Prisma appears only in the adapter layer. The
api and the worker each have one composition root, `apps/api/src/container.ts` and
`apps/worker/src/container.ts`, built by plain constructor injection: no DI framework, no
decorators. Lint fails CI if anything else imports a concrete adapter
([ADR 0005](docs/adr/0005-use-ports-and-adapters-behind-a-bff.md)).

### 3. One Transaction per Use Case

Every use case runs inside one unit of work. The state change, its audit entry, its outbox events,
and any deadline it starts commit together, or not at all. A write outside the transaction can't
even be expressed, because services only get repositories inside the unit of work
([ADR 0007](docs/adr/0007-run-each-use-case-in-one-transaction.md)).

### 4. Every Outside Call Goes Through a Transactional Outbox

The api never calls the CRM or the messaging provider. It writes an event row in the same
transaction as the change, and the worker delivers it later. Deliveries retry with exponential
backoff and jitter for about five minutes, then land in a dead-letter queue that operations can
see and retry from a console. A CRM outage never fails an agent's action and never loses a
message ([ADR 0009](docs/adr/0009-send-every-outside-call-through-a-transactional-outbox.md)).

### 5. Postgres as the Backbone, Redis Only for Delivery

Everything that must be correct lives in Postgres, transactional with the change that causes it.
Redis holds only the BullMQ delivery queue, and only the worker touches it. Each queued job is
keyed by its delivery ID, and the relay re-queues anything Redis lost, so Redis can restart empty
without losing work ([ADR 0012](docs/adr/0012-use-postgres-as-the-backbone-and-redis-only-for-delivery.md)).

### 6. Every Mutating Request Is Idempotent

Every POST, PUT, and PATCH carries an `Idempotency-Key`, claimed in Postgres with a lease. A retry
after a lost answer replays the stored response instead of creating a second offer; the same key
with a different body is refused. Every outside delivery also sends its own ID, so the receiver
can drop a repeat ([ADR 0011](docs/adr/0011-make-every-mutating-request-idempotent.md)).

### 7. Durable Timers in Postgres

Offer deadlines and expirations are job rows written in the same transaction as the change that
sets them. Workers claim them with `FOR UPDATE SKIP LOCKED` and a renewed lease, so several
workers can run at once. Every handler re-reads its rows and is safe to run late, twice, or for
nothing, and a one-time effect claims a marker so a re-run never repeats it
([ADR 0010](docs/adr/0010-run-time-based-rules-as-durable-jobs-in-postgres.md)).

### 8. Concurrency Resolved in Three Layers

Version checks catch a stale screen (409, reload). A row lock on the listing makes competing
actions such as accept, counter, and a late offer take turns. Leases with fencing protect
background work that outlives its owner. Unique constraints are the last line: one active deal
per listing, one live offer per investor per round. Outside updates are ordered by a database
sequence number, so a late retry never overwrites newer CRM data
([ADR 0008](docs/adr/0008-resolve-concurrency-in-three-layers.md)).

### 9. An Anti-Corruption Layer at the Edge

Each outside system sits behind a port written in the platform's own terms. Adapters time out
after 5 seconds, validate every answer, and turn vendor errors into "temporary" (retry) or
"refused" (operations queue). Storage proves the swap with two working adapters, a local stand-in
and `S3StorageProviderImpl`. The legacy investor CSV import works the same way inbound: old column
names are mapped, every rejected row is reported with its reason, and a retried import skips rows
already done ([ADR 0006](docs/adr/0006-abstract-only-where-a-swap-is-real.md)).

### 10. A Strangler Fig Migration Off the Old Tools

The migration is designed to replace one workflow at a time while the old tools keep running:
map today's hidden rules with the people who run them, shadow (the platform decides but sends
nothing while a daily report explains every difference), backfill and reconcile field by field,
move write ownership, cut over by cohort, and retire the old path. A facade, implemented as a
routing rule at lead intake and in each automation, gives every opportunity one route for the
life of the deal. The CSV import, the outbox to the CRM, and the versioned api are built; the
facade and shadow mode are the planned next step
([ADR 0021](docs/adr/0021-migrate-by-strangling-one-workflow-and-one-cohort-at-a-time.md)).

### 11. One Matching Engine, Every Decision Explainable

Each of the 13 buy box criteria is defined once, in a criterion registry, and a criterion missing
from any layer fails the type check. Matching runs in two stages: one SQL query narrows the
candidates, then every evaluator runs. Each decision is stored with every criterion's expected
and actual values and the evaluator version, so operations can answer "why didn't this investor
see this house?" and replay it
([ADR 0016](docs/adr/0016-one-matching-engine-from-a-criterion-registry.md)).

### 12. Shared Contracts with Zod

`packages/contracts` holds the Zod schemas that the web app, the api, and the worker all import,
so one definition gives a build-time type and a run-time validator. Investor views have no seller
fields at all, outbox events are checked against their schema when written, and the typed client
gives the web app one function per api route and owns each request's idempotency key. The buy box
editor, the api, and the CSV import share one schema, which is how bad legacy data is stopped at
the edge.

### 13. Seller Privacy by Design

Seller details are encrypted field by field with AES-256-GCM in the repository layer, and
duplicate addresses are found with a keyed hash. Only the investor whose offer is accepted ever
sees the seller, every unmasked read is audited, and the audit log is append-only, enforced by a
database trigger ([ADR 0013](docs/adr/0013-protect-seller-privacy-by-design.md)).

### 14. Every Request Is Traceable

One W3C trace ID follows a request from the BFF through the api into its background jobs, and
appears on every log line and every error a user sees. Logs are structured with pino and redact
personal details. The operations console shows each listing's timeline, its match decisions, and
every delivery ([ADR 0014](docs/adr/0014-make-every-request-traceable-and-keep-personal-details-out-of-logs.md)).

### 15. Design System as a First-Class Architecture Decision

The UI is built on a small internal design system in `packages/ui`: accessible primitives on React
Aria, styled with semantic Tailwind utilities that map to CSS custom properties. A custom ESLint
rule fails CI on any raw color, hex value, or arbitrary style value in a screen or component, so
brand values can only come from brand files. A living style guide lives at `/design-system`.

### 16. White-Labeling: A Brand Is Data

Each brand is a set of files: W3C design tokens, names and copy, and the host names it answers on.
Brands are stored in the database and chosen per request by host, cookie, or default. Every brand
is validated on load and on save: every required variable present, every text and background pair
at WCAG AA contrast (4.5:1), safe logo paths, and allow-listed token values so a token file can't
inject CSS.

### 17. Fault Injection and a 2 GB Budget

Every stand-in service can be switched to down, slow, or garbage responses from the operations
console, so the retry and dead-letter paths are exercised, not assumed. The whole stack is built to
run in 2 GB of memory, with heap caps set from measured peaks under 1,800 concurrent page loads
([ADR 0015](docs/adr/0015-design-for-the-reviewers-2-gb-machine.md)).

## Tech Stack

- **Language and repo:** TypeScript (strict) on Node 24, pnpm workspaces, Turborepo
- **Web:** Next.js 16 App Router, React 19, TanStack Query 5, React Aria, Tailwind 4
- **API:** Express 5, Zod 4, `jose` JWTs, `bcryptjs`, pino
- **Data:** PostgreSQL 17, Prisma 7 with forward-only migrations
- **Queue:** Redis 7, BullMQ 5
- **Storage:** AWS SDK for S3 with presigned uploads
- **Testing:** Vitest, Testcontainers (PostgreSQL and Redis), Playwright with axe
- **Delivery:** Docker Compose, GitHub Actions, ESLint, Prettier, gitleaks

## Repository Structure

```text
investorus/
|- apps/
|  |- web/          Next.js UI and BFF
|  |- api/          Express routes, middleware, composition root
|  |- worker/       job runner, outbox relay, delivery
|  `- sandbox/      stand-ins for the CRM, email and SMS, and storage
|- packages/
|  |- contracts/    Zod schemas, views, events, typed client, brand tokens
|  |- core/         services, workflows, ports, adapters, outbox, jobs,
|  |               matching registry, unit of work, Prisma schema and migrations
|  |- ui/           design system primitives and theme
|  `- config/       shared TypeScript config and ESLint boundary rules
|- e2e/             Playwright journeys
|- seed/            demo data, brands, legacy investor CSV
|- scripts/         limit checks and CI rehearsal
`- docs/adr/        21 architecture decision records
```

## Folder Responsibilities and Guardrails

These boundaries are enforced by lint where they can be. If someone extends the system later,
they should hold.

### `packages/contracts/`

Owns: domain shapes, runtime validation schemas, view and event definitions, the typed api client.

Guardrails:

- if a payload crosses a boundary, define it here first
- no framework or server-only imports
- investor views and event schemas never carry personal data; contract tests check it

### `packages/core/`

Owns: services, workflows, repository and provider ports, adapters, the unit of work, the outbox,
durable jobs, and the matching registry.

Guardrails:

- business rules live in services and workflows, nowhere else
- Prisma stays in `*Impl` files, mappers, and `infra/`
- no outside call inside a transaction; outbound calls go through the outbox

### `apps/api/`

Owns: routes, middleware (auth, idempotency, tracing, errors), and the composition root.

Guardrails:

- routes translate HTTP only: read the request, call one service, send the status
- `container.ts` is the only file that builds concrete adapters
- the api never touches Redis

### `apps/worker/`

Owns: the job runner, the outbox relay, and delivery to outside services.

Guardrails:

- runs independently of the api
- every handler is safe to run late, twice, or for nothing

### `apps/web/`

Owns: screens and the BFF.

Guardrails:

- the session token stays in an HttpOnly cookie that page scripts can't read
- no server-only code from `packages/core`
- no raw style values; only semantic tokens

### `packages/ui/`

Owns: design system primitives and the theme.

Guardrails:

- brand values come from brand files, never source code
- components are accessible by default (React Aria, jsx-a11y rules)

### `apps/sandbox/`

Owns: local stand-ins for outside services, each with up, down, slow, and garbage modes.

Guardrails:

- the platform reaches it only over HTTP, through the same ports a real vendor would use
- it does not exist in production

## Engineering Process

Development follows a written engineering constitution covering hexagonal layering, idempotency,
privacy, accessibility, and testing priorities. Every change traces to a task in a specification,
plan, and task list built with GitHub Spec Kit.

The project was built by directing AI agents as an engineering team. Helper agents work in
parallel, each in its own git worktree, with one owner per file per batch, and a lead agent
reviews and integrates every change. Every review finding is verified against the code, the
running system, or Postgres before anything changes, and claims that don't hold are rejected with
the evidence. Humans own the business rules: one agent decision was reversed on review
([ADR 0019](docs/adr/0019-lock-out-only-a-banned-login.md)). AI made code cheap; confidence in it
is still expensive.

Quality is held by the pipeline. A pull request merges only when lint (with boundary and
accessibility rules), formatting, typecheck, offline unit tests, integration tests on real
PostgreSQL through Testcontainers with a migration drift check, and a gitleaks secret scan are all
green. An AI reviewer comments on each pull request against the constitution. On code and build
changes, CI also runs the full stack in a Docker daemon capped at 2 GB of memory and 2 cores, signs
in with every demo account, and fails on any time limit or out-of-memory kill. Measured on such a
machine: a 4-minute build, and the home page answering 29 seconds after start
([ADR 0020](docs/adr/0020-hold-quality-with-gates-and-invest-in-the-developer-workflow.md)).

## Running Locally

You need Docker with Compose v2. No secrets, accounts, or extra commands.

```bash
docker compose up --build
```

The first start builds the apps, runs migrations, and seeds demo data. Then:

- **http://localhost:3000**: the app. Every demo account uses the password `demo1234`, with a
  one-press sign-in on the home page: agents `avery` and `blake`, investors `harbor`, `summit`,
  `ridge`, `cobalt`, and `dune`, and operations `morgan` (all `@example.com`).
- **http://localhost:4100**: the sandbox, showing every email, text, and CRM update, live.
- **http://partner.localhost:3000**: the same app under a partner brand.
- **http://localhost:3000/design-system**: the living style guide.

To see the outbox and dead-letter queue work: as `morgan`, open **Simulations** and set the CRM to
**Down**. Publish a listing as `avery` in another window; it succeeds. **Failed jobs** shows the
deliveries retrying, then waiting for attention. Set the CRM back to **Up** and press **Retry
all**; every delivery is sent exactly once.

For development: Node 24+ and pnpm 10, then `pnpm install`, `pnpm test` for offline unit tests,
and `pnpm test:integration` for the real-database tier.

## Production Strategy

Locally, everything runs in one Compose file. In production I would keep the same modular
monolith and change only what it runs on.

1. **The web app and the api.** Both hold no state, so I would run them as containers on ECS
   Fargate behind a load balancer with TLS, with the web app behind a CDN. They scale by adding
   containers.

2. **The worker.** A separate always-on service, scaled by job type. Several workers can already
   run at once safely, because jobs are claimed with `SKIP LOCKED` and renewed leases.

3. **The database.** Aurora PostgreSQL, multi-zone, with point-in-time restore and cross-region
   backups. Postgres is not just the application database here; it is the outbox, the job
   backbone, and the idempotency store, so its reliability is the platform's reliability.

4. **Redis.** ElastiCache. It holds nothing that can't be rebuilt from Postgres, so it needs to be
   available, not durable.

5. **Storage and identity.** S3 behind a CDN for photos, with browsers uploading directly through
   signed links. An identity provider for sign-in: SSO for staff, passkeys or magic links for
   investors.

6. **Operations.** Terraform, blue/green deploys, feature flags assigned per opportunity (the same
   route the migration facade uses), canary releases to one market first, OpenTelemetry tracing,
   Sentry, alerts on delivery backlog and job lag, and the four DORA metrics against a baseline.

The core is not what breaks first. The write load is listings and offers per day, which one
well-indexed Postgres handles easily. The pressure is at the edges: notification bursts (already
throttled by a delivery concurrency cap and a daily digest for buy box matches), CRM rate limits
(batching planned), reporting (a read replica, then a warehouse fed by change data capture), and
table growth (monthly partitioning).

## Known Limitations

The prototype cuts these corners on purpose. Each has a planned production path.

1. **Secrets.** Demo encryption key and JWT secret are committed in `.env`. Production uses a
   secrets manager and KMS, with rotation through the cipher's key-version prefix.
2. **Sign-in.** Email and password with an 8-hour JWT, no refresh or MFA.
3. **Vendors.** The CRM, email, and SMS are stand-ins; real adapters go behind the same ports.
4. **Observability.** Trace IDs in every log line, but no spans, metrics, or dashboards yet.
5. **Edge.** No rate limiting, and plain HTTP locally.
6. **Matching.** A buy box change re-matches every open listing in one job; incremental matching by
   changed criteria comes next.
7. **Pagination.** List routes return plain arrays; keyset pagination is designed but not built.
8. **Brands.** Each brand's token file is a complete set, so a shared fix is made in every file. A
   base theme with per-brand overrides is the production design.
