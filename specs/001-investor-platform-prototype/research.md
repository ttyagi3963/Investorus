# Phase 0 Research: Investor Platform Prototype

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-10-30

Each decision resolves an unknown from the plan's Technical Context. The binding inputs are the
spec, the constitution (v7.1.0; XIX, XV, and Governance amended on 2026-10-30), and the reviewer's hard limits: one `docker compose up --build`,
x86_64 Linux, 2 GB RAM, 20-minute build, home page within 5 minutes, no secrets or outside accounts.

Exact package versions are pinned in the lockfile at implementation time. The major versions
below are the planning baseline.

---

## R1. Language and runtime

- **Decision**: TypeScript (strict) on Node.js 24 LTS everywhere. Container base image:
  `node:24-bookworm-slim` (multi-arch, so x86_64 is available).
- **Rationale**: The constitution assumes TypeScript, Zod, and Prisma. A single language across
  web, API, worker, and contracts lets `@clever/contracts` be shared at compile time and at
  runtime. LTS avoids "current" release churn. The local dev machine runs Node 26, which is
  forward-compatible.
- **Alternatives considered**: Node 22 LTS (works, but older); Bun (faster installs, but less
  proven with Prisma and Next.js under a 2 GB build).

## R2. Monorepo layout and tooling

- **Decision**: pnpm workspaces + Turborepo with `apps/api`, `apps/worker`, `apps/web`,
  `apps/sandbox`, `packages/contracts`, `packages/core`, and `packages/config`.
- **Rationale**: Constitution XXI mandates the api/worker/web/contracts split.
  `packages/core` is the server-only shared package XXI.3 requires, so api and worker can share
  domain services and repositories. `apps/sandbox` hosts the outside-service stand-ins (see R9).
  `packages/config` holds shared tsconfig, eslint, and vitest presets.
- **Alternatives considered**: a single Next.js app with API routes (violates XXI and II.9; no
  separate worker process, which VIII requires); Nx (heavier, not what the constitution assumes).

## R3. API framework

- **Decision**: Express 5 for `apps/api` and `apps/sandbox` (team choice). Supporting
  middleware: `express.json({ limit: "1mb" })`, `helmet`, and `pino-http`.
- **Rationale**:
  - Constitution XXI.1 allows Express or Fastify, and Express is the team's chosen standard.
  - Express 5 forwards rejected promises from async handlers to error middleware, so route
    handlers stay translation-only with no try/catch (II).
  - Cross-cutting concerns are app-level middleware mounted *before* the routers, in a fixed
    order: `helmet` → `pino-http` (trace ID) → `express.json` → `authenticate` → `idempotency`
    (POST/PUT/PATCH) → routers → `notFound` → `errorTranslator` (the 4-argument error
    middleware, the VII HTTP translator).
  - The middleware order is defined in one file, `apps/api/src/app.ts`, and covered by a test
    so it cannot drift.
- **Implications**:
  - Express has no built-in schema layer. That is fine, because VI puts validation in services
    (Zod), not routes.
  - Request typing uses `@types/express` plus a `res.locals.actor` type declaration.
  - Route parameters come from `req.params` (II.9), and every route file exports an
    `express.Router()`.
- **Alternatives considered**: Fastify 5 (built-in hooks and lower overhead, but not the team
  standard; the memory difference is negligible at prototype scale); tRPC (couples web to api more
  tightly than contract clients over REST, and REST is what II specifies).

## R4. Web framework and UI

- **Decision**: Next.js 16 App Router (React 19), Tailwind CSS 4 with CSS-variable brand tokens,
  React Aria Components, and TanStack Query 5. Built with `output: "standalone"`.
- **Rationale**: Mandated by XI, XIII, and XXI.4. The standalone output keeps the runtime image
  and memory small. Route Handlers act only as the BFF (XXI.4): they read the HTTP-only session
  cookie, attach the bearer token, and call `apps/api` through the `@clever/contracts` client.
- **Alternatives considered**: a Vite SPA plus the api serving cookies (loses the BFF cookie
  boundary in XII and XXI); Server Actions for every mutation (allowed by XXI, but Route Handlers
  plus React Query give explicit cache invalidation, which XIII requires).

## R5. Database and ORM

- **Decision**: PostgreSQL 17 (`postgres:17-alpine`) with Prisma (latest stable). The Prisma
  schema and migrations live in `packages/core/prisma`. A one-shot `migrate` container runs
  `prisma migrate deploy` and then the idempotent seed before api and worker start.
- **Rationale**: Constitution IV, VIII, and XVIII rely on PostgreSQL (JSONB payloads, partial
  unique indexes, `SKIP LOCKED`), and XIX needs typed columns with CHECK constraints. Repositories in
  `packages/core` need the generated client, and api and worker must not import each other
  (XXI.3), so the schema has to live in the shared package. The API image runs the migrations, so
  in practice `apps/api` still owns schema changes. This is a recorded deviation from XXI.1 (see
  the plan's Complexity Tracking). A seed keyed on fixed natural keys (upsert) means restarts never
  duplicate sample data (FR-003).
- **Alternatives considered**: Drizzle (lighter, but the constitution names Prisma); schema in
  `apps/api` with the client re-exported (breaks the "no cross-app imports" rule).

## R6. Durable jobs (internal workflow, Principle VIII)

- **Decision**: A PostgreSQL `Job` table with the generic envelope (`type`, `status`, `progress`,
  `error`, `payload`, `result`, `retryCount`, `maxRetries`) plus `runAt` for scheduled jobs. The
  worker claims jobs with `SELECT … FOR UPDATE SKIP LOCKED`, polling every 1 second. Duplicate
  active jobs are prevented by a partial unique index on (`type`, `dedupeKey`) where `status` is
  `QUEUED` or `PROCESSING`.
- **Job types**: `MATCH_PACKAGE`, `IMPORT_INVESTORS`, `CLOSE_OFFER_ROUND` (scheduled at the
  deadline), `EXPIRE_OFFER` (at expiration), `EXPIRE_RECONFIRMATION` (48 hours after promotion).
- **Rationale**: Scheduled jobs in the database survive restarts, which satisfies FR-059 and
  FR-072. A claim is a 60-second lease the running worker renews every 20 seconds, so a long
  run (a large import) is never taken over. A lease nobody renewed (`lockedAt` older than 60
  seconds) is reclaimed, so a crashed worker's job is picked up again; the lost run counts as a
  try, so a job that kills its worker every time ends FAILED. Only the worker holding the lease
  can complete or fail the job (T378). Handlers are written to be safely re-runnable.
- **Alternatives considered**: BullMQ delayed jobs for timers (Redis is not the system of record
  for workflow state; VIII and XVIII.3 assign that to PostgreSQL); pg-boss (good library, but the
  constitution wants a generic envelope the team owns, and the table is small).

## R7. Outbox and outbound delivery (Principle XVIII)

- **Decision**:
  1. A service writes the state change and an `OutboxEvent` row in the same Prisma interactive
     transaction.
  2. A relay loop in `apps/worker` (1-second poll, `SKIP LOCKED`) creates one `Delivery` row per
     target (CRM, email, SMS, in-app) and enqueues a BullMQ job with `jobId = delivery.id`, so a
     re-relayed event is not enqueued twice.
  3. BullMQ consumers call the provider. Retries use exponential backoff (base 2 seconds,
     capped at 60 seconds, 10 attempts by default, about 5 minutes, configurable). Exhausted jobs go to the DLQ, and the `Delivery` row
     is set to `NEEDS_ATTENTION` with the last error.
  4. Every provider call carries `Idempotency-Key: <delivery.id>`, so the receiving stand-in
     ignores duplicates. This gives effectively-once delivery on top of at-least-once retries
     (SC-007).
- **Rationale**: This is exactly what XVIII requires. The `Delivery` table in PostgreSQL is the
  durable, queryable record the operations timeline and "needs attention" list read from
  (FR-071, FR-073). Redis holds only transient queue state.
- **Alternatives considered**: polling deliveries straight from PostgreSQL without BullMQ
  (simpler, but contradicts XVIII.2); CDC with Debezium (far too heavy for 2 GB).

## R8. Buy box rules (Principle XIX, v6.0.0) and match explanations

- **Decision** (revised 2026-10-30 with the XIX amendment):
  1. **Storage**: one investor has one or more buy boxes. Every criterion is a typed column
     with CHECK constraints; geography is `geographyMode` plus `BuyBoxGeography` rows. A null
     criterion means "any"; empty arrays are rejected.
  2. **Criterion Registry**: one `CRITERION_KEYS` list. Each criterion has a definition in
     `@clever/contracts` (label, Zod schema, form metadata, `listingFields`), an evaluator in
     `packages/core/src/registry/`, and a SQL fragment in the buy-box `*Impl`. Each layer is a
     `Record` over the key list (`satisfies`), so a missing criterion is a compile error. The
     form, validation, pre-filter, evaluator, and audit text all come from these entries.
  3. **Two-stage matching**: stage 1 is one indexed SQL query (investor active with unexpired
     proof of funds, box active, plus every registry fragment); stage 2 runs every evaluator on
     the candidates and produces `{ key, label, passed, expected, actual }` per criterion. A
     listing value a criterion needs that is missing fails that criterion (fail closed).
  4. **Safety invariant**: stage 1 may return extra boxes but never drops one stage 2 would
     match. A fast-check property test runs against Testcontainers PostgreSQL (default 100 runs)
     with generators that include null criteria and null listing fields.
  5. **Audit**: `BuyBoxVersion` and `ListingVersion` snapshots are append-only. Only positive
     matches are stored (`MatchEvaluation`). "Why not matched?" replays the evaluator on the
     versions live at matching time; a stored positive result is returned as is.
  6. **Both directions**: publishing or materially editing a package matches it against active
     boxes (`MATCH_PACKAGE`); saving a box matches it against packages still accepting offers
     (`MATCH_BUY_BOX`), and those new matches go to the dashboard and a daily digest.
- **Rationale**: the criterion set is fixed and comes from Clever's own investor application
  and seller intake, with no user-authored formulas. Typed columns give database constraints,
  plain-SQL reporting, and full TypeScript types. One registry stops the form, the pre-filter,
  the evaluator, and the explanation from disagreeing. The SQL pre-filter keeps matching
  indexed as the network grows, and the property test makes the pre-filter safe to optimize.
  Per-criterion results still give the "why didn't this investor match" explanation (FR-074,
  SC-008).
- **Alternatives considered**: JSON Logic trees in JSONB evaluated with `json-logic-js` (the
  v5.0.0 design: rules as data, but criteria would live in three places that can drift, and a
  new criterion type still needs a schema and form change); a hybrid of indexed columns plus a
  JSONB tail (two storage shapes and an extra compiler); storing a non-match row for every box
  on every package (simple replay, but rows grow as boxes × packages).

## R9. Outside-service stand-ins (FR-005, FR-075, FR-078)

- **Decision**: `apps/sandbox` is a small Express service that plays the outside world:
  - a **CRM** with per-listing records, deduplicated by `Idempotency-Key`;
  - a **messaging** service that captures email and SMS in an outbox you can view;
  - **object storage** that accepts HMAC-signed upload URLs;
  - **simulation controls** for per-service outage modes (`up`, `down` returns 503, `slow` adds
    10 seconds of latency, `garbage` returns malformed JSON).
  It stores its data in its own `sandbox` PostgreSQL schema, which no platform code reads.
  It also serves a plain HTML page on port 4100 for raw inspection.
- **Rationale**: Real HTTP calls across a real process boundary make outages, timeouts, and bad
  responses realistic. The platform's providers (XIV) do not know the targets are fake. Swapping
  in the real HubSpot or Twilio means writing a new provider implementation and changing the
  composition root, which demonstrates XIV directly. Operations toggles outages from the web app
  through `apps/api` → `ISimulationControlProvider` (FR-075).
- **Alternatives considered**: in-process fakes (no real failure modes); WireMock or MinIO
  containers (extra memory and image size; MinIO alone uses roughly 150 MB or more).

## R10. Photo uploads (Principle XIV)

- **Decision**: `IStorageProvider.createUpload()` returns a vendor-neutral `UploadInstruction`
  (`{ url, method, headers, expiresAt }`, [contracts/providers.md](./contracts/providers.md)) that
  points at a short-lived, HMAC-signed URL on the sandbox storage stand-in. The browser uploads
  directly with plain `fetch()`, so the bytes never pass through the BFF or the api, and the api then records the
  photo after checking it exists. Limits: JPEG, PNG, or WebP; 10 MB per photo; 20 photos per
  package. Seeded photos are small bundled JPEGs (under 5 MB total).
- **Rationale**: XIV requires presigned URLs and no proxying through the server. The same
  interface maps to an S3 presigned PUT in production: only the instruction's values change.
- **Alternatives considered**: multipart upload through the api (violates XIV); MinIO (rejected by
  the owner on 2026-10-30: the extra container does not fit the 2 GB limit); returning a bare URL
  (couples the client to one vendor's signing format).

## R11. PII protection (Principles XII and XX.1)

- **Decision**: Seller name, email, phone, and street line are encrypted with AES-256-GCM in the
  repository mapper (one random IV per value, key version prefix). City, state, ZIP code, and
  neighborhood stay in plain text for matching and display. Investor-facing responses use a
  separate contract (`InvestorPackageView`) with no PII fields at all, so masking happens by
  construction at the outbound serializer. A shared `redactPii()` scrubs log and Sentry payloads.
  Revealing seller details to the winning investor writes a `PII_ACCESSED` audit entry.
- **Rationale**: Storing in full and masking on the way out is what XX.1 requires. Making the
  investor view a different type means PII cannot leak by forgetting to filter. A contract test
  checks that no PII field appears in any investor-facing schema or outbound event (SC-006).
- **Prototype shortcut**: the encryption key and session secret are committed defaults in
  `.env`, because the assignment forbids secrets. In production they come from KMS or a secrets
  manager, with key rotation through the version prefix.
- **Alternatives considered**: PostgreSQL `pgcrypto` (puts key handling in SQL); a Prisma
  client extension (hides encryption from the mapper, the only place IV allows ORM types).

## R12. Authentication and sessions (Principle XII)

- **Decision**: Email and password (email since 2026-10-31), hashed with `bcryptjs` (pure JavaScript, so there are no
  native build problems on a slim image). `apps/api` issues a signed JWT (HS256 via `jose`,
  8-hour expiry) carrying `userId`, `role`, and `investorId` or `agentId`. The `apps/web` BFF
  stores it in an HTTP-only, Secure, SameSite=Lax cookie and forwards it as a bearer token, so
  the browser never sees the token. The cookie is Secure when the browser came over HTTPS (the
  request URL or `X-Forwarded-Proto`), so sign-in also works over plain HTTP on a non-localhost
  host, where a browser drops Secure cookies (`COOKIE_SECURE=auto`, the default; `true` or
  `false` force it; T372). State-changing BFF routes reject requests whose `Origin` does not
  match the host (CSRF, XII). The catch-all `/bff/<path>` proxy refuses `/bff/sessions` (the
  api's sign-in answer carries the token; sign-in goes only through `/bff/session`) and empty,
  `.`, or `..` segments, with 404; the route guard sends an unreadable, unknown-role, or expired
  session cookie to /login and clears it (T374). Demo accounts are seeded; credentials are in the
  README.
- **Rationale**: Meets XII and XXI.4 with the fewest moving parts. Role checks run in services,
  using the actor passed in from the route (III).
- **Alternatives considered**: NextAuth or Auth.js (couples auth to web, but api is the authority);
  argon2 (native module risk under the build limits).

## R13. Idempotency middleware (Principle XX.2)

- **Decision**: An Express middleware, `idempotency()`, mounted app-wide after `express.json`
  and `authenticate` and before the routers. It acts only on POST, PUT, and PATCH:
  - The key is `idem:{method}:{path}:{Idempotency-Key}`, plus a SHA-256 hash of the body.
  - To store the response, it wraps `res.json` / `res.send` for that request, and writes the
    captured status and body to Redis on `res.on("finish")`. Responses with status 5xx are not
    stored, so a retry after a server error re-executes.
  - `SET NX` with a 60-second "in progress" marker. A concurrent duplicate gets
    `409 Conflict` with a `Retry-After` header.
  - On completion, the status and body are stored for 24 hours. A replay returns the stored
    response with the header `Idempotent-Replay: true`.
  - The same key with a different body gets `422 Unprocessable Entity`.
  - If Redis is unreachable, the request is rejected with `503` and `Retry-After: 5`
    (fail closed).
  - The web contract client attaches the key automatically. UI forms create one key when the
    form opens, so a double-click reuses it.
- **Rationale**: A literal implementation of XX.2. It sits outside route handlers (II, VI).
  Duplicate offers (FR-045) are also blocked by a unique constraint on (`packageId`,
  `investorId`, `round`) for active offers, giving defense in depth.
- **Alternatives considered**: a PostgreSQL idempotency table (allowed only as a fallback by
  XX.2; not needed in the prototype).

## R14. Concurrency for acceptance and status changes (FR-053)

- **Decision**: Every `ListingPackage` and `Deal` update uses optimistic concurrency
  (`version` column; `UPDATE … WHERE id = $1 AND version = $2`). In addition, a partial unique
  index allows only one `Deal` per package with status not in (`FELL_THROUGH`, `CLOSED`,
  `RECONFIRM_DECLINED`), and `Deal.offerId` is unique. The losing request gets a `409` with a `BusinessRuleError`.
- **Rationale**: The database guarantees at most one active deal even under a race; the version
  check gives the second user a clear message.

## R15. Status machines

- **Decision**: Allowed transitions are declared as `as const` maps in `@clever/contracts` (V)
  and enforced in services, so code never compares status strings ad hoc. The package, offer,
  deal, job, and delivery machines are listed in [data-model.md](./data-model.md).
- **Rationale**: One definition drives validation, the UI's "next allowed milestones" (spec edge
  case), and tests.

## R16. Config-driven values (Principle IX, FR-051)

- **Decision**: A `ConfigEntry` table (key, JSONB value, optional `brandId`, validated against a
  Zod schema per key) holds:
  - the net-proceeds fee assumptions (closing-cost percentage, flat fees);
  - the default offer window (72 hours) and the backup reconfirmation window (48 hours);
  - the delivery retry policy;
  - the package form's step and field requirements, which publish validation also uses.
  Values are seeded. Operations can view and edit them through the api.
- **Rationale**: Business values change without a deploy (IX). The step definitions satisfy IX's
  "declarative flow" rule for the agent's package form.

## R17. Error handling and observability (Principles VII and XII)

- **Decision**: `DomainError` (with subclasses `NotFoundError` 404, `BusinessRuleError` 409,
  `ForbiddenError` 403, `ValidationError` 400, `ConflictError` 409) and `InfrastructureError`
  (502 or 503). Each HTTP app has one error translator: the last-mounted Express 4-argument
  error middleware `(err, req, res, next)`, which Express 5 also reaches for rejected promises
  in async handlers. The worker has its own translator. Logging uses structured JSON via `pino` with `trace_id`, `job_id`, and
  `delivery_id`, and all payloads pass through `redactPii()`. Sentry is behind an `IErrorReporter`
  interface whose prototype implementation writes to the log, because outside accounts are not
  allowed.
- **Rationale**: Matches VII and XII. Expected domain errors are not logged; audit entries are
  written separately (VII).

## R18. Testing (Principle XV, XVII.2)

- **Decision**:
  - **Unit (Vitest)**: services with mocked repositories and providers; registry evaluators
    (null wildcard, fail-closed missing values, contextual publish rules); net proceeds; status
    machines; PII redaction; hooks via `renderHook`. Run with `pnpm test`; no Docker needed.
  - **Integration (Vitest + Testcontainers, PostgreSQL 17 and Redis 7)**: migrations,
    constraints, cascade deletes, the outbox in the same transaction as the state change,
    `SKIP LOCKED` job claiming, partial unique indexes (duplicate jobs, one active deal), the
    idempotency middleware against real Redis (including a Redis-down 503), and the end-to-end
    path publish → match → offer → accept → CRM delivery with the sandbox running in-process;
    and the fast-check pre-filter safety property (XIX.4).
    Run with `pnpm test:integration` (requires Docker).
  - **Contract tests**: no PII field in investor-facing schemas or outbound event payloads.
  - **Deterministic time**: all time-dependent logic gets an injected `IClock`. Tests that
    involve deadlines, expirations, backoff, or the 48-hour window use the fake clock and fake
    timers, enabled per file in `beforeEach` and restored in `afterEach`. Global fake timers
    in the shared Vitest presets are prohibited (XV, constitution 7.0.0), so Testcontainers
    I/O and time-independent tests run on real timers.
- **Rationale**: Two tiers exactly as XV defines them; vendors stay mocked in both.

## R19. Fitting the 2 GB / 20-minute limits

- **Decision**:
  - One multi-stage `Dockerfile` builds the whole monorepo once (`turbo run build
    --concurrency=1`, `NODE_OPTIONS=--max-old-space-size=1280` for the Next.js build), and a
    single runtime image is used by `migrate`, `api`, `worker`, `sandbox`, and `web` with
    different commands.
  - In compose, only one service declares `build:`. The others reference the same `image:` tag
    with `pull_policy: never`, so the build runs once and not in parallel.
  - `node_modules` are pruned to production dependencies in the runtime stage, and
    `.dockerignore` excludes build output and dependency folders.
- **Runtime memory budget (target)**:

  | Service | Budget |
  | --- | --- |
  | postgres (`shared_buffers=64MB`) | ~200 MB |
  | redis (`maxmemory 64mb`) | ~30 MB |
  | api | ~150 MB |
  | worker | ~150 MB |
  | sandbox | ~80 MB |
  | web (standalone) | ~200 MB |
  | **Total** | **~810 MB** (leaves headroom on 2 GB) |

- **Verification**: quickstart step V1 runs the build under a 2 GB memory cap and times it.
- **Rationale**: Parallel builds of several images are the main out-of-memory risk. One build
  with concurrency 1 removes it.
- **Alternatives considered**: separate Dockerfiles per app (parallel builds, a larger total
  image); dropping Redis (violates XVIII and XX.2).

## R20. Ports and the startup sequence

- **Decision**:
  - Published ports: `3000` web (home page `/`), `4000` api (for curl inspection), and `4100`
    sandbox inspection page. All servers listen on `0.0.0.0`.
  - Startup order: postgres and redis (healthchecks) → sandbox (creates its own `sandbox`
    schema; healthcheck) → `migrate` (exits 0; the seed writes sample photos through
    `IStorageProvider.put`) → api, worker → web (waits for the api healthcheck).
  - The web home page explains the demo, lists the demo accounts, and links to each role's
    workspace (User Story 1).
- **Rationale**: Meets the assignment's port and startup rules.

## R21. Design system (FR-090 to FR-097; Principles X, XI, XVI)

- **Decision**: a shared `packages/ui` design system, built in four layers. Brand values live
  only in data.

  | Layer | What | Where |
  | --- | --- | --- |
  | 1. Brand primitives | Raw palette (e.g., `blue-600`), type scale, spacing scale, radii, shadows — per brand | `seed/brands/<brandId>.json` → `Brand.themeTokens` (data, not source; XVI) |
  | 2. Semantic tokens | Stable purpose names: `color.action.primary`, `color.surface.card`, `color.text.muted`, `color.status.danger`, `color.focus.ring`, `space.inset.md`, `radius.control`, … Each brand maps every semantic token to one of its primitives | Names: `packages/ui/src/tokens/semantic.ts` (`as const`). Mapping: the brand JSON. |
  | 3. Tailwind bridge | Tailwind 4 `@theme` declares semantic utilities that read CSS variables (`--color-action-primary`, …), so components write `bg-action-primary`, `text-muted`, `p-inset-md` | `packages/ui/src/styles/theme.css` |
  | 4. Components and templates | React Aria primitives (Button, TextField, NumberField, Select, ComboBox, DatePicker, Dialog, Table, Tabs, Badge/StatusPill, Toast, Card, EmptyState, Skeleton, ErrorState), patterns (FormSection, MoneyField, StatusTimeline, ComparisonTable), and page templates (AppShell, ListPageTemplate, DetailPageTemplate, WizardTemplate, ComparisonTemplate, TimelineTemplate) | `packages/ui/src/{primitives,patterns,templates}` |

- **How the brand reaches the screen**:
  1. The web root layout resolves the brand once (from the host or a demo `brand` cookie, X).
  2. It fetches the token set through the API and renders it as CSS custom properties on
     `<html data-brand>`.
  3. Components never read the brand. Switching brands swaps the variable values only
     (FR-092, SC-014).
- **Guardrails**:
  - A Zod schema requires every semantic token to be mapped (FR-091).
  - A contrast checker computes WCAG ratios for the declared text/background and focus pairs,
    and fails seeding, saving, and tests when any pair is below AA (FR-095, SC-015).
  - Lint bans Tailwind arbitrary values (`bg-[#…]`, `p-[13px]`), hex and rgb literals, and the
    default palette classes in `apps/web` and `packages/ui`. Only semantic utilities pass
    (SC-014).
  - Components use `ref` as a prop (React 19, XI).
- **Living style guide**: the `/design-system` route in `apps/web` shows tokens, components,
  and templates for the active brand, with a brand switcher (FR-097, FR-093). This avoids
  Storybook, whose separate build would cost time and memory against the 20-minute / 2 GB
  limits.
- **Brands seeded**:
  - `clever`: colors supplied by the project owner on 2026-10-30, extracted from
    cleveroffers.com.
  - `brand-beta`: a fictional partner palette, also supplied by the owner, with a deliberately
    different radius to make the switch obvious.
  - Where a supplied color fails AA as text, the semantic text role uses a darker shade of the
    same hue, and the supplied color stays the indicator, focus, or accent value. The values and
    ratios are in [contracts/design-tokens.md](./contracts/design-tokens.md) under "Seeded
    brand values".
- **Rationale**:
  - Semantic tokens separate design intent from brand values, so a new partner is a data file
    (X).
  - A shared package makes the system reusable by Clever's other portals (the Agent Portal and
    the Loan Officer Portal named in the assignment), which strengthens the org and ownership
    story.
  - React Aria supplies keyboard, focus, and screen-reader behavior (XI).
- **Alternatives considered**:
  - Tokens as static CSS files per brand in source: violates XVI ("no hardcoded brand
    colors"), and adding a brand needs a code change.
  - Style Dictionary build step: useful at scale, unnecessary for two brands.
  - Copying a third-party kit (shadcn/ui): faster start, but its Radix base is not React Aria
    (XI).

## R22. Ports, adapters, barrels, and composition roots (Principles I, IV, V, XII, XIV, XV)

This decision folds in the external "project structure and orchestration blueprint" review. It
adopts what fits the constitution and corrects what does not.

### Adopted

- **One composition root per runnable app** (`apps/{api,worker,web,sandbox}/src/container.ts`).
  It is the only place that constructs the Prisma client, the Redis client, repositories, and
  providers, using manual constructor injection (I).
- **Vertical repository slices**, each in its own folder holding the port, the adapter, and the
  mapper:

  ```text
  packages/core/src/repositories/listing-package/
  ├── IListingPackageRepository.ts           # port (interface): domain types only
  ├── PrismaListingPackageRepositoryImpl.ts  # adapter: the only file using Prisma queries
  ├── listing-package.mapper.ts              # toListingPackage() / toPrismaListingPackage(); the only place Prisma types appear (IV)
  └── index.ts
  ```

  The "DAO" role is played by the `*RepositoryImpl` plus its mapper. There is no separate DAO
  layer.
- **Barrel exports** for every contracts subfolder and the core package (V).
- **Thin Express routers** that call one service method and delegate errors (II).
- **Vendor selection by environment variable** in the composition root (XIV).

### Corrected

| Blueprint said | Problem | This plan does instead |
| --- | --- | --- |
| `process.env.DATABASE_URL!` and a `REDIS_URL` fallback to `redis://localhost:6379` | Non-null assertions and silent fallbacks violate XII ("validate all required env vars at startup and fail fast"). | Each container parses `process.env` with a Zod `envSchema` first. A missing or invalid value stops startup with the variable named. Demo values come from the committed `.env`, never from code fallbacks. |
| `export const container = createContainer()` at module level, imported by routers | Importing any router connects to the DB and Redis, so unit tests cannot run offline (XV), and wiring order is hidden. | `createContainer(env)` is called once in `server.ts` (or `main.ts`). `createApp(container)` builds the Express app, and each router is a factory, `createListingPackageRouter({ listingPackageService })`, receiving only the services it uses. Tests build the app with mock services. |
| `MatchingWorkflow(packageRepo, crmProvider)` in the **api** container | Matching runs in the worker (VIII). Domain code calling the CRM directly bypasses the transactional outbox (XVIII). | Workflows write outbox events in the same transaction. Only the worker's delivery consumers receive `ICrmProvider` and `IMessagingProvider`. The api container holds no CRM or messaging provider (only `ISimulationControlProvider` for the ops outage toggles). |
| `PackageService(packageRepo, new AesGcmEncryptionProvider())` | Encryption is an infrastructure concern. Putting it in the service spreads PII handling. | `IPiiCipher` is injected into the seller and property **repository adapters**. Mappers encrypt and decrypt, so services see plain domain objects (R11). |
| Each repository used on its own | It cannot express "state change + outbox event in **one** transaction" across repositories (XVIII.1). | An **`IUnitOfWork`** port: `uow.run(async (repos) => { ... })` hands the callback repositories bound to one Prisma interactive transaction (`PrismaUnitOfWorkImpl`). Services use it for every multi-write operation. |
| The `@clever/core` barrel "exports all interfaces & impls" | Any router or service could import a `Prisma*RepositoryImpl` from the barrel and bypass the composition root. | Two entry points via `package.json` `exports`: **`@clever/core`** (ports, services, workflows, domain types, errors) and **`@clever/core/adapters`** (Prisma impls, provider impls, the unit of work, the cipher). An ESLint rule allows `@clever/core/adapters` and `@prisma/client` only in `**/container.ts` and in `packages/core/src/**/*Impl.ts`. |
| Contracts barrel: one root `index.ts` | V asks for a barrel per contracts subfolder. | A root `index.ts` **and** subpath exports per folder (`@clever/contracts/offer`, `@clever/contracts/events`, ...). Deep imports into files are blocked by `exports`. |
| "Swap PostgreSQL for MongoDB by changing one line" | Overclaims. The design deliberately relies on PostgreSQL guarantees the constitution mandates (VIII, XVIII, XIX): JSONB, partial unique indexes, `SKIP LOCKED`, same-transaction outbox, CHECK constraints and array columns for buy boxes, the audit trigger. | The honest claim: services and routes never see the ORM, so **an ORM or driver swap** (Prisma to Drizzle or raw `pg`) touches only `*Impl` files, mappers, and the container. Leaving PostgreSQL would also require re-implementing those guarantees, which is a deliberate non-goal. |
| "Switch to HubSpot with zero code changes: set `CRM_VENDOR=HUBSPOT`" | `HubspotCrmProviderImpl` is not built (no outside accounts are allowed), and HubSpot uses private-app access tokens, not API keys. | Switching means **one new adapter class plus an env change**. Services, routes, the outbox, and retries are untouched. The env var is `CRM_PROVIDER=sandbox`; a `hubspot` value with a `HUBSPOT_ACCESS_TOKEN` is reserved for the production adapter. |
| `try { ... } catch (e) { next(e) }` in every route | Redundant in Express 5, which forwards rejected promises from async handlers. | Async handlers have no try/catch (R3). |
| `res.status(201).json({ data })` and `createPackage(req.body)` | The `data` envelope is inconsistent with [contracts/api.md](./contracts/api.md), and the call omits the authenticated actor, so the service cannot enforce role or ownership (III). | Return the resource directly, as the contract specifies. Pass `(actor, input)`: `service.create(res.locals.actor, req.body)`. |
| The Prisma client built with `datasources: { db: { url } }` | Client construction options differ across Prisma majors, and newer versions use driver adapters. | Build the client the way the pinned Prisma version documents (for example `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })` on driver-adapter versions). The connection string comes only from the validated env. |
| `specs/.../0-constitution.md (v3.1.0)` | Wrong location and version. | The constitution stays at `.specify/memory/constitution.md` (now v6.0.0), where the Spec Kit commands read it. |
| The package map omits `packages/ui` and names the entity `PropertyPackage` | Drops the design system (R21) and diverges from the data model's naming. | Keep `packages/ui`. The entity is `ListingPackage` throughout. |

### Implementation naming (constitution V naming table)

Every concrete implementation of a port uses the `Impl` suffix:
- `PrismaListingPackageRepositoryImpl`, `PrismaUnitOfWorkImpl`
- `SandboxCrmProviderImpl`, `SandboxMessagingProviderImpl`, `SandboxStorageProviderImpl`,
  `SandboxSimulationProviderImpl`
- `StaticGeoProviderImpl`, `LogErrorReporterImpl`, `AesGcmPiiCipherImpl`, `SystemClockImpl`

Test doubles are named `Fake*` / `InMemory*` (for example `FakeClock`,
`InMemoryListingPackageRepository`).

### Composition root sketch (`apps/api/src/container.ts`; illustrative, not final code)

```ts
import { apiEnvSchema, type ApiEnv } from "./env";                // Zod; fails fast (XII)
import { ListingPackageService, PublicationWorkflow, type IListingPackageService } from "@clever/core";
import {
  PostgresDatabaseImpl, createRedisClient, AesGcmPiiCipherImpl,
  SandboxSimulationProviderImpl, SystemClockImpl,
} from "@clever/core/adapters";                                    // allowed only in container.ts

export function createContainer(env: ApiEnv = apiEnvSchema.parse(process.env)) {
  const cipher = new AesGcmPiiCipherImpl(env.PII_ENCRYPTION_KEY);
  const db = new PostgresDatabaseImpl(env.DATABASE_URL, cipher);  // IDatabase (T276): the one line a database swap changes
  const redis = createRedisClient(env.REDIS_URL);
  const clock = new SystemClockImpl();
  const { uow } = db;                                              // repos bound to one tx

  const listingPackageService: IListingPackageService =
    new ListingPackageService(uow, clock);
  const publicationWorkflow = new PublicationWorkflow(uow, clock); // writes Job + OutboxEvent in one tx

  return Object.freeze({
    services: { listingPackageService, publicationWorkflow /* , ... */ },
    infra: { redis, simulation: new SandboxSimulationProviderImpl(env.SANDBOX_URL) },
    dispose: async () => { await db.dispose(); await redis.quit(); },
  });
}
export type ApiContainer = ReturnType<typeof createContainer>;
```

The router receives services; it never imports the container module:

```ts
export const createListingPackageRouter = ({ listingPackageService }: ApiContainer["services"]) =>
  Router().post("/", async (req, res) => {
    res.status(201).json(await listingPackageService.create(res.locals.actor, req.body));
  });
```

The worker container wires `ICrmProvider` and `IMessagingProvider` (selected by `CRM_PROVIDER`
and `MESSAGING_PROVIDER`), the job handlers, and the outbox relay. It shares
`@clever/core/adapters` but not the api's container.

## R24. When matching runs (Principle VIII; FR-022; T293)

- **Decision**: on the event, as a durable job. Publishing, or a material edit after publish,
  writes a `MATCH_PACKAGE` job in the same transaction as the change and the listing version
  snapshot; the worker polls the `Job` table with `FOR UPDATE SKIP LOCKED` and runs one matching
  run per listing version in one transaction. A stale version or a withdrawn package does nothing.
- **Rationale**: offer windows are 72 hours, so a package must reach investors within seconds,
  not at the next batch; the job row means a crash or restart never loses a run.
- **Where batch runs fit**: buy box changes (US5) and the daily digest re-check open packages per
  investor, and a periodic reconciliation sweep re-runs matching for open packages to catch
  anything a bug or a manual data fix missed.
- **Alternatives considered**: a nightly batch (too slow for a 72-hour window); matching inside
  the publish request (a slow or failed run would fail the publish, and nothing would retry it);
  Redis and BullMQ (another service on the 2 GB machine, when the Postgres job table is enough).

## R23. Anti-Corruption Layer (ACL) & Boundary Insulation (Principles I, IV, VI, XIV, XVIII)

- **Decision**: every outside system (HubSpot, Google Sheets, object storage such as S3, email
  and SMS vendors) sits behind an **anti-corruption layer at the perimeter** of the hexagon,
  not inside or "on top of" the core. `@clever/core` services and workflows depend only on our
  own contracts:
  - the port interfaces (`ICrmProvider`, `ICrmMirrorReader`, `IMessagingProvider`,
    `IStorageProvider`, `IGeoProvider`, ...) defined in `packages/core`;
  - the Zod schemas and domain types in `@clever/contracts` (including the Criterion Registry
    schemas, XIX).
  No vendor type, SDK, field name, status value, or error code crosses into the core.

  ```text
   Outside world             ACL (perimeter adapters)                Core (our contracts)
   ─────────────             ────────────────────────                ────────────────────
   HubSpot          ◀──▶  HubspotCrmProviderImpl (production)  ─┐
   Sandbox CRM      ◀──▶  SandboxCrmProviderImpl (prototype)   ─┴─▶ ICrmProvider
   Google Sheets     ──▶  parseLegacyCsv + CRITERION_COLUMNS   ───▶ buy box input schema (T022)
   S3 / sandbox     ◀──▶  S3 / SandboxStorageProviderImpl      ───▶ IStorageProvider + UploadInstruction
   SendGrid/Twilio  ◀──▶  *MessagingProviderImpl               ───▶ IMessagingProvider
  ```

- **What the ACL absorbs** (each concern lives in one adapter class, never in services):

  | Vendor quirk | Where it is handled | What the core sees |
  | --- | --- | --- |
  | Model mapping (our `PackageStatus` → HubSpot deal stage and properties; legacy sheet columns → buy box criteria) | The adapter or parser, with an explicit mapping table | Only our enums and schemas |
  | Ordering (a delayed retry must not overwrite a newer status) | Sandbox: `409 STALE` on a `sequence` at or below the stored one (T380). HubSpot: a stored `lastSyncedSequence` property compared in the adapter | `{ result: "APPLIED" \| "STALE" }`; STALE is recorded as SENT (superseded) |
  | Rate limits, timeouts, 5xx | 5 s timeout per call; 408 / 429 / 5xx mapped to a retryable `InfrastructureError` | Retries with backoff in the delivery dispatcher (contracts/events.md) |
  | Malformed or unexpected responses | Zod validation of every response (VI) | `InfrastructureError`; primary data is never written from a bad response |
  | Vendor error codes and SDK exceptions | Caught and translated inside the adapter (IV) | Our `InfrastructureError` hierarchy only (VII) |
  | Seller PII the CRM needs | Only the CRM adapter loads it, through `ISellerContactReader`, with a `PII_ACCESSED` audit entry | Outbox payloads stay PII-free (FR-032) |
  | Upload mechanics (presigned S3 PUT vs. the sandbox HMAC URL) | The storage adapter | The vendor-neutral `UploadInstruction` `{ url, method, headers, expiresAt }` |

- **"The core does not care as long as the contract is met"**, made verifiable rather than
  assumed: every adapter has its own tests proving it honors the port contract (sandbox
  adapters: T065, T069; a production HubSpot adapter would add tests against recorded HubSpot
  responses before go-live). Lint keeps adapters out of the core: `*Impl` classes are
  importable only from `container.ts` (R22).

- **Link to the Strangler Fig migration**: the ACL is the seam; the strangler fig is the
  rollout. Each step changes which system sits behind a contract, or which system owns a
  capability, while services, routes, the outbox, and the database stay untouched:

  | Step | Legacy that shrinks | What changes | Exit check before the next step |
  | --- | --- | --- | --- |
  | 0. Shadow | Nothing yet | The platform matches packages in parallel; results are compared with today's manual investor list | Match lists agree on real packages |
  | 1. Investor list | Google Sheets | Investors and buy boxes imported (idempotent, re-runnable); the sheet becomes read-only | Import report clean; no edits to the sheet |
  | 2. Matching and outreach | Zapier outreach Zaps | Outbox deliveries replace the Zaps, which are switched off one by one | No "needs attention" backlog; investors receive packages |
  | 3. Offers | Email and manual offer tracking | Offers, comparison, and decisions in the platform | Agents record every decision in the platform |
  | 4. Transaction status | HubSpot deal stages for this workflow | The platform owns status; HubSpot keeps a one-way mirror (`CRM_PROVIDER=hubspot`) | CRM comparison in sync over an agreed period |
  | 5. Retire | HubSpot workflows for this flow | The mirror is kept only while other teams read it | Remaining HubSpot consumers confirmed |

  The prototype demonstrates the mechanisms each step relies on: the one-way CRM sync (legacy
  users keep working), the CRM comparison screen (parity evidence before cutover), the
  idempotent import (safe to repeat during the overlap), and outbox delivery with retries (the
  replacement for Zaps). Moving one market or capability at a time with a cutover switch is a
  production step and is not built in the prototype.

- **Rationale**: the core is written once against stable contracts, so a vendor change,
  outage, or retirement is contained in one adapter class. That is what makes a gradual,
  low-risk migration possible.
- **Alternatives considered**: calling vendor SDKs from services (vendor models and errors
  leak into business logic, and every vendor change touches the core); a big-bang cutover from
  HubSpot and Sheets (high revenue risk, with no parity evidence before the switch).
