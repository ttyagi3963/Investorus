# Implementation Plan: Investor Platform Prototype

**Branch**: `001-investor-platform-prototype` (spec directory; work is currently on `main`) |
**Date**: 2026-10-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-investor-platform-prototype/spec.md`

## Summary

Build a runnable prototype of Clever's Investor Platform:
- An agent publishes a listing package.
- The platform matches it against investor buy boxes (one or more per investor, stored as typed
  columns and defined through one Criterion Registry) in two stages, an indexed SQL pre-filter
  and then a TypeScript evaluator, and shares a PII-free view with matched investors.
- Investors submit competing offers.
- The agent compares them by estimated net proceeds and records the seller's decision.
- The deal is tracked to close, with backup-offer promotion if it falls through.

Around that loop, the prototype shows how the platform runs alongside today's tools (a legacy
spreadsheet import and a one-way CRM sync) and how it behaves under failure (outbox delivery
with retries, a "needs attention" list, outage simulation, and a per-package timeline).

**Technical approach**: a TypeScript Turborepo following the constitution:
- **Apps**: Express 5 `apps/api`, a separate `apps/worker` (PostgreSQL durable jobs plus BullMQ
  outbox delivery), and a Next.js 16 `apps/web` acting as a BFF client only.
- **Packages**: shared `packages/contracts` (Zod) and server-only `packages/core` (domain
  services, repositories, Prisma).
- **Design system**: a shared `packages/ui` with brand primitives → semantic tokens →
  Tailwind 4 utilities → React Aria components and page templates. Clever's brand values are
  extracted from the current site, and a fictional partner brand shows the white-label switch.
  Brand values live in data, never in components ([research.md](./research.md) R21).
- **Stand-ins**: an `apps/sandbox` service plays the outside world (CRM, email/SMS, object
  storage, outage switches).
- **Delivery**: everything ships as one Docker image and starts with
  `docker compose up --build` within the reviewer's 2 GB / 20-minute limits
  ([research.md](./research.md) R19).

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node.js 24 LTS

**Primary Dependencies**:
- Backend: Express 5 (with helmet and pino-http), Prisma ORM (latest stable) with PostgreSQL,
  Zod 4, BullMQ 5, jose, bcryptjs, pino. Dev: fast-check (property-based tests, XIX.4).
- Frontend: Next.js 16 / React 19, Tailwind CSS 4, React Aria Components, TanStack Query 5.
- Tooling: Turborepo, pnpm 10.

**Storage**:
- PostgreSQL 17: system of record, durable jobs, outbox, audit, typed buy-box columns, and
  append-only buy box and listing versions.
- Redis 7: the worker's BullMQ delivery queues (Sprint 6, T339): 64 MB, no eviction, no persistence. Idempotency keys (24 h) are stored in PostgreSQL in Sprint 2
  (Complexity Tracking, XX.2).
- Object storage: the sandbox stand-in, reached through `IStorageProvider`.

**Testing**: Vitest (unit, offline); Vitest + Testcontainers PostgreSQL/Redis (integration);
Testing Library `renderHook` (hooks); contract tests for the PII-free schemas.

**Target Platform**: Linux x86_64 containers (Docker Compose v2). Browser: current evergreen.

**Project Type**: Web application — monorepo with API, worker, web BFF, and stand-in service.

**Performance Goals**:
- Matched investors are notified within 1 minute of publish (SC-003).
- Pending deliveries complete within 5 minutes after an outage ends (SC-007, SC-012).
- Interactive pages respond in under 1 second with seeded data volumes.

**Constraints**:
- One-command start; build ≤ 20 min and home page ≤ 5 min on 2 GB x86_64.
- No secrets or outside accounts.
- Listen on `0.0.0.0`; published ports 3000, 4000, 4100.
- Zip ≤ 100 MB.

**Scale/Scope**:
- Seed data: about 50 investors, 3 agents, about 10 packages, and a 30-row legacy CSV.
- 3 roles, about 15 screens (built on 6 page templates), 2 brands, 6 user stories, 58
  functional requirements.

All Technical Context unknowns are resolved in [research.md](./research.md). No NEEDS
CLARIFICATION items remain.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below).*

Constitution v7.2.0 (`.specify/memory/constitution.md`). XIX was amended on 2026-10-30 (JSON
Logic in JSONB → Criterion Registry with typed columns); this plan was updated the same day.
XV gained the test-selection rule on 2026-10-31 (7.2.0): only rules that matter get a test.

| # | Principle | Status | How this plan complies |
| --- | --- | --- | --- |
| I | Hexagonal architecture | ✅ | `contracts → services → repos/providers → infra` in `packages/core`. One `src/container.ts` per app (api, worker, web, sandbox), the only place adapters are constructed. Routers are factories that receive services. Vertical slices per entity (port + `Impl` + mapper). `@clever/core/adapters` and `@prisma/client` imports are lint-restricted to `container.ts` and `*Impl.ts` (research R22). |
| II | Thin delivery layers | ✅ | Express routers and Next.js BFF handlers extract the request (`req.params` in api, `await params` in web), make one service or client call, and translate the result. Async work returns 202 + `jobId`. Status codes per [contracts/api.md](./contracts/api.md). Idempotency and auth are app-level Express middleware mounted before the routers. |
| III | Services own business logic | ✅ | Noun services (Package, Offer, Investor, BuyBox) are separate from verb services (Publication, Matching, Decision, DealLifecycle, InvestorImport). Services take `unknown` input and validate with Zod. |
| IV | Repositories and providers as adapters | ✅ | Prisma types appear only in mappers. Multi-write atomicity (state + outbox) goes through the `IUnitOfWork` port, not ad hoc transactions. Cascades, join tables, CUIDs, timestamps, and query-driven indexes per [data-model.md](./data-model.md). Providers throw `InfrastructureError`. |
| V | Contracts as source of truth | ✅ | `packages/contracts`: `as const` enums, separate create and update schemas, state-transition maps, the naming vocabulary (`I*` ports, `*Impl` adapters). A barrel per subfolder plus subpath `exports`. |
| VI | Validate at trust boundaries | ✅ | Zod in services for API input, job payloads, CSV rows, provider responses, and ConfigEntry values. Route handlers do not validate. |
| VII | Centralized error handling | ✅ | Domain and infrastructure hierarchies. An HTTP translator per HTTP app plus a worker translator. Separate system-error and domain-audit streams. |
| VIII | Durable workflows | ✅ | A PostgreSQL `Job` envelope with `runAt`, `SKIP LOCKED`, a partial unique `(type, dedupeKey)`, retries, and a separate worker process. |
| IX | Config-driven engine | ✅ | Buy-box criterion values are data in typed columns that investors and ops edit without a deployment; criterion types come from the registry (XIX). `ConfigEntry` for fee assumptions, windows, retry policy, digest time, near-miss window, and the package-form step definitions. |
| X | White-label separation | ✅ | Brand primitives and semantic mapping stored as data (`Brand.themeTokens`), rendered as CSS custom properties that Tailwind 4 semantic utilities consume. Brand resolved once in the web root layout. A second brand proves the swap ([contracts/design-tokens.md](./contracts/design-tokens.md)). |
| XI | Accessibility | ✅ | `packages/ui` React Aria primitives, patterns, and templates; presentational only; behavior in hooks; `ref` as a prop. Automated WCAG AA contrast check per brand. The wizard template works by keyboard and announces step changes. Dedicated loading, error, and empty states. |
| XII | Security, privacy, audit | ✅ | AES-256-GCM PII fields. HTTP-only, Secure, SameSite=Lax cookie managed by the BFF. CSRF blocked by an `Origin` check on state-changing BFF routes. Zod validation plus parameterized queries (Prisma) and React escaping against injection and XSS. No raw payment data (no payments in scope). Immutable audit table (DB trigger). Env validated at each composition root. Observability only in the translators. |
| XIII | State management | ✅ | React Query for server state (keys `["entity", id]`, explicit invalidation). Context only for coordination. No optimistic updates for offers or decisions. |
| XIV | Integration boundaries | ✅ | Every outside service behind a port ([contracts/providers.md](./contracts/providers.md)). Presigned uploads. The provider is selected by env. |
| XV | Testing | ✅ | Two tiers: offline unit tests and ephemeral-PostgreSQL integration tests. Time-dependent tests use `FakeClock` plus `vi.useFakeTimers()` scoped to the test file (`beforeEach` / `afterEach`); no global fake timers (XV as amended in 7.0.0; research R18). Test selection (7.2.0): each test guards one rule that matters; no tests of libraries, types, cosmetics, or rules already covered. |
| XVI | Brand-safe | ✅ | No brand names, colors, or logos in source. Clever and partner values live only in `seed/brands/*.json` → DB. Lint bans raw hex values, arbitrary values, and default palette classes. Test fixtures use synthetic `brand-alpha` / `brand-gamma`. |
| XVII | AI guardrails | ✅ | This spec and plan precede code. Tasks are ordered test-first. `pnpm test` plus the integration tier gate review. |
| XVIII | Transactional outbox | ✅ (built in Sprint 6, T336–T341) | Outbox row in the same transaction. Worker relay → BullMQ → provider, with backoff, DLQ, and `NEEDS_ATTENTION`. In-app notices stay in the change itself (internal state, XVIII.3). Redis is used only by the worker, for outbound delivery; the api never touches it ([contracts/events.md](./contracts/events.md)). |
| XIX | Criterion Registry | ✅ | One `CRITERION_KEYS` list. Definitions (label, Zod, form metadata, `listingFields`) in `@clever/contracts`; evaluators in `packages/core/src/registry/`; SQL fragments only in the buy-box `*Impl` (IV); each layer typed as a record over the key list. Two-stage matching, with a fast-check integration test proving the pre-filter never drops a match (XIX.4). No JSON Logic. |
| XX | Data boundary and PII | ✅ | Stored encrypted, masked by construction in `InvestorPackageView` and the event schemas. Idempotency middleware (keys in PostgreSQL, see Complexity Tracking) fails closed (503, `Retry-After: 5`); its stored answers are encrypted with the PII cipher. |
| XXI | Workspace boundaries | ⚠️ justified | The Prisma schema lives in `packages/core`, not `apps/api` (see Complexity Tracking). An additional `apps/sandbox` workspace holds the stand-ins. |
| QG | Quality gates | ✅ | Each gate maps to a task category in `/speckit-tasks`. Boundary lint rules enforce the "no Prisma in apps/web" and "no cross-app imports" gates. |

**Gate result (pre-research)**: PASS. One deviation, justified below; no unjustified violations.

**Post-design re-check (after Phase 1)**: PASS. The data model, contracts, and quickstart
introduce no new violations. Design checks made:
- The PII-free investor view and event schemas satisfy XX.1 by construction.
- The partial unique indexes satisfy VIII and FR-053.
- `409 STALE` ordering avoids BullMQ Pro features while keeping XVIII.
- The external structure blueprint was reviewed against the constitution (research R22).
  Adopted: per-app composition roots, vertical repository slices, barrels. Corrected:
  - env fail-fast instead of `!` and fallback defaults (XII);
  - factory containers instead of import-time singletons (XV);
  - no CRM provider in the api, so outbound calls go only through the outbox (XVIII);
  - `IUnitOfWork` for same-transaction writes (XVIII.1);
  - adapters behind a restricted `@clever/core/adapters` entry point (I);
  - `Impl` naming (V).
- The design system keeps brand values in data and gives components semantic utilities only,
  which satisfies X and XVI. An automated contrast check per brand enforces XI.
- The single-image build keeps the full constitution architecture (including Redis and the
  separate worker) within the 2 GB limit, so no architecture simplification is needed.
- XIX re-check after the 6.0.0 amendment: the registry is split across three files only
  because IV (Prisma only in adapters) and XXI (apps/web never imports server code) require
  it. XIX.3 accepts this, because each layer is a record over the same key list and a missing
  criterion fails the build. Buy box versions, listing versions, and match evaluations are
  append-only (trigger-protected), which keeps XII's auditability.

## Project Structure

### Documentation (this feature)

```text
specs/001-investor-platform-prototype/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R23
├── data-model.md        # Phase 1: entities, constraints, state machines, privacy matrix
├── quickstart.md        # Phase 1: run and validation guide (V1–V7)
├── contracts/
│   ├── api.md           # REST API (apps/api)
│   ├── events.md        # Outbox events and delivery semantics
│   ├── providers.md     # Provider ports, the upload instruction, and the sandbox stand-in API
│   ├── investor-import.md  # Legacy spreadsheet CSV format
│   └── design-tokens.md # Brand token set (primitives → semantic) + validation
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
compose.yaml                 # postgres, redis, migrate (one-shot), api, worker, sandbox, web
Dockerfile                   # single multi-stage build → one runtime image (research R19)
.env                         # committed demo defaults (no real secrets; see Shortcuts)
README.md                    # setup, demo accounts, tour, shortcuts, curl recipes
turbo.json  pnpm-workspace.yaml  package.json
scripts/wait-for-home.sh
seed/
├── legacy-investors.csv     # 30 rows, 4 invalid (contracts/investor-import.md)
├── expected-matches.json    # oracle for V2 / SC-003
├── brands/                  # <id>/tokens.json (DTCG, the owner's design bundle) + content.json; brand-beta later (T201)
└── photos/                  # small sample JPEGs

packages/
├── contracts/               # @clever/contracts — imports nothing from apps (V)
│   ├── package.json         # "exports": "." + one subpath per folder (@clever/contracts/offer, …)
│   └── src/
│       ├── index.ts         # root barrel
│       ├── common/          # money, pagination, DomainError hierarchy           (each folder has index.ts)
│       ├── listing-package/ # schemas, views (AgentPackageView, InvestorPackageView), status map
│       ├── investor/  buy-box/  match/  offer/  deal/  brand/
│       ├── events/          # outbox event discriminated union
│       ├── ops/  config/  auth/
│       └── client/          # typed REST client used by apps/web BFF
├── core/                    # server-only domain core (research R22)
│   ├── package.json         # "exports": "@clever/core" (ports, services) + "@clever/core/adapters" (impls)
│   ├── test/                # InMemory*Repository + Fake* providers (unit), integration/*.int.test.ts
│   ├── prisma/              # schema.prisma, migrations/, seed.ts
│   └── src/
│       ├── index.ts                 # barrel: ports, services, workflows, domain types, errors — NO impls
│       ├── adapters.ts              # barrel: every *Impl and client factory, e.g. PostgresDatabaseImpl, createRedisClient (container.ts only)
│       ├── services/<entity>/       # noun services + I<Entity>Service interfaces
│       ├── workflows/               # verb services: publication, matching, decision, deal-lifecycle, investor-import
│       ├── repositories/<entity>/   # vertical slice per entity:
│       │                            #   I<Entity>Repository.ts (port) · Prisma<Entity>RepositoryImpl.ts (adapter)
│       │                            #   <entity>.mapper.ts (only place Prisma types appear) · index.ts
│       │                            # entities: listing-package, seller, property, photo, investor, buy-box,
│       │                            #   match, offer, decision, deal, job, outbox, delivery, notification,
│       │                            #   audit, config, brand, import
│       ├── unit-of-work/            # IUnitOfWork + IDatabase (ports), PrismaUnitOfWorkImpl (one interactive tx), PostgresDatabaseImpl
│       ├── providers/<port>/        # I<Name>Provider.ts (port) + <Vendor><Name>ProviderImpl.ts
│       │                            #   crm, messaging, storage, geo, simulation, error-reporter, clock, pii-cipher
│       ├── registry/                # Criterion Registry evaluators + EVALUATOR_VERSION + toListingFacts (XIX)
│       ├── jobs/                    # Job envelope, claim/reclaim, handler registry
│       ├── outbox/                  # writer (inside uow), relay, delivery dispatcher
│       └── errors/                  # InfrastructureError + translators shared by api/worker
├── ui/                      # @clever/ui — design system (client-side; no brand values)
│   └── src/
│       ├── tokens/          # semantic token names (as const) + contrast checker
│       ├── styles/theme.css # Tailwind 4 @theme: semantic utilities → CSS variables
│       ├── primitives/      # React Aria: Button, TextField, Select, Dialog, Table, Tabs, Badge, Toast, …
│       ├── patterns/        # FormSection, MoneyField, StatusTimeline, ComparisonTable, Empty/Loading/Error
│       └── templates/       # AppShell, ListPage, DetailPage, Wizard, Comparison, Timeline
└── config/                  # shared tsconfig, eslint (boundary + no-raw-style-values rules), vitest presets

apps/
├── api/                     # Express 5 HTTP API
│   └── src/
│       ├── env.ts           # Zod env schema; fail fast on missing/invalid vars (XII)
│       ├── container.ts     # composition root: createContainer(env) — the only wiring point (R22)
│       ├── app.ts           # createApp(container): fixed middleware order (R3) + mounts router factories
│       ├── server.ts        # parse env → createContainer → createApp → listen 0.0.0.0:4000; graceful dispose
│       ├── middleware/      # trace, authenticate, idempotency (PostgreSQL key store), not-found, error-translator
│       └── routes/          # create<Resource>Router(services) factories; translation-only per contracts/api.md
├── worker/                  # durable job runner + outbox relay + BullMQ consumers
│   └── src/
│       ├── env.ts
│       ├── container.ts     # wires job handlers, relay, ICrmProvider/IMessagingProvider (by CRM_PROVIDER, MESSAGING_PROVIDER)
│       ├── main.ts          # parse env → createContainer → start loops; graceful shutdown
│       ├── error-translator.ts
│       └── loops/           # job-poller, outbox-relay, delivery-consumers
├── sandbox/                 # stand-in CRM / messaging / storage / simulation
│   └── src/  (container.ts, routes/, inspect-page.ts)
└── web/                     # Next.js App Router — client + BFF only, never Prisma
    └── src/
        ├── container.ts     # contracts client + brand content wiring
        ├── app/
        │   ├── page.tsx                # home: demo explainer + accounts
        │   ├── (agent)/  (investor)/  (ops)/
        │   └── bff/[...path]/route.ts  # cookie → bearer proxy (await params)
        ├── app/design-system/page.tsx  # living style guide + brand switcher (FR-097)
        ├── features/<area>/ # feature screens built from packages/ui templates + hooks
        ├── brand/           # resolve brand once (host/cookie) → render CSS variables on <html>
        └── providers.tsx    # QueryClientProvider + coordination contexts

tests (co-located):
  packages/core/src/**/*.test.ts              # unit
  packages/core/test/integration/*.int.test.ts  # integration (Testcontainers)
  packages/contracts/src/**/*.test.ts         # contract tests (PII-free schemas)
  apps/web/src/**/*.test.tsx                  # hook tests
```

**Structure Decision**: A Turborepo web-application layout matching Constitution XXI (api,
worker, and web apps plus shared contracts), with the server-only `packages/core` that XXI.3
requires. Two additions:
- The `apps/sandbox` stand-in workspace, which the assignment's "no outside accounts" rule makes
  necessary.
- The client-side `packages/ui` design system. It is shared so Clever's other portals can adopt
  it, it imports only `@clever/contracts` types, and it holds no brand values.

## Anti-Corruption Layer (ACL) & Boundary Insulation

External integrations (HubSpot, Google Sheets, object storage such as S3, email and SMS) sit
behind an **anti-corruption layer at the perimeter** of the application:
- `@clever/core` depends only on our own contracts: the port interfaces (`ICrmProvider`,
  `IStorageProvider`, `IMessagingProvider`, ...) and the Zod schemas in `@clever/contracts`.
- Vendor quirks are handled inside one adapter class each (`*Impl`) and translated into our
  own types and `InfrastructureError`:
  - model and enum mapping (our package status → HubSpot deal stage; legacy sheet columns →
    buy box criteria);
  - rate limits, timeouts, and HTTP errors;
  - response validation;
  - ordering (`409 STALE`, or `lastSyncedAt` in a HubSpot adapter).
- Each adapter is tested against its port contract. Lint keeps `*Impl` imports in
  `container.ts` only.

This is what enables the **strangler fig migration**: legacy tools shrink one capability at a
time (Sheets → investor list, Zapier → outreach, HubSpot deal stages → transaction status)
while the core logic stays untouched. Each step is gated by parity evidence, such as the CRM
comparison screen. The full adapter table and migration steps are in
[research.md](./research.md) R23.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| **XXI.1** says `apps/api` "owns … the Prisma schema, and migrations"; this plan puts `schema.prisma` and the migrations in `packages/core/prisma`. | XXI.3 requires the domain services and repositories shared by api and worker to live in a server-only package, and those repositories need the generated Prisma client. Only the `migrate` step started with the API image applies migrations, so in practice `apps/api` still owns schema changes. | Keeping the schema in `apps/api` would force `packages/core` or `apps/worker` to import from `apps/api`, which XXI.3 forbids. Duplicating the schema per app guarantees drift. **Recommended constitution PATCH**: reword XXI.1 to "owns running migrations; the schema lives in the shared server-only package". |
| **XII** requires PII encrypted in transit (TLS); the prototype serves plain HTTP on `localhost` and between containers on the private Compose network. | The reviewer must start everything with one command and no certificates or outside accounts (FR-001); browsers treat `http://localhost` as a secure context, so Secure cookies still work. | Self-signed TLS would show certificate warnings and need trust setup on the reviewer's machine. **Production**: TLS terminates at the load balancer or ingress, and service-to-service traffic uses TLS or a mesh with mTLS. |
| An additional workspace, `apps/sandbox` (beyond the api, worker, web, and contracts listed in XXI). | FR-005 and the assignment forbid outside accounts, while XIV, XVIII, and FR-075 need real network failure modes to demonstrate. | In-process fakes cannot show timeouts, 503s, malformed responses, or idempotent receivers across a process boundary. Third-party mock containers (MinIO, WireMock) cost memory the 2 GB limit cannot spare. |
| An S3 storage adapter (T274–T275) that the demo never selects, against "build only what the current task uses" (CLAUDE.md) (approved by the owner, Tarun, 2026-11-01). | The owner wants the prototype to show that storage is swappable: the same `IStorageProvider` port, a second real adapter, and a one-line switch in the api container. The sandbox stays the default, so the reviewer needs no outside account (FR-005). | Describing the swap in the design doc only: it shows the port, not a working second adapter. |
| **XX.2** requires the idempotency middleware on every mutating api endpoint (POST, PUT, PATCH), with Redis as the key store and Postgres only as an outage fallback. Sprint 1 shipped `POST /sessions`, package create and `PATCH`, and photo add and remove without it (approved by the owner, as VP of Engineering, 2026-10-31). Sprint 2 adds it (T284–T285) with **Postgres as the primary key store** (approved by the owner, as VP of Engineering, 2026-10-31). | The owner keeps Redis out until the worker's queues need it (T082). Sprint 2 brings offers and publishing, where a retried request must return its original answer. The Postgres store keeps XX.2's guarantees: a unique key per user, the stored response, an in-progress marker (409 with `Retry-After: 1`), 422 for a reused key with a different body, and fail-closed behavior (a store error → 503 with `Retry-After: 5`). Sign-in (`POST /sessions`) is not covered: it has no user to key on, and a replay would store a session token (proposed in T285, 2026-11-01; awaiting the owner's approval). The middleware covers POST, PUT (the buy box save, T323), and PATCH, every mutating method the api has. **Production path:** move the store to Redis with T076–T077 when Redis returns, keeping the same middleware contract. | Waiting for Redis would leave offers and publishing without replay protection; adding Redis now for this alone adds a service to the 2 GB build. |
| **XIX.3–XIX.4** require a SQL pre-filter fragment for every criterion, derived from the registry, and a property-based test that it never drops a match; Sprint 2's stage 1 narrows only by the hard cuts (investor active, proof of funds unexpired, box active) and geography (approved by the owner, as VP of Engineering, 2026-10-31). | Matching must ship in Sprint 2 with all 13 criteria evaluated (XIX.3's definition and evaluator layers are complete). A narrower pre-filter cannot drop a match: every box that passes the hard cuts and geography goes to the full evaluator. The per-criterion fragments and the fast-check property (T052, T217) come when the number of buy boxes makes a full evaluation slow. | Writing the fragments and the property test now costs about a day of the 48 hours and buys no correctness at a few hundred buy boxes. |
| **XII and FR-074**: match decisions are recorded as MATCH_DECISION audit entries, not in the append-only MatchEvaluation table, and "why not matched?" replay is not built (approved by the owner, as VP of Engineering, 2026-10-31). | Each entry holds what XII asks for (timestamp, actor SYSTEM, action, outcome) plus the matched boxes and versions, the listing version, `EVALUATOR_VERSION`, and every criterion's result, with no PII, so every positive decision is auditable. **Production path:** the MatchEvaluation table and replay (T121, T126) when operations needs to answer why an investor was not matched. | A separate table now would duplicate the audit entry until the replay feature that reads it exists. |

## Prototype Shortcuts (FR-006 — repeated in the README)

| Shortcut | Production approach |
| --- | --- |
| Encryption key and JWT secret committed in `.env` | KMS or a secrets manager; key rotation via the cipher's key-version prefix |
| Each listing package has its own Property row; rows for the same physical home are linked only by `addressHash` | A shared physical-home record (parcel or APN) linking every listing of one house |
| A homeowner who sells a second property becomes a second Seller record | Identity resolution that links or merges duplicate sellers |
| Each listing package has its own Seller row (`ListingPackage.sellerId` unique), so one homeowner's sales are not grouped | A Person or Contact record that groups a homeowner's per-listing Seller rows, so the seller dashboard can sign them in once and show every sale; the same pattern as the physical-home record for Property |
| One login per investor (User ↔ Investor is 1:1) | Several Users per investor company, with offers and audit entries recording the acting user (for example `submittedByUserId`) |
| No seller access; the agent presents offers | Read-only seller dashboard: a SELLER role and unique `User.sellerId`, magic-link sign-in (so `passwordHash` becomes nullable or moves to a credentials table); Seller data unchanged |
| Email/password demo auth, 8 h JWT, no refresh, revocation, or MFA | SSO for agents and ops (Okta/Google), magic link or passkeys for investors, short-lived tokens with rotation |
| Sandbox stand-ins for CRM, email/SMS, storage | HubSpot, SendGrid/Twilio, and S3 provider implementations behind the same ports (S3 storage is T274–T275, after Sprint 1) |
| Listing photos are public: anyone with a photo's link can open it, and the link never expires (the owner's decision, 2026-11-01, T326). Import files stay private. | A private bucket served through a CDN with signed cookies, or an app address that checks access and redirects to a short-lived link, so a leaked link stops working and access can be withdrawn |
| Brands live in the database and are chosen per request by cookie, host, or `DEFAULT_BRAND_ID`, but emails and texts always carry the default brand's name, the brand's font must be registered in the web app's code to load, and content and hosts change only through the seed files (Sprint 7, T346–T353) | Each agent and investor belongs to a brand, so messages carry that brand; brand fonts are self-hosted files stored with the brand; content, hosts, and logos are edited in the console with design review; the theme CSS is served as a cached, versioned stylesheet from a CDN |
| Static ZIP code list for the seeded markets | Address validation and geocoding provider |
| `LogErrorReporterImpl` instead of Sentry | Sentry provider plus alert routing for needs-attention deliveries |
| Tracing is a W3C `traceparent` trace ID carried in an `AsyncLocalStorage` request context and written as `trace_id` on every log line, with no spans, metrics, or dashboards | The OpenTelemetry SDK with HTTP, Express, and Postgres instrumentation reading the same context and header, exporting traces to a collector (Jaeger or Tempo); Prometheus metrics (request latency and errors, job queue depth and age, failed jobs, match run time) with Grafana dashboards and alerts |
| Single PostgreSQL instance; the sandbox shares the server (separate schema) | Managed PostgreSQL with backups, read replica, and PITR; the sandbox does not exist in production |
| Redis without persistence or HA | Managed Redis with AOF; the outbox in PostgreSQL already covers Redis loss |
| Milestones entered manually by the agent | Title and escrow integrations as events |
| Two brands seeded from JSON files (Clever and a fictional partner) | Brand onboarding through the ops theme API and the content/config layer, with design review |
| The web app's Content-Security-Policy forbids framing, plugins, and outside form posts, but not inline scripts or styles (T362) | A nonce-based CSP set per request in proxy.ts (`script-src 'nonce-…' 'strict-dynamic'`), with the brand's style element carrying the nonce |
| No rate limiting. CSRF is covered by a SameSite=Lax cookie plus an `Origin`/`Host` check on every state-changing BFF route (meets XII), but there are no synchronizer tokens. | Edge rate limits and a WAF; add double-submit CSRF tokens if the BFF is ever exposed cross-site |
| Plain HTTP (no TLS) on localhost and the Compose network (see Complexity Tracking) | TLS at the load balancer or ingress; mTLS between services |
| No horizontal scaling tests | Multiple worker replicas are already safe (`SKIP LOCKED`, unique constraints); load test before launch |
| "Why not matched?" replays non-matches with the current evaluator and flags `replayedWithNewerRules` when the rules changed since matching ran | Keep every released `EVALUATOR_VERSION` runnable (versioned evaluator modules) so old decisions replay exactly |
| A buy box save re-matches against every package still accepting offers in one job; the near-miss summary replays recent listings in memory on request | Incremental matching by changed criteria, and near-miss counts precomputed in a reporting table |
