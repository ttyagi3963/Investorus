# Clever Platform Software Engineering Constitution

Sixteen core principles and five platform extensions governing architecture, layering,
validation, durability, configurability, white-labeling, accessibility, security, and
testing for a production-grade proptech marketplace (Clever Offers / Investor Platform)
built with Next.js, TypeScript, Prisma, and Tailwind CSS. New code MUST conform to these
principles. Existing code that violates them is technical debt to be corrected. The principles are
framework-aware but survive framework changes.

## Core Principles

### I. Hexagonal Architecture

The system follows hexagonal architecture (ports and adapters). Dependencies always point
inward.

```text
Innermost                                    Outermost
contracts → services → repos/providers → infrastructure
(domain)   (use cases) (ports+adapters)   (DB, APIs, FS)
```

- Inner layers MUST NOT import from outer layers.
- Contracts import nothing from the application.
- Services import contracts and repository/provider interfaces.
- Repositories import contracts only; they MUST NOT call services.
- Routes import services from the composition root only.
- Generic modules MUST NOT import feature modules.
- Each runnable application (`apps/api`, `apps/worker`, `apps/web`) has exactly one
  **composition root** (`src/container.ts`) that wires that application's own adapters
  and ports via manual constructor injection — no DI framework, no decorators, no
  runtime reflection. Applications MUST NOT import each other's composition roots.
- Server-only code and client-only code are physically separated. The `"use client"`
  directive marks the boundary.
- Each domain entity is organized as a **vertical feature slice**: its contracts in
  `packages/contracts/src/entity/`, and its repositories and services under
  `repositories/entity/` and `services/entity/` in server-side code (see Principle XXI).
- Barrel exports (`index.ts`) define the public API of each contracts subfolder.

**Rationale**: Hexagonal architecture keeps the domain independent of frameworks, enabling
testability and swappable adapters.

### II. Thin Delivery Layers

Route handlers and API endpoints are **translation-only**. They:

1. Extract parameters and request body.
2. Call exactly one service method.
3. Translate the result into an HTTP response.
4. Delegate errors to the centralized error translator.

Route handlers MUST NOT contain business logic, validation, database queries, or
conditional branching beyond error delegation.

5. RESTful resources use nouns. Actions use HTTP verbs. Nested resources reflect
   ownership.
6. Correct status codes: GET→200, POST→201/202, PATCH→200, PUT→200, DELETE→204.
7. Long-running work MUST return `202 Accepted` with a job handle and process in a
   background worker.
8. Error responses follow the `{ "error": "message" }` shape.
9. Framework-specific parameter handling is scoped by workspace (Principle XXI):
   - `apps/web` (Next.js App Router) Route Handlers and Server Actions are
     Backend-For-Frontend (BFF) proxy adapters. They MUST use `await params` per
     Next.js 15+/16 conventions, and in rule 2 "one service method" means one
     `@clever/contracts` client call to `apps/api`.
   - `apps/api` (Express/Fastify) route handlers use the framework's standard parameter
     parsing (`req.params`, `req.query`, `req.body`).
   - Rules 1–8 apply equally to both workspaces.
   - Cross-cutting request concerns (e.g., `Idempotency-Key` enforcement, Principle
     XX.2) run in shared middleware before the handler, never inside it.

**Rationale**: Thin routes are trivially auditable and guarantee business logic runs
identically regardless of entry point.

### III. Services Own Business Logic

Services are the **single enforcement point** for business rules. They:

1. Accept `unknown` input and validate with Zod schemas.
2. Enforce preconditions and invariants.
3. Orchestrate repositories and providers through interfaces.
4. Return domain objects.
5. Throw domain errors (`NotFoundError`, `BusinessRuleError`), never infrastructure
   errors.
6. **Noun services** (listing, offer) handle CRUD on a single entity.
7. **Verb services** (seller onboarding, offer matching) orchestrate workflows across
   entities.
8. Noun and verb services MUST be separate services.

**Rationale**: Centralizing business logic in services ensures consistent enforcement
across HTTP, workers, CLI, and tests.

### IV. Repositories and Providers as Adapters

Repositories and providers are infrastructure adapters behind interfaces.

**Repositories** translate domain operations into database calls (Prisma/SQL). They map
ORM types to/from domain entities using explicit mappers. The mapper is the **only place**
ORM types appear. Repositories:

- Manage transactions when multiple writes MUST be atomic.
- MUST NOT contain business logic or call services.

**Providers** wrap external vendor SDKs. They:

- Implement a domain-defined interface.
- Throw `InfrastructureError` on failure, never raw SDK exceptions.

**Database rules** (enforced in schema, not only in app code):

- `onDelete: Cascade` for parent-child relationships.
- Explicit join tables for many-to-many (not JSON arrays).
- CUID primary keys. JSONB for polymorphic payloads.
- `createdAt`/`updatedAt` on every mutable entity.
- Indexes follow actual query patterns only.

**Rationale**: Adapters behind interfaces enable vendor and storage portability without
touching domain or delivery code.

### V. Contracts as Source of Truth

The shared workspace package `packages/contracts` (`@clever/contracts`) is the semantic
source of truth for every domain shape. All layers and all applications import types and
schemas from it. ORM-generated types MUST NOT leak past the
repository boundary.

- Enum-like values: `as const` arrays. TypeScript union derived via `typeof`. One
  definition serves runtime and compile time.
- Create and update schemas MUST be separate. Update schemas preserve the `undefined` vs.
  explicit-value distinction.
- `import type` for type-only imports.
- `satisfies` on object literals before Zod `parse()`.
- Discriminated unions derived from `const` arrays + `typeof`.

**Naming vocabulary**:

| Thing           | Convention             | Example                        |
| --------------- | ---------------------- | ------------------------------ |
| Interfaces      | `I` prefix             | `IOnboardingService`           |
| Implementations | `Impl` suffix          | `PrismaOfferRepositoryImpl`    |
| Schemas (Zod)   | `Schema` suffix        | `createOfferSchema`            |
| Domain types    | PascalCase             | `OnboardingSession`            |
| Mappers         | `to` prefix            | `toOffer()`                    |
| Enum arrays     | `SCREAMING_SNAKE`      | `SESSION_STATUSES`             |
| Enum types      | PascalCase singular    | `SessionStatus`                |
| Hooks           | `use` prefix           | `useOnboardingFlow`            |
| Contexts        | `Context` suffix       | `OnboardingContext`            |
| Providers       | `Provider` suffix      | `ThemeProvider`                |
| Errors          | `Error` suffix         | `NotFoundError`                |
| Routes          | Lowercase plural nouns | `/api/onboarding-sessions/:id` |
| Env vars        | `SCREAMING_SNAKE`      | `DATABASE_URL`                 |
| Tests           | `.test.ts` suffix      | `onboarding.test.ts`           |

**Rationale**: Domain types as single source of truth prevent schema drift between layers
and eliminate integration bugs.

### VI. Validate at Trust Boundaries

- Services accept `input: unknown` and validate with Zod before any business logic. This
  is the **single enforcement point**.
- Route handlers MUST NOT validate — the service handles it.
- Every trust boundary receiving external data (API input, webhooks, job payloads,
  third-party responses) MUST validate with a runtime schema. TypeScript types alone are
  insufficient.
- Use `satisfies` on literals passed to validators to catch structural mismatches at
  compile time.

**Rationale**: Boundary validation prevents invalid data from propagating while keeping
internal code free of redundant checks.

### VII. Centralized Error Handling

Two error hierarchies:

| Hierarchy | Base Class            | Layer          | Purpose                   |
| --------- | --------------------- | -------------- | ------------------------- |
| Domain    | `DomainError`         | Contracts      | Expected business rejects |
| Infra     | `InfrastructureError` | Infrastructure | Platform failures         |

- Each error carries its HTTP status as a `readonly` property.
- **HTTP error translator**: a single translator per HTTP application converts all errors
  to HTTP responses: validation→400, domain→the error's status, everything else→500 +
  log.
- **Worker error translator**: background consumers (`apps/worker`, durable jobs and
  BullMQ queues) MUST route unhandled exceptions, transaction rollbacks, and DLQ
  movements through a worker error translator. It classifies errors the same way, logs
  structured context (`trace_id`, `job_id`, job `type`, and the payload with PII
  redacted per Principle XX.1), and triggers Sentry alerts exactly as HTTP errors do.
- Services throw domain errors. Adapters throw infra errors. Routes and worker handlers
  catch and translate only.
- **Two separate log streams**:
  - **System error logs** (Sentry, structured diagnostic logging) record operational
    failures. Expected domain errors (e.g., a Buy Box non-match, a 404) are NOT written
    here. Unexpected errors are ALWAYS written here.
  - **Domain audit logs** (Principle XII) are immutable database records of business
    decisions and state transitions. They are written whenever an audit-sensitive
    decision occurs, including expected rejections, and are independent of error
    logging.
- Production responses MUST NOT leak internals.
- Custom error classes MUST include `this.name = new.target.name`.

**Rationale**: Centralized error classification ensures consistent API responses and
prevents internal detail leakage, while separating diagnostics from audit records keeps
error alerting quiet and the compliance trail complete.

### VIII. Durable Workflow Design

Long-running and multi-step work MUST be tracked as durable job records in the database.
In-memory-only tracking is forbidden for any operation that survives a page refresh or
takes more than a few seconds.

**Scope**: PostgreSQL durable jobs own transactional entity state transitions, audit
history, and internal workflow tracking — any work that needs ACID guarantees alongside
application data. Delivery of outbound events to external systems (webhooks, CRM, SMS) is
NOT handled here; it belongs to the outbox event bus (Principle XVIII).

- State machine: `QUEUED → PROCESSING → COMPLETED | FAILED`.
- Generic job envelope: `type`, `status`, `progress`, `error`, `payload` (JSONB),
  `result` (JSONB). The job system MUST NOT import feature-specific types.
- Background work runs in a **separate worker process** (`apps/worker`), with failures
  handled by the worker error translator (Principle VII).
- Idempotency: duplicate in-progress jobs MUST be prevented by a database unique
  constraint (e.g., a partial unique index on `type` + `idempotencyKey` where `status` is
  `QUEUED` or `PROCESSING`). An application-level "check then insert" alone is
  insufficient because concurrent requests can race past it; the insert relies on the
  constraint and treats a conflict as "job already exists".
- Preflight: cheap failure checks run synchronously in the HTTP request before enqueue.
- Retry: jobs track `retryCount` and `maxRetries`.

**Rationale**: Database-backed durable workflows survive restarts and provide transactional
guarantees alongside application data, with no external queue needed for internal
workflow state.

### IX. Config-Driven Marketplace Engine

The seller onboarding flow, offer programs, fee schedules, investor Buy Box criteria, and
offer terms MUST be driven by configuration — not hard-coded in application logic.

- Offer program definitions (program types, fee schedules, Buy Box criteria) live in a
  configuration layer (database seeds, admin API, or config files) and are read at
  runtime by services.
- Onboarding step sequences, conditional branching, and step metadata MUST be defined
  declaratively so new flows can be added without code changes.
- Buy Box matching and disqualification rules are expressed as evaluable conditions
  against listing and user data, not `if/else` chains in service code (see
  Principle XIX).
- Fees, commissions, and offer terms are config entries resolved when an offer is
  generated or presented.

**Rationale**: A config-driven engine allows product, operations, and business teams to
iterate on flows and offer programs without developer intervention for every change.

### X. White-Label Separation

The platform MUST support multiple brands from a single codebase with no brand-specific
`if/else` in business logic.

- **Theming**: CSS custom properties define brand tokens (colors, typography, spacing).
  Tailwind classes consume these properties. Switching brands means swapping the token
  set.
- **Content**: Brand-specific copy, legal text, images, and logos are resolved from a
  content layer keyed by brand identifier. Components receive content via props or
  context, not hardcoded strings.
- **Configuration**: Brand-specific offer programs, Buy Box criteria, and onboarding
  flows are scoped by brand ID in the configuration layer.
- **Routing**: Brand detection occurs once at the edge or layout level and propagates via
  context. Downstream components and services receive the brand identifier — they never
  detect it themselves.

**Rationale**: Clean brand separation enables scaling to new partners and white-label
deployments without forking the codebase.

### XI. Accessibility and UX Quality

- All interactive components MUST use **React Aria** patterns for keyboard navigation,
  screen reader support, and ARIA attributes.
- Shared UI primitives (buttons, inputs, dialogs) MUST be purely presentational — driven
  by props, no business logic, no data fetching. They form a design system with semantic
  tokens.
- Complex behaviors (debouncing, form state, keyboard shortcuts) MUST be encapsulated in
  custom hooks. Components compose hooks.
- Components that need DOM access MUST accept `ref` as a regular prop (React 19+).
  `forwardRef` MUST NOT be used in new code; existing uses are technical debt to be
  migrated.
- The onboarding flow MUST be navigable by keyboard alone and announce step transitions
  to screen readers.
- Error states, loading states, and empty states MUST have dedicated, accessible UI
  treatments — never silent failures.

**Rationale**: WCAG-compliant, accessible UX is a legal and ethical requirement for
consumer-facing real estate products and builds trust with sellers, agents, and
investors.

### XII. Security, Privacy, and Auditability

- Production error responses MUST NOT leak stack traces, database errors, or file paths.
  The error translator returns generic messages for unexpected errors.
- Each application's composition root validates all of its required environment
  variables at startup and fails fast on missing configuration.
- Authentication tokens MUST be stored in HTTP-only, secure, same-site cookies with
  configurable expiration. In `apps/web`, the BFF layer (Principle XXI) owns setting and
  reading these cookies; browser code never handles raw tokens.
- Any money movement (e.g., investor fees, agent referral payouts) MUST go through a
  payment provider's hosted or tokenized flow behind a provider interface (Principle XIV).
  Raw card numbers and bank account numbers MUST NOT touch the application server.
- All user inputs MUST be validated and sanitized to prevent injection attacks (SQL
  injection, XSS, CSRF).
- Seller PII and financial transaction records MUST be encrypted at rest in PostgreSQL
  (AES-256, e.g., Prisma field-level encryption) and in transit (TLS). Masking for
  external audiences happens at the outbound boundary (Principle XX.1).
- Audit-sensitive operations (offer submission and acceptance, Buy Box match decisions,
  payment events, PII access, entity state transitions) MUST write an immutable
  **domain audit log** record to the database with timestamp, actor, action, and
  outcome. Domain audit logs are separate from system error logs (Principle VII).
- Observability hooks (Sentry, structured logging) integrate at the unexpected-error
  branches of the HTTP and worker error translators only (Principle VII) —
  `console.error` MUST NOT be scattered across the codebase.

**Rationale**: A marketplace handling seller PII and financial transactions demands
defense-in-depth security, data privacy, and auditable decision trails.

### XIII. State Management Discipline

Server state and client state use different tools:

| State Type   | Tool                      | Examples                         |
| ------------ | ------------------------- | -------------------------------- |
| Server       | React Query               | Entities, lists, statuses        |
| Coordination | React Context             | Selected item, dialog visibility |
| Local        | `useState` / `useReducer` | Input values, hover state        |

- Cache keys: `["entity", id]`. Invalidation is explicit.
- Optimistic updates for high-frequency, low-stakes mutations only. Never for offer
  submissions, payments, or deletions.
- Each concern gets its own context, composed in a single `Providers` wrapper. Consumed
  via custom hooks, never raw `useContext`. Context MUST NOT duplicate server cache data.
- `QueryClientProvider` lives in `providers.tsx` at the app root.

**Rationale**: Separating server state from coordination state prevents cache
inconsistencies and keeps concerns independently testable.

### XIV. Integration Boundaries

Every external service (payments, AI APIs, email, SMS, CRM, cloud storage, future property
data and valuation feeds) MUST be behind a provider interface. Swapping vendors requires
only a new implementation and a composition root change.

**Storage**:

- All file operations go through a storage interface (local FS and cloud behind the same
  contract).
- Large uploads use presigned URLs — they MUST NOT proxy through the server.
- Environment variables drive backend selection; the composition root validates them at
  startup.

**Rationale**: Provider and storage abstractions enable vendor portability without
touching domain or delivery code.

### XV. Testing Priorities

Two explicit test tiers, kept in separate suites:

- **Unit tests (fast, offline)** — tests inject mock repos and providers into services
  via their interfaces. Unit tests MUST NOT require a running DB, network, or
  filesystem.
- **Integration tests (ephemeral PostgreSQL)** — run against a real, throwaway
  PostgreSQL container (Docker / `testcontainers`). They MUST verify Prisma schema
  migrations, constraints and cascade deletes, atomic transactions (`BEGIN ... COMMIT`),
  outbox table persistence (Principle XVIII), and job unique constraints
  (Principle VIII). Integration tests MUST NOT call real external vendors; providers
  stay mocked.
- **Hook testing** — `renderHook` validates state transitions without full component
  rendering.
- **Deterministic async** — every test whose outcome depends on time (deadlines, offer
  expirations, timeouts, retry backoff, scheduled jobs) MUST control time: domain code reads
  time from an injected clock port (a fake clock in tests), and timer-driven code runs under
  `vi.useFakeTimers()` (e.g., `{ toFake: ["setTimeout", "setInterval", "Date"] }`) enabled
  in that file's `beforeEach` and restored with `vi.useRealTimers()` in `afterEach`. Global
  fake timers (in shared Vitest config or setup files) are prohibited, because they leak timer
  state across suites and stall real I/O such as Testcontainers. Tests with no time
  dependence run on real timers. Flaky timing-based tests (real sleeps, wall-clock
  assertions) are not acceptable.
- **Coverage priority**:
  1. Business logic in services (highest value).
  2. Infrastructure abstractions (highest risk).
  3. Job execution and onboarding engine (hardest to debug).
- Do NOT over-test framework internals, presentational components, or type-level code.
  Test behavior, not implementation details.
- **Test selection: only rules that matter get a test.** A test MUST guard a rule whose
  silent breakage would matter: a security or privacy guarantee (no PII, hashes, or secrets
  in views, events, or logs), a data invariant (a database CHECK or unique rule), a field
  that must not change, a business rule a service owns, or a security limit. Before writing
  a task's tests, list the rules the task introduces and keep only those; each rule gets
  one test.
  - Tests MUST NOT re-test library or framework behavior (Zod parsing and stripping,
    `.partial()`, Prisma, React), what the type checker already rejects, cosmetic
    normalization (trimming, casing), or a rule another test already covers.
  - Exact-boundary pairs (40 vs 41 characters) are written only when the boundary is
    itself the rule.
  - A rule that guards a feature the product does not have yet (for example a password
    limit when there is no sign-up) gets its test when that feature arrives.
  - A test that is weak or redundant is deleted, not kept as a precaution.
  - A schema file gets tests only for the rules it encodes; behavior is tested once, in the
    service that owns it.

**Rationale**: Interface-based mocking keeps the unit suite fast and verifies behavior
without infrastructure coupling, while a real ephemeral database proves the guarantees
that only the database can provide. A small suite of tests that each guard a real rule is
read, trusted, and kept green; padding hides the tests that matter and slows every change.

### XVI. Brand-Safe Implementation

All implementation decisions MUST preserve the ability to deploy the platform under
different real estate brands and partners.

- No hardcoded brand names, colors, logos, or legal copy in source code. These are
  resolved from the content and theming layers (Principles X and IX).
- Feature flags and brand-scoped configuration gates control feature availability per
  brand.
- Domain models are brand-agnostic. Brand context is metadata on sessions, listings, and
  offers, not a branching condition in business logic.
- Test fixtures MUST use synthetic brand identifiers, never real partner names.

**Rationale**: Brand safety protects partner relationships and ensures the platform scales
to new deployments without codebase forks.

## Platform Extensions: Clever Investor Platform

The following extensions supplement the core principles specifically for the Clever
Offers / Investor Platform microservices and AI-assisted workflows. They extend without
modifying Principles I–XVI.

### XVII. AI-Augmented Engineering Guardrails

1. **SpecKit Before Generation**: AI coding assistants (Claude Code, GitHub Copilot) MUST
   NOT generate application code from unguided prompts. Every feature implementation MUST
   be preceded by a structured specification file in `specs/<NNN-feature>/spec.md`
   generated via GitHub SpecKit (`specify-cli`).
2. **TDD Verification Loop**: All code — AI-generated and human-written alike — MUST
   follow the red-green-refactor cycle (failing test first, then implementation, then
   refactor) and MUST pass the automated test suites — unit tests via `pnpm test`, plus
   the integration tier (Principle XV) in CI — before being submitted for code review.
3. **The "Human Judge" PR Review Gate**: Senior technical leads review Pull Requests
   acting strictly as "Human Judges" — evaluating code for architectural boundary
   alignment, domain separation, and security compliance rather than mechanical syntax
   details.

**Rationale**: Specs and tests constrain all code, AI-generated or not, to verified intent,
so human review can focus on judgment calls that automation cannot make.

### XVIII. Transactional Outbox Pattern & Event Reliability

1. **Atomic State & Outbox Writes**: Any domain operation that modifies database state and
   requires an outbound event (publishing webhooks, updating HubSpot/Zapier, sending SMS)
   MUST write both the entity state change and the outbox event in the same atomic
   database transaction (`BEGIN ... COMMIT`).
2. **Decoupled Queue Workers**: Background queues (Redis + BullMQ), running in
   `apps/worker`, MUST asynchronously read from the transactional outbox table. If an
   external service experiences an outage, BullMQ workers retry with exponential backoff
   and route unrecoverable failures to a Dead-Letter Queue (DLQ) without corrupting
   primary database state.
3. **Scope**: Redis + BullMQ is the outbox event bus for high-throughput outbound
   delivery to external systems (webhooks, HubSpot, Zapier, SMS) only. Internal workflow
   state, entity transitions, and audit history stay in PostgreSQL durable jobs
   (Principle VIII).

**Rationale**: The outbox guarantees no event is lost or emitted for a rolled-back change,
while queue workers absorb external API retries so vendor outages never load the primary
PostgreSQL database.

### XIX. Criterion Registry for Buy Box Rules

1. **Config-Driven Buy Boxes** (extending Principle IX): investor acquisition criteria
   (geography, price limits, property types, conditions, repair limits, closing speed,
   offer programs) MUST NOT be hard-coded as `if/else` chains in service code.
2. **Criterion values are data**: buy box values MUST be stored in typed, constrained
   relational columns (and indexed child tables, such as buy box geography), so investors
   and operations change them without a code deployment. The database MUST enforce the
   value rules it can express (ranges, non-empty lists).
3. **Criterion types are defined once**: every criterion type MUST be declared in a single
   Criterion Registry keyed by one shared list of criterion keys. A criterion's label,
   validation schema, and form metadata live in shared contracts (Principle V); its
   evaluator predicate, audit explanation, and SQL pre-filter fragment live in server-only
   code, with SQL kept in adapters (Principle IV). Each layer MUST be typed as a record
   over the full key list, so a criterion missing from any layer fails the build. No
   criterion behavior may be defined outside the registry.
4. **Safe pre-filtering**: a SQL pre-filter derived from the registry MAY return extra
   candidates but MUST NEVER exclude a buy box the full evaluator would match. A
   property-based test MUST enforce this, including null criteria and missing listing
   values.
5. **Rules-as-data reserved**: stored rule trees and runtime rule interpreters (for example
   JSON Logic) are reserved for a future need where non-engineers author computed rules,
   such as yield formulas. Introducing them requires an amendment to this principle.

**Rationale**: Clever's investor application and seller intake use a fixed set of criteria
and no user-authored formulas. Typed columns keep criterion values editable at business
speed, with database constraints and plain-SQL reporting. Defining each criterion once keeps
validation, pre-filtering, evaluation, and audit text from drifting apart. Adding a new
criterion type needs a new listing field and form input in any design, so a stored rule tree
would not remove the code change.

### XX. Data Boundary Security & PII Protection

1. **Store Encrypted, Mask on the Way Out** (extending Principle XII):
   - Seller PII (contact information, full street addresses) is ingested and stored in
     full, encrypted at rest in PostgreSQL (AES-256, e.g., Prisma field-level
     encryption).
   - Masking/sanitization MUST happen at the **outbound serialization boundary** —
     whenever property packages are exported to external investor feeds, public APIs,
     or partner webhooks. No outbound serializer may emit unmasked seller PII.
   - Internal operations services access unmasked data only through authorized ports,
     and each access produces a domain audit log record (Principle XII).
   - Seller PII MUST be redacted from system error logs and Sentry events.
2. **Idempotency Gateway Middleware**:
   - All mutating operations (`POST`, `PUT`, `PATCH`) on `apps/api` MUST carry an
     `Idempotency-Key` header, enforced by shared Express/Fastify middleware that runs
     *before* route handlers (keeping Principles II and VI intact). Keys and their
     responses are cached in Redis for 24 hours; a repeated key returns the stored
     response without re-executing the handler.
   - **Redis outage**: the middleware MUST fail closed — reject mutating requests with
     `503 Service Unavailable` and `Retry-After: 5`. A PostgreSQL fallback is permitted
     only if it checks a durable store of the same request keys (e.g., a dedicated
     idempotency-key table); the outbox table alone does not record request keys.
   - **Separation of concerns**: this middleware prevents duplicate *request
     ingestion* at the HTTP edge. Principle VIII's unique constraint prevents duplicate
     *job execution* inside workers. Both are required; neither replaces the other.

**Rationale**: Keeping full PII encrypted lets Clever operate while masking at egress keeps
it out of every external channel; edge idempotency plus job-level constraints make retries
safe end to end.

### XXI. Workspace Boundaries (Turborepo)

1. **Microservice API (`apps/api`)**: Uses pure Express/Fastify routes and hexagonal
   application services (Principles I–III). It owns the HTTP API, the Prisma schema, and
   migrations. It MUST NOT contain Next.js components or browser directives. Route
   parameters follow standard Express/Fastify parsing (Principle II.9).
2. **Background Worker (`apps/worker`)**: Runs durable jobs (Principle VIII) and BullMQ
   outbox consumers (Principle XVIII) with its own composition root and worker error
   translator (Principle VII).
3. **Server-side data ownership**: Only `apps/api` and `apps/worker` may access
   PostgreSQL, import Prisma, or contain domain services and repositories. Domain code
   shared by both MUST live in a server-only workspace package (e.g., `packages/core`);
   neither app imports from the other's `src/`.
4. **Web Application (`apps/web`)**: Houses the Agent, Investor, and Admin surfaces using
   Next.js App Router and React Aria (Principle XI). It is strictly a client layer:
   - It consumes backend APIs only via type-safe `@clever/contracts` clients
     (Principle V).
   - Its Route Handlers and Server Actions act solely as BFF proxy adapters that
     forward requests to `apps/api` and manage HTTP-only session cookies
     (Principle XII).
   - It MUST NEVER import Prisma, connect to PostgreSQL, or contain domain services.
5. **Shared contracts (`packages/contracts`, `@clever/contracts`)**: All shared domain
   schemas and types (Principle V). It imports nothing from any app.

**Rationale**: Hard workspace boundaries keep server and client concerns from bleeding
into each other, give the database a single set of owners, and make shared contracts the
only coupling point between web and backend.

## Quality Gates

- New entities MUST include repository, mapper, and service interface before
  implementation (Principle IV).
- New API endpoints MUST use correct verbs and status codes (Principle II).
- Frontend features MUST separate server state from coordination state (Principle XIII).
- Internal background work MUST use the durable job system (Principle VIII); outbound
  external events MUST go through the transactional outbox (Principle XVIII).
- Schema migrations MUST include constraints and indexes (Principle IV).
- Error classes MUST fit the existing hierarchy (Principle VII).
- New offer programs/flows MUST be config-driven, not hardcoded (Principle IX).
- New components needing DOM access MUST take `ref` as a prop, not `forwardRef`
  (Principle XI).
- New job types MUST declare the unique constraint that prevents duplicates
  (Principle VIII).
- Schema migrations, transactional writes, and outbox writes MUST be covered by
  integration tests against ephemeral PostgreSQL (Principle XV).
- Any new outbound serializer (investor feed, public API, partner webhook) MUST mask
  seller PII and have a test proving it (Principle XX.1).
- New mutating `apps/api` endpoints MUST sit behind the idempotency middleware
  (Principle XX.2).
- `apps/web` MUST NOT import Prisma or server-only domain packages (Principle XXI).
- Brand-specific assets MUST live in the content/theming layer, not in source
  (Principle XVI).

## Governance

This constitution is the highest-authority reference for all development decisions. When
in conflict with other documentation, this constitution prevails.

- **Amendment Procedure**: Any principle change MUST be documented with rationale,
  reviewed, and committed with a version bump.
- **Versioning Policy**: Semantic versioning — MAJOR for principle removals or
  redefinitions, MINOR for new principles or material expansions, PATCH for
  clarifications and typo fixes.
- **Amendment Approval**: the Vice President of Engineering approves every constitution
  amendment before it is merged.
- **Compliance Review**: All PRs MUST verify alignment with active principles. Violations
  MUST be flagged before merge, and a flagged violation blocks the merge, including any
  failing architectural boundary check or test in CI. The only exception is a deviation
  recorded under Complexity Justification and approved by the Vice President of
  Engineering.
- **Complexity Justification**: Deviations MUST be documented with a justification
  referencing the overridden principle.

**Version**: 7.2.0 | **Ratified**: 2026-04-10 | **Last Amended**: 2026-10-31
