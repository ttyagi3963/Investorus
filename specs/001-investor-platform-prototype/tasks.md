---

description: "Task list for the Investor Platform Prototype"
---

# Tasks: Investor Platform Prototype

**Input**: Design documents from `specs/001-investor-platform-prototype/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included. The spec requires automated tests (FR-006, SC-006, SC-009, SC-014, SC-015),
and the constitution requires test-first work (XVII.2) on two tiers (XV): `pnpm test` (unit,
offline) and `pnpm test:integration` (Testcontainers PostgreSQL 17 + Redis 7). Within each
phase, write the test tasks first and confirm they fail before implementing.

**Organization**: Tasks are grouped by user story so each story can be built and checked on
its own. Phase 9 covers the design-system requirements (FR-090 to FR-097), which apply to every
story and so have no story label.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: The user story the task belongs to (US1–US6)
- Paths are relative to the repository root

## Conventions every task follows

- **Vertical slices (R22)**: a repository slice is `packages/core/src/repositories/<entity>/`
  holding `I<Entity>Repository.ts` (port, domain types only), `Prisma<Entity>RepositoryImpl.ts`
  (the only file with Prisma queries), `<entity>.mapper.ts` (`to<Entity>()` /
  `toPrisma<Entity>()`, the only place Prisma types appear), and `index.ts`. Each slice also
  gets `packages/core/test/doubles/InMemory<Entity>Repository.ts`.
- **Services** take `(actor, input: unknown)`, validate with the Zod schema from
  `@clever/contracts`, check role and ownership, and throw `DomainError` subclasses (III, VI).
  Every multi-write runs inside `uow.run(...)` together with its `OutboxEvent` and `AuditLog`
  rows (XVIII.1).
- **Audit (XII, VII)**: every status transition of a package, offer, deal, or buy box writes an
  `AuditLog` entry (actor, action, entity, outcome) in the same uow, and a rejected business
  action (deadline passed, illegal transition, expired offer) writes one with outcome `REJECTED`.
  Services own this; tests assert it.
- **Routers** are `create<Resource>Router(services)` factories: they take `req.params` /
  `req.body`, call one service method, and send the status code from
  [contracts/api.md](./contracts/api.md). They have no try/catch and no validation (II).
- **Wiring**: a new port, `*Impl`, service, or router is exported from the right barrel
  (`@clever/core` for ports and services, `@clever/core/adapters` for `*Impl`) and wired only in
  that app's `src/container.ts`.
- **Time**: all time-dependent code takes `IClock`; its tests use `FakeClock` and fake timers
  (R18).
- **UI**: screens are built from `@clever/ui` templates and semantic utilities only (FR-091,
  FR-094); server state uses React Query keys `["entity", id]` with explicit invalidation (XIII).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Workspace, tooling, and empty app/package shells.

- [X] T001 Create root workspace files: `package.json` (private; `packageManager: "pnpm@10"`; scripts `build`, `dev`, `test`, `test:integration`, `lint`, `typecheck` that call turbo), `pnpm-workspace.yaml` (`apps/*`, `packages/*`), `turbo.json` (tasks `build`, `test`, `test:integration`, `lint`, `typecheck`, each with `dependsOn: ["^build"]`), and `.gitignore` (no `.nvmrc`: the local Node version manager would demand Node 24 locally; `engines` requires >= 24 and the Dockerfile pins Node 24)
- [X] T002 [P] Create shared TypeScript presets (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`) in packages/config/tsconfig/base.json, node.json, library.json, nextjs.json, plus packages/config/package.json
- [X] T003 [P] Create Vitest presets: packages/config/vitest/unit.js (excludes `**/*.int.test.ts`; packages/config/vitest/no-network.js makes unstubbed `fetch` throw; neither preset enables fake timers, which XV 7.0.0 prohibits globally) and packages/config/vitest/integration.js (only `**/*.int.test.ts`, 120 s timeout, single fork)
- [X] T004 [P] Create the boundary lint rules in packages/config/eslint/boundaries.js: in apps/web, ban `@prisma/client`, `@clever/core`, and `@clever/core/adapters`; ban imports between apps; allow `@clever/core/adapters` only in `**/src/container.ts`; allow `@prisma/client` only in `packages/core/src/**/*Impl.ts`, `packages/core/src/infra/**`, and `packages/core/prisma/**`, plus type-only imports in `packages/core/src/**/*.mapper.ts`; block deep imports past package `exports`
- [X] T005 [P] Create the style lint rule in packages/config/eslint/no-raw-style-values.js, applied to apps/web and packages/ui: ban hex, `rgb()`, and `hsl()` literals; ban Tailwind arbitrary values (`-[`); ban default palette classes such as `bg-blue-500` and `text-gray-700` (SC-014). Export the composed flat config from packages/config/eslint/index.js
- [X] T006 [P] Add root `.prettierrc`, `.prettierignore`, `.editorconfig`, and `eslint.config.js` (imports packages/config/eslint)
- [X] T007 [P] Scaffold packages/contracts: package.json (`name: @clever/contracts`; `exports` for `.` and subpaths `./common`, `./auth`, `./listing-package`, `./investor`, `./buy-box`, `./match`, `./offer`, `./deal`, `./brand`, `./events`, `./ops`, `./config`, `./client`; dependency `zod@4` only), tsconfig.json, src/index.ts root barrel, and an empty `index.ts` in each subfolder
- [X] T008 [P] Scaffold packages/core: package.json (`name: @clever/core`; `exports` `"."` → src/index.ts and `"./adapters"` → src/adapters.ts; dependencies prisma, @prisma/client, @prisma/adapter-pg, bullmq@5, ioredis, json-logic-js, jose, bcryptjs, pino, csv-parse, zod, @clever/contracts; devDependencies testcontainers, @testcontainers/postgresql, @testcontainers/redis), tsconfig.json, vitest.config.ts, vitest.integration.config.ts, and empty src/index.ts and src/adapters.ts (json-logic-js is removed again by T216 after the XIX 6.0.0 amendment)
- [X] T009 [P] Scaffold packages/ui: package.json (`name: @clever/ui`; react@19, react-aria-components, tailwindcss@4; peer @clever/contracts types only), tsconfig.json, vitest.config.ts (jsdom), src/index.ts
- [X] T010 [P] Scaffold apps/api: package.json (express@5, helmet, pino-http, @clever/core, @clever/contracts; dev: supertest, @types/express), tsconfig.json, vitest.config.ts, vitest.integration.config.ts
- [X] T011 [P] Scaffold apps/worker: package.json (@clever/core, @clever/contracts, bullmq), tsconfig.json, vitest.config.ts
- [X] T012 [P] Scaffold apps/sandbox: package.json (express@5, pg, pino-http; dev: supertest), tsconfig.json, vitest.config.ts
- [X] T013 [P] Scaffold apps/web with Next.js 16 App Router: package.json (next@16, react@19, @tanstack/react-query@5, @clever/ui, @clever/contracts; dev: @testing-library/react, jsdom), next.config.ts (`output: "standalone"`, `transpilePackages: ["@clever/ui", "@clever/contracts"]`), postcss.config.mjs (Tailwind 4), tsconfig.json, vitest.config.ts
- [X] T014 Create the committed `.env` at the repo root with working demo values and a header comment ("demo values only, not secrets; see README Prototype Shortcuts"): `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `PII_ENCRYPTION_KEY` (base64, 32 bytes, with key version `v1`), `ADDRESS_HASH_KEY`, `SANDBOX_URL` (internal), `PUBLIC_SANDBOX_URL` (`http://localhost:4100`), `SANDBOX_INTERNAL_TOKEN`, `STORAGE_SIGNING_KEY`, `CRM_PROVIDER=sandbox`, `MESSAGING_PROVIDER=sandbox`, `STORAGE_PROVIDER=sandbox`, `ERROR_REPORTER=log`, `API_URL`, `COOKIE_SECURE=true`, `DEFAULT_BRAND_ID=clever`
- [X] T015 [P] Create `.dockerignore` excluding `node_modules`, `.next`, `dist`, `.turbo`, `.git`, `coverage`, and `specs`
- [X] T216 Constitution 6.0.0 follow-up to T008: remove `json-logic-js` and `@types/json-logic-js` from packages/core/package.json, add `fast-check` to its devDependencies, run `pnpm install` to update pnpm-lock.yaml, and confirm `pnpm typecheck` still passes (XIX amended 2026-10-30)

**Checkpoint**: `pnpm install`, `pnpm lint`, and `pnpm typecheck` succeed on the empty shells.

> **Note (2026-10-30)**: the buy-box redesign (constitution XIX 6.0.0) rewrote T019, T021–T023,
> T026, T031, T032, T034, T051–T055, T067, T096, T098, T099, T109–T111, T114, T116, T117, T121–T123,
> T126, T127, T131, T138, T140, T178–T183, T185, T187, T188, T191, T194, T196, and T197, and added
> T216–T225. New IDs sit next to the tasks they belong with, so they are out of numeric order.

---

## Sprint 0: Delivery Pipeline (after Phase 1, before Phase 2)

**Purpose**: Every later task arrives as a pull request that CI, the Claude review, and a human
reviewer check before it merges (constitution XVII), and the reviewer's one-command Docker start
is rehearsed on every merge instead of only at the end.

**Confidentiality**: the assignment says to treat its data and information as confidential and
to use it only for this exercise. The GitHub repository is **private**, and nothing reaches it
until T226 is done.

**Development model: trunk-based** (decided 2026-10-31). `main` is the trunk, and it is always
releasable: every merge must leave the zip starting with one command (T233 checks this).
- Work happens on short-lived branches cut from `main`, one task or a small group of tasks each,
  merged through a pull request within about a day, then deleted. There are no `develop`,
  long-lived feature, or release branches.
- Branches rebase on `main` rather than merging it in, and PRs merge by squash, so `main` reads as
  one commit per task.
- A story bigger than one PR merges in slices that are safe on their own: tests and contracts
  first, then services, then routes and screens. A slice that would show unfinished work to a
  user stays switched off behind a config flag (`ConfigEntry`, constitution IX and XVI) until the
  story is complete; a flag is removed once its story ships.
- A red `main` stops new merges until it is fixed or the breaking commit is reverted.
- A release is a tag on `main` (for example the submitted zip), not a branch.

- [X] T226 Make the repo safe to publish (local only; done 2026-10-30):
  - `assignment.md`, `project_structure_and_orchestration_blueprint.md`, and
    `table-reasoningg.md` removed from every commit (`git filter-branch --index-filter`, then
    reflog expiry and `git gc --prune=now`); `git log --all` and `git rev-list --all --objects`
    no longer find them. `assignment.md` stays on disk only, ignored by .gitignore. A
    pre-rewrite backup bundle was kept outside the repo;
  - gitleaks 8.30.1 over the full history, the uncommitted changes, and every committable file:
    the only findings were the four demo keys in `.env` (`JWT_SECRET`, `ADDRESS_HASH_KEY`,
    `SANDBOX_INTERNAL_TOKEN`, `STORAGE_SIGNING_KEY`), confirmed as demo values and recorded with
    their fingerprints in `.gitleaksignore`; all three scans are now clean;
  - no phone numbers, street addresses, personal emails, or mystery-shop lead details in any
    file or commit. The commit author email is kept on purpose (owner's decision);
  - `.gitattributes` forces LF (`* text=auto eol=lf`) and no tracked file has CRLF; .gitignore
    covers `node_modules/`, `.next/`, `dist/`, `.turbo/`, and `coverage/` at every depth
- [X] T227 Push to GitHub (done 2026-10-31): https://github.com/ttyagi3963/Investorus is
  **private** (switched before any push; a signed-out API request gets 404). `main` tracks
  `origin/main`, and GitHub has the same three commits as `git log` with none of the files T226
  removed. Issues and Dependabot alerts are on; secret scanning is not offered for this private
  repository, so the gitleaks check (T226, and CI later) covers it
- [X] T228 Set up the kanban board, mirroring this section (tasks.md stays the single source of
  truth; the board never holds a task that is not here):
  - run scripts/board/sync-sprint.mjs (renamed from sync-sprint0.mjs in T272; prerequisites in its header: install `gh`,
    `gh auth login`, `gh auth refresh -s project`). `--print-tasks` checks the parsing, a plain
    run is a dry run, and `--apply` makes the changes. It is safe to re-run, because issues are
    matched by their `T### ` title prefix;
  - it creates a **private** GitHub Projects board "Investorus" linked to the repository (private
    because the specs describe Clever's confidential scenario; reviewers are invited instead);
  - Status columns: Backlog, Ready, In progress, In review, Done;
  - custom fields: Task ID, Sprint, Phase, User story, Parallel;
  - labels `task`, `sprint-0`, `parallel`, and `board-test`;
  - one issue per Sprint 0 task, with the full task text and a pointer back to this file. Done
    tasks (T226) are created closed and placed in Done. Later phases are added when their
    sprint is planned;
  - on the board (Settings → Workflows), turn on **Auto-add to project** (filter
    `repo:<owner>/Investorus is:issue`), **Item closed** → Done, and **Pull request merged** →
    Done. A PR that says `Closes #N` moves the task's card to Done when it merges;
  - verify with `--test-workflows`: a new issue is auto-added, and closing it moves it to Done.
  Done 2026-10-31: private board https://github.com/users/ttyagi3963/projects/1 holds the Sprint 0 tasks
  (T226 in Done, the rest in Backlog), and `--test-workflows` passed both checks
  (depends on T227)
- [X] T229 Write the baseline CI workflow in .github/workflows/ci.yml (branch `t229-baseline-ci`): (merged 2026-10-31 as PR #14)
  - runs on every pull request and every push to `main`; `permissions: contents: read`; every
    third-party action pinned to a full commit SHA; one concurrency group per PR, so a new push
    cancels the stale run (runs on `main` are never cancelled); no secrets;
  - shared setup in .github/actions/setup: pnpm from `packageManager`, Node 24 with the pnpm
    store cached, `pnpm install --frozen-lockfile`;
  - four jobs, each its own check. `lint-typecheck`: `pnpm lint` and `pnpm typecheck` through
    Turbo, with `eslint-plugin-jsx-a11y` recommended rules on apps/web and packages/ui
    (packages/config/eslint/jsx-a11y.test.js proves an `<img>` without `alt` fails).
    `unit-tests`: `pnpm test`, offline, including the Criterion Registry and evaluator tests.
    `integration-tests`: `pnpm db:check` (`prisma validate` and a migration drift check against
    a Postgres 17 shadow-database service; it reports "skipped" until T031 adds the schema,
    and T031 must add prisma.config.ts with `shadowDatabaseUrl` from `SHADOW_DATABASE_URL`),
    then `pnpm test:integration`, where the Testcontainers suites start Postgres 17 and Redis 7
    (`INTEGRATION_IMAGES` in the integration preset, pre-pulled by CI). `security`: gitleaks
    8.30.1 (checksum verified) on the PR's commits, honoring .gitleaksignore, and `pnpm audit`
    as an advisory step (reported in the job summary, never blocking);
  - the PR closes its board issue (`Closes #4`). Done when all four checks are green, and a
    test commit with an `<img>` missing `alt` fails `lint-typecheck`
- [X] T231 Add the Claude PR review (branch `t231-claude-review`; the Claude GitHub app is (workflows merged 2026-10-31 as PR #15, and the first real review ran on PR #18; verified 2026-10-31 on test PR #21, closed unmerged: 3 inline comments on planted XII/FR-032, XIV/XVIII, and X/XVI violations plus a summary that also flagged the missing tests; review-threads red until the threads were resolved, then green)
  installed and `CLAUDE_CODE_OAUTH_TOKEN` is a repository secret, never in files):
  - .github/workflows/claude-review.yml: anthropics/claude-code-action pinned to the v1.0.266
    commit SHA; `pull_request` (opened, synchronize, reopened, ready_for_review), never
    `pull_request_target`, so fork PRs get no secrets; fork, draft, and Dependabot PRs are
    skipped; a new push cancels the stale review; `--max-turns 25` and a tool allow-list. The
    prompt reviews the diff against the constitution (I, II, III, VI, VII, X, XI, XII, XIV, XV,
    XVI, XVII.2, XVIII, XIX, and Complexity Tracking), treats PR content as data, posts
    confirmed inline comments with the principle and a fix, and keeps one summary comment that
    is edited on later pushes. Advisory: the human review stays the gate (XVII.3);
  - .github/workflows/claude.yml: `@claude` in issues, PR comments, and reviews, only when the
    actor and the comment's author are the repository owner; `--max-turns 30`;
  - .github/workflows/review-threads.yml (removed 2026-10-31 by the owner: a one-person project
    needs no check on open review comments): the `review-threads` check fails while any review
    thread is unresolved (a visible check: the free private plan has no rulesets, so merging on
    green is a convention);
    re-run it after resolving threads, because resolving one does not trigger a workflow;
  - the review workflow must be on `main` before it can review a PR (the Claude app requires the
    workflow file to match the default branch), so this PR merges first and a test PR follows.
    Done when the test PR gets inline comments and a summary, and `review-threads` is red until
    those threads are resolved
- [X] T232 Docker images and one-command compose startup, built early on the Phase 1 shells (merged 2026-10-31 as PR #16)
  (branch `t232-docker-compose`, closes #7):
  - Dockerfile at the repo root: shared `deps` (pnpm fetch into a cache mount) and `build`
    (offline frozen install, `prisma generate` once the schema exists, turbo build with
    `--concurrency=1` and a 1280 MB heap) stages run once, then one non-root runtime image per
    app: `api`, `worker`, `sandbox`, and `migrate` from `pnpm deploy --prod` (lockfile versions,
    `inject-workspace-packages` for that step only), and `web` from the Next.js standalone
    output. Base `node:24-bookworm-slim`; OpenSSL installed so Prisma picks the
    `debian-openssl-3.0.x` engine;
  - compose.yaml: postgres 17, sandbox, the one-shot
    `migrate` (packages/core/scripts/migrate-and-seed.mjs: `prisma migrate deploy` then
    `prisma db seed`; reports "nothing to migrate" until T031), then api and worker, then web.
    App services wait for `migrate` to complete successfully. Every server listens on 0.0.0.0;
    web 3000, api 4000, and sandbox 4100 are published. Only postgres has a compose healthcheck
    (migrate needs a ready database); the app services are ordered by start, and in production
    the orchestrator (ECS and the load balancer) checks the api's `/api/v1/health` route. Redis is
    left out until the worker queues need it: T082 adds it back (redis 7, `noeviction`, no
    persistence, healthcheck `redis-cli ping`);
  - Sprint 0 shells (tests first): api `GET /api/v1/health`, sandbox placeholder page at `/`,
    worker heartbeat file. T070, T081, and T083 replace them;
  - README.md with the start command, ports, and the six demo accounts (`demo1234`), marked as
    arriving with User Story 1 (T089–T092, T099);
  - measured 2026-10-31 on a fresh clone with an empty build cache: build and start 97 s, home
    page 200 right after; about 145 MB of memory in use. No separate `docker-build` CI job: the submission rehearsal (T233) builds every image on PRs that
    touch the startup files.
- [X] T102 [P] Write scripts/wait-for-home.sh (polls http://localhost:3000/ until 200, up to 300 s, prints elapsed seconds; exits 1 on timeout) (moved to Sprint 0: built for the rehearsal, T233)
- [X] T213 [P] Write scripts/package-zip.sh: build investor-platform.zip from tracked files only (excluding `.git`, `node_modules`, `.next`, `dist`, and `specs` if not wanted), and fail if the zip exceeds 100 MB (moved to Sprint 0: built for the rehearsal, T233)
- [X] T233 Write the submission rehearsal job (branch `t233-submission-rehearsal`, closes #8): (merged 2026-10-31 as PR #18; on GitHub's runner: build 167 s, home page 3 s, program memory peak 903 MB, 0 OOM kills)
  .github/workflows/submission.yml on pushes to `main`, on demand, and on PRs that touch the
  startup files (Dockerfile, compose, .env, lockfile and package manifests, README, the scripts);
  - scripts/package-zip.sh (T213) builds the zip with `git archive` from HEAD;
  - scripts/submission/check_zip.py: ≤ 100 MB zipped, ≤ 20,000 entries (folders counted),
    ≤ 500 MB unzipped, compose.yaml and .env at the top level, no dependency or build folders,
    no file over 5 MB, no assignment.md; warns at 80% of a limit;
  - gitleaks on the unzipped submission;
  - scripts/submission/rehearse.sh: proves the cap (a 2.6 GB canary must be killed), then
    Docker-in-Docker with 2 GB, no swap, and 2 pinned cores (pinned, because tools size thread
    pools from the visible core count); unzips into an empty folder and runs only
    `docker compose up --build`; build ≤ 20 min, GET / ≤ 5 min; signs in with each README demo
    account (skipped with a notice until the sign-in route exists, required after); reports
    program memory, the kernel peak, and out-of-memory kills (must be 0);
  - uploads the tested zip as-is (`archive: false`) only after every check passes, with its
    SHA-256 in the summary.
  Measured 2026-10-31 locally (2 GB, 2 cores, cold): build 114 s, home page 3 s, program memory
  peak 822 MB, 0 OOM kills. The first rehearsals failed (OOM in `pnpm fetch`: one worker thread per
  visible core); fixed in T232 with `PNPM_MAX_WORKERS=2`. It cannot be a *required* check on the
  free private plan (no rulesets): the gate is by convention. Done when the job is green on GitHub
- [X] T234 [P] Repo hygiene: (merged 2026-10-31 as PR #19; Dependabot runs: actions, docker, and compose found nothing to update; the npm run waits on pnpm's minimumReleaseAge for eslint 10.14.0, which is not blocking)
  - .github/pull_request_template.md: the task ID, a constitution checklist (tests written first,
    boundaries, PII, outbox, Complexity Tracking entry for any deviation with its approval), and
    how it was verified;
  - .github/CODEOWNERS (the repository owner for every path);
  - .github/dependabot.yml (npm, github-actions, and docker; weekly; grouped minor and patch
    updates);
  - README.md status badges for CI and the submission rehearsal;
  - short-lived branch naming `t###-short-summary`, rebased on `main`; one task or small group
    of tasks per PR, merged within about a day (trunk-based development, above)

**Checkpoint**: every pull request runs CI and the Claude review, and
merges only when all are green and it is approved (by convention: the free private plan has no
rulesets); every merge to `main` produces a tested zip that starts with one command within
the time limits.

---

## Sprint 1: An Agent Signs In and Saves a Listing Package

**Goal** (owner, 2026-10-31): a demo agent starts the app with one `docker compose up`, signs in,
and builds a draft listing: the seller's details, the property, the price expectations, and
photos. The app rejects bad data with the field named, blocks a second package for an address
that is already listed, and keeps one agent out of another agent's packages. The seller's
personal details are encrypted in the database, and nothing goes out to investors yet.

**Decisions** (owner, 2026-10-31):
- **Sign-in is by email and password.** `User.username` becomes `User.email` (data-model.md,
  amended). The login page opens pre-filled with the seeded demo agent (`avery@example.com`,
  `demo1234`); signing in is the real flow: bcrypt check, an 8-hour JWT from the api, kept by the
  BFF in an HTTP-only cookie (research R12). No NextAuth.
- **Photos are optional on a draft**, and **a draft can be edited later**: the agent can come
  back to change the seller, the property, the price, or the photos (`PATCH` with `version`).
  Changing the address re-runs the duplicate-address check.
- **Not in Sprint 1:** Redis and the idempotency middleware (T076–T077, with T082; a deviation
  from XX.2, recorded in plan.md Complexity Tracking), branding and
  themes (neutral default tokens only), publishing and matching, the config-driven wizard
  (T130), the home page (T103), JWT revocation, refresh tokens, MFA, and SSO (prototype
  shortcuts, plan.md).
- Tasks are listed in merge order, one PR per group. A task split out of a larger one names its
  source; the source keeps the rest.

### PR: plan (this section)

- [X] T272 Teach the board sync to read any sprint: rename scripts/board/sync-sprint0.mjs to scripts/board/sync-sprint.mjs taking `--sprint N` (default 0), which mirrors the tasks in the `## Sprint N` section with a `sprint-N` label and the Sprint field set to "Sprint N"; record the Sprint 1 goal, decisions, and tasks in this section; switch spec.md, research.md (R12), data-model.md, contracts/api.md, quickstart.md, plan.md, and README.md from username to email

### PR: the tables (done)

- [X] T236 (Sprint 1) Write the first tables in packages/core/prisma/schema.prisma (User, Agent, and the `Role` enum with `AGENT` and `OPS`; INVESTOR and `investorId` arrive with Investor), packages/core/prisma.config.ts, and the first migration with the hand-written CHECK `User_role_link_check` (an AGENT has `agentId`, OPS has none), plus its integration test in packages/core/test/user-table.int.test.ts
- [X] T237 (Sprint 1) Create the User contracts in packages/contracts/src/user/, shaped from the Prisma `User` model (T236): `ROLES` (`AGENT`, `OPS`), the `User` type without `passwordHash`, `UserCredentials`, `createUserInputSchema` (username trimmed, lowercased, 3–40; displayName 1–80; each role carries only its own link), and `UserView` with `toUserView`, plus the barrel
- [X] T238 (Sprint 1) Add the Seller table to packages/core/prisma/schema.prisma (`fullName`, `email?`, `phone?` hold ciphertext; no agent link, the package carries it) and its migration with the hand-written CHECK `Seller_contact_check` (`email` or `phone` is not null), plus its integration test in packages/core/test/seller-table.int.test.ts
- [X] T239 (Sprint 1) Create the Seller contracts in packages/contracts/src/seller/, shaped from the Prisma `Seller` model (T238): the `Seller` type (decrypted values) and `createSellerInputSchema` (`fullName` required; `email` valid; `phone` E.164; email or phone required, with the error on the field), plus the barrel
- [X] T240 (Sprint 1) Add the draft tables to packages/core/prisma/schema.prisma: Property (all listed facts; `streetLine` holds ciphertext; city and state from the ZIP; `lat`, `lng`, and the `zip` and `addressHash` indexes wait for matching), ListingPackage (agent, unique seller, unique property, `addressHash` unique, status `DRAFT` only, price expectations; the publish fields wait for publishing), and Photo (cascade with its package; unique `(packageId, position)`), with the migration's hand-written CHECKs (Property ranges and `units` only for MULTI_FAMILY; `ListingPackage_price_check`; Photo type, size ≤ 10 MB, position 0–19) and their integration tests in packages/core/test/
- [X] T241 (Sprint 1) Create the draft contracts shaped from the T240 tables: packages/contracts/src/property/ (`PROPERTY_TYPES`, `PROPERTY_CONDITIONS`, `Property`, `createPropertyInputSchema`), packages/contracts/src/listing-package/ (`PACKAGE_STATUSES`, `ListingPackage`, `createListingPackageInputSchema` with seller, property, and min ≤ max price), and packages/contracts/src/photo/ (`PHOTO_CONTENT_TYPES`, `MAX_PHOTO_BYTES`, `Photo`, `createPhotoUploadInputSchema`, `addPhotoInputSchema`), each with its barrel

### PR: the sign-in and editing decisions in the schema

- [X] T242 Sign in by email: a migration renames `User.username` to `User.email` (unique; the service stores it lowercased); the User contracts use `email` (trimmed, lowercased, a valid email) in place of `username`
- [X] T243 Editable drafts: a migration adds `ListingPackage.version Int @default(1)` (optimistic concurrency); `ListingPackage` gets `version`; `updateListingPackageInputSchema` in packages/contracts/src/listing-package/inputs.ts (separate from create, constitution V): `version` required; `seller`, `property`, `priceExpectationMin`, and `priceExpectationMax` optional; inside them every field optional, `undefined` means unchanged and `null` clears an optional fact; min ≤ max when both are sent (from T116)

### PR: errors, logging, and encryption (packages/core)

- [X] T017 [P] Create the domain error hierarchy in packages/contracts/src/common/errors.ts: `DomainError` (abstract, `readonly status`, `readonly code`), `ValidationError` (400, `details.fields[]` of `{ field, message }`), `ForbiddenError` (403), `NotFoundError` (404), `BusinessRuleError` (409), `ConflictError` (409, optional `details.allowedNext`); every class sets `this.name = new.target.name` (VII)
- [X] T039 [P] Create `InfrastructureError` (status 502 or 503, `cause` kept privately and never serialized) in packages/core/src/errors/InfrastructureError.ts
- [X] T038 [P] Write the redaction test, then implement `redactPii(value)` (deep-redacts keys `fullName`, `sellerName`, `email`, `phone`, `streetLine`, `sellerContact`, `password`, `authorization`, `cookie`) in packages/core/src/errors/redact-pii.ts and packages/core/src/errors/redact-pii.test.ts
- [X] T040 [P] Create the `IErrorReporter` port and `LogErrorReporterImpl` (structured pino `error` entry passed through `redactPii`) in packages/core/src/providers/error-reporter/, and the logger factory `createLogger(name)` (pino JSON with redact paths) in packages/core/src/infra/logger.ts
- [X] T041 Write the HTTP translator tests in packages/core/src/errors/http-error-translator.test.ts: ZodError → 400 with `details.fields[]`; each DomainError → its status and code, not logged; InfrastructureError → its status with a generic message, reported; unknown error → 500 `{ error: "Internal server error" }` with no stack, path, or SQL text, reported (the log reporter writes the log line)
- [X] T245 Implement the HTTP error translator: `translateError(err, { reporter })` → `{ status, body }` in packages/core/src/errors/http-error-translator.ts (from T042; the worker translator stays there) (depends on T041)
- [X] T036 [P] Write the cipher tests in packages/core/src/providers/pii-cipher/AesGcmPiiCipherImpl.test.ts: encrypt/decrypt round trip; the same input gives different ciphertext (random IV); output starts with the `v1:` key-version prefix; tampered ciphertext throws; `addressHash()` is identical for differently formatted copies of the same address
- [X] T037 Create the `IPiiCipher` port and `AesGcmPiiCipherImpl` (AES-256-GCM, 12-byte random IV, `v1:` prefix, base64), plus `createAddressHasher(key)` (HMAC-SHA256 of the normalized lowercased full address) in packages/core/src/providers/pii-cipher/ (depends on T036)

### PR: database access (packages/core)

- [X] T244 Create `createPrismaClient(databaseUrl)` (driver adapter `PrismaPg`, the URL from validated env only) in packages/core/src/infra/prisma-client.ts and export it from packages/core/src/adapters.ts (from T033; the Redis client stays there)
- [X] T043 Create the `IUnitOfWork` port (`run<T>(work: (repos: UnitOfWorkRepositories) => Promise<T>): Promise<T>`) and the `UnitOfWorkRepositories` interface in packages/core/src/unit-of-work/IUnitOfWork.ts, and `PrismaUnitOfWorkImpl` (one `$transaction` interactive transaction; builds each repository Impl bound to the transaction client) in packages/core/src/unit-of-work/PrismaUnitOfWorkImpl.ts. Each later slice adds its repository to `UnitOfWorkRepositories` and the Impl factory. (`InMemoryUnitOfWork` comes with the service tests that use it, T258.)
- [X] T049 [P] Create the user slice in packages/core/src/repositories/user/: `findByEmail` (returns `UserCredentials`), `findById`
- [X] T246 [P] Create the seller slice in packages/core/src/repositories/seller/ (the mapper encrypts and decrypts `fullName`, `email`, and `phone` with `IPiiCipher`) (from T118; `PrismaSellerContactReaderImpl` stays there)
- [X] T119 [P] [US2] Create the property slice in packages/core/src/repositories/property/ (the mapper encrypts `streetLine`; the service computes `addressHash`, because it needs the hash for the duplicate check before writing, and passes it in; the address lookup is the listing-package slice's `findByAddressHash`)
- [X] T247 [P] Create the listing-package slice in packages/core/src/repositories/listing-package/: `create`, `findForAgent(agentId, id)`, `listByAgent(agentId)`, `findByAddressHash(hash)` (the package that already has the address, any agent), `update(id, version, patch)` (`WHERE id AND version`; 0 rows → ConflictError) (from T120; the other queries stay there)
- [X] T248 [P] Create the photo slice in packages/core/src/repositories/photo/: `add`, `listByPackage`, `remove` (from T121; the match and listing-version slices stay there)
- [X] T249 Wire the repositories into the unit of work: add the user, seller, property, listing-package, and photo repositories to `UnitOfWorkRepositories` and `PrismaUnitOfWorkImpl`, and export the ports from `@clever/core` and `PrismaUnitOfWorkImpl` from `@clever/core/adapters` (from T122; the InMemory doubles come with the service tests that use them, T258 and T113) (depends on T246–T248)
- [X] T225 [P] [US2] Write the PII-at-rest integration test in packages/core/test/integration/pii-at-rest.int.test.ts (Testcontainers PostgreSQL 17): save a seller and property through their repositories, read the raw Seller and Property rows with `$queryRaw`, and assert `fullName`, `email`, `phone`, and `streetLine` start with `v1:` and contain none of the plaintext; reading through the repositories returns the original values (XII, XX.1)

### PR: ZIP lookup and photo storage

- [X] T067 [P] Implement `StaticGeoProviderImpl` with the bundled ZIP list for the seeded markets (3–5 metros, e.g. Austin TX 787xx, Dallas TX 752xx, Phoenix AZ 850xx, Atlanta GA 303xx; each with city, state, and neighborhood names; the centroid `lat` / `lng` joins with matching, the first code that reads it) in packages/core/src/providers/geo/StaticGeoProviderImpl.ts and packages/core/src/providers/geo/zips.ts, with the `IGeoProvider` port (`lookup(zip)`, null when unknown) and the `IClock` port with `SystemClockImpl` (contracts/providers.md), which the storage links' expiry reads
- [X] T250 [P] Create the `IStorageProvider` port in packages/core/src/providers/storage/: `createUpload(key, contentType, maxBytes)` → the vendor-neutral `UploadInstruction` `{ url, method, headers, expiresAt }`, `getReadUrl(key)`, `stat(key)` → `{ contentType, sizeBytes }` or null, since the photo row records the type and size storage holds, not what the client claimed (from T059; `read`, `put`, and the CRM and messaging ports stay there)
- [X] T251 Build the sandbox storage provider: write the tests, then implement the `sandboxRequest()` helper (5 s timeout, Zod-validated response, InfrastructureError mapping) in packages/core/src/providers/sandbox-http.ts and `SandboxStorageProviderImpl` (`createUpload` returns a `PUBLIC_SANDBOX_URL/storage/objects/:key?max=&sig=&exp=` PUT URL signed with HMAC-SHA256 using `STORAGE_SIGNING_KEY`, the signature covering the key, the content type, the expiry, and the byte limit; `stat` uses `SANDBOX_INTERNAL_TOKEN`) (from T065 and T066; the CRM, messaging, and simulation providers stay there)
- [X] T252 Add sandbox storage to apps/sandbox, test first. The test (apps/sandbox/src/routes/storage.test.ts, supertest): a forged signature, an expired URL, a key signed for another object, a `Content-Type` other than the signed one, and a body larger than the signed byte limit (413) are refused; `/internal/...` without the token gets 401. Then: apps/sandbox/src/env.ts (Zod; fail fast) and apps/sandbox/src/routes/storage.ts (`PUT` and `GET /storage/objects/:key?max=&sig=&exp=` with the signature checked, the PUT's `Content-Type` matching the signed one, and the body limited to `max` bytes, `HEAD /internal/storage/objects/:key` with the token; CORS on `/storage/objects/*` for `WEB_ORIGIN` only), objects kept as files on the `SANDBOX_STORAGE_DIR` volume, no database (from T070 and T071; CRM, messages, and simulations stay there)

### PR: services (packages/core)

- [X] T020 [P] Create auth contracts in packages/contracts/src/auth/ (roles and the user view come from @clever/contracts/user, T237): `createSessionSchema` (`email` trimmed and lowercased, `password`), `actorSchema` (a union by role, like `User`: AGENT with `agentId`, OPS with null), and the `SessionResponse` type (`{ token, user: UserView }`; `GET /me` returns the `UserView`). Built with the services, which sign in with it
- [X] T078 Write the AuthService tests in packages/core/src/services/auth/AuthService.test.ts: valid credentials → JWT (8 h, claims `userId`, `role`, `agentId`); wrong password, unknown email, or inactive user → the same generic `ValidationError("Invalid email or password")`
- [X] T079 Implement `IAuthService` and `AuthService` (bcryptjs compare; jose sign) in packages/core/src/services/auth/ (depends on T078)
- [X] T258 Write the ListingPackageService tests in packages/core/src/services/listing-package/ListingPackageService.test.ts, with InMemory doubles of the T249 repositories and `InMemoryUnitOfWork` in packages/core/test/doubles/ (created here, where they are first used): an invalid field is rejected with the field named; a ZIP unknown to `IGeoProvider` is rejected on `property.zip`, and city and state come from the lookup; an address that already has a package (any agent) → 409 `DUPLICATE_ACTIVE_LISTING`, with `details.existingPackageId` only when the caller owns it, on create and when an update changes the address; an agent cannot read, list, or update another agent's package (404); an update with a stale `version` → 409; an update is checked on the merged result (the stored row plus the change), so `units` on a home that is not multi-family, a minimum above the stored maximum, and clearing the seller's last contact are each rejected with the field named (from T109; the publish rules stay there)
- [X] T259 Implement `IListingPackageService` and `ListingPackageService` (create a DRAFT with its seller and property in one uow; get; list for the agent; update a draft) in packages/core/src/services/listing-package/ (from T123; publishing, OPS reads, and material-change matching stay there) (depends on T258, T249)
- [X] T113 [P] [US2] Write the PhotoService tests in packages/core/src/services/photo/PhotoService.test.ts: only `image/jpeg`, `image/png`, and `image/webp`; `sizeBytes` ≤ 10 MB; at most 20 photos; `position` 0–19 and unique per package; attach fails with a clear message if the storage object does not exist; a rejected photo does not change the rest of the package
- [X] T124 [US2] Implement `IPhotoService` and `PhotoService` (`requestUpload` → `{ storageKey, upload: UploadInstruction }` via `IStorageProvider.createUpload`; `attach`; `remove`) in packages/core/src/services/photo/ (depends on T113, T249)

### PR: seed

- [X] T260 Seed the demo agent: `seedDemoAccounts` in packages/core/src/infra/seed/seed.ts upserts the Agent and its AGENT user by email (Avery Agent, `avery@example.com`, Demo Realty; password `demo1234`, stored as a bcrypt hash), and packages/core/src/infra/seed/run.ts runs it against `DATABASE_URL`. It is compiled with core (the migrate image has no TypeScript runner), so packages/core/scripts/migrate-and-seed.mjs runs `node dist/infra/seed/run.js` after the migrations, and `pnpm db:seed` runs it locally. Plus an integration test that seeds twice, finds one agent and one user, and signs in through AuthService (from T096, T098, and T099; the other fixtures, `seed/fixtures/`, and the modular seed stay there)

### PR: api (apps/api)

- [X] T257 [P] Create the agent's package views in packages/contracts/src/listing-package/views.ts: `AgentPackageView` (the package with its decrypted seller, its property, and its photos with read URLs) and `AgentPackageSummary` (address, status, price range, photo count, updated) (from T116)
- [X] T073 Create apps/api/src/env.ts (Zod `apiEnvSchema`; on failure print the missing or invalid variable names and exit 1) and the `res.locals.actor` type in apps/api/src/types/express.d.ts
- [X] T253 Guard the api with the `authenticate` middleware, test first. The token rules live with the code that signs tokens: `AuthService.verify` (HS256 only, unexpired, a valid actor payload) and `AuthService.me` (401 once the user is inactive), tested in core (an expired, tampered, wrongly signed, wrong-algorithm, or unsigned token is refused), with `UnauthenticatedError` (401) added to the domain errors. The api test (apps/api/src/middleware/authenticate.test.ts): no token, a malformed header, or a bad token gets 401 on a protected route; the allowlisted routes pass without one; the actor reaches the route. The middleware ( sets `res.locals.actor`; public allowlist: `POST /api/v1/sessions`, `GET /api/v1/health`) in apps/api/src/middleware/authenticate.ts, plus `notFound` and `errorTranslator` (4-argument; calls `translateError`) (from T075; the brand routes join the allowlist with Brand)
- [X] T254 Create the health and sessions routers: `createHealthRouter` (`GET /health` → `{ status, db }` via `SELECT 1`; a database failure is a 503) and `createSessionsRouter` (`POST /sessions` → 201, `GET /me`) in apps/api/src/routes/, and add the rehearsal step that signs in with every account the seed creates (read from packages/core/src/infra/seed/seed.ts in the unzipped submission; each later sprint's seed widens it) and fails if any cannot (from T080; Redis in health and the jobs router stay there)
- [X] T255 Wire the api app: `createContainer(env)` in apps/api/src/container.ts (Prisma, cipher, address hasher, clock, uow, geo, storage, logger, error reporter, services, the photo read-link function, and the database check; `Object.freeze`; `dispose()`), `createApp(container)` in apps/api/src/app.ts (helmet → pino-http → json (1 MB) → authenticate → routers at `/api/v1` → notFound → errorTranslator; an unknown route is a 401 until signed in, then a 404), and apps/api/src/server.ts (from T081)
- [X] T256 Create the package and photo routers: `createListingPackagesRouter` (GET list, POST, GET `:id`, PATCH `:id`) and `createPhotosRouter` (POST `:id/photo-uploads`, POST `:id/photos`, DELETE `:id/photos/:photoId`) in apps/api/src/routes/ (from T129; publication, investor, and notification routes stay there)

### PR: web plumbing (apps/web, packages/ui)

- [X] T261 Create apps/web/src/env.ts (Zod: `API_URL`, `COOKIE_SECURE`; checked on first use, because `next build` runs without them) (from T090; `DEFAULT_BRAND_ID` joins with Brand, and apps/web/src/container.ts waits for the first server-side api call)
- [X] T262 Write the BFF tests in apps/web/src/bff/bff.test.ts: a POST, PATCH, or DELETE whose `Origin` does not match the host → 403; a GET without Origin passes; the cookie token is forwarded as `Authorization: Bearer`; the api's status and body are returned unchanged (from T091; the idempotency-key checks join with T077)
- [X] T263 Implement the BFF in apps/web/src/bff/proxy.ts and session.ts, wired by the thin route files apps/web/src/app/bff/[...path]/route.ts (`await params`; cookie → bearer; Origin check on state-changing methods; forwards to `API_URL/api/v1/...`) and apps/web/src/app/bff/session/route.ts (POST: sign in through the api; set the `session` cookie HTTP-only, Secure (per `COOKIE_SECURE`), SameSite=Lax, 8 h; DELETE: clear it) (from T092) (depends on T262)
- [X] T264 Create the typed REST client base in packages/contracts/src/client/http.ts: `createApiClient({ baseUrl, fetch? })`, JSON handling, and a typed `ApiError` that exposes `details.fields` (from T030; the idempotency key joins with T077)
- [X] T265 [P] Add the typed client modules (session, listing packages, photos) in packages/contracts/src/client/modules.ts, and the browser client pointed at `/bff` in apps/web/src/lib/bff-client.ts (from T132 and T093)
- [X] T266 Add route protection in apps/web/src/proxy.ts (Next.js 16; no session cookie → `/login`) and the agent layout in apps/web/src/app/(agent)/agent/layout.tsx with sign out via `DELETE /bff/session` (apps/web/src/features/auth/SignOutButton.tsx) (from T105; the investor and ops layouts stay there)
- [X] T267 Create the Tailwind 4 bridge in packages/ui/src/styles/theme.css with neutral default values (no brand) for the tokens the Sprint 1 screens use, loaded by apps/web/src/app/globals.css, so screens use semantic utilities only (the `SEMANTIC_TOKENS` list joins with the brand validator in T084) (from T084; the brand token sets and status tones stay there)
- [X] T268 [P] Build the React Aria primitives the package form needs (semantic utilities only, visible focus ring; `ref` is added when a screen needs one) in packages/ui/src/primitives/: Button, TextField, NumberField, Select, and a photo picker on `FileTrigger` (from T086; the others stay there)

### PR: screens (apps/web)

- [X] T097 [P] [US1] Write the login hook test in apps/web/src/features/auth/useLogin.test.ts (`renderHook`): pressing twice sends one request and success goes to `/agent`; a refusal shows the api's message and stays on the page
- [X] T104 [US1] Build the login page in apps/web/src/app/login/page.tsx, pre-filled with the seeded demo agent's email and password, and `useLogin` in apps/web/src/features/auth/useLogin.ts (posts to `/bff/session`; uses TextField and Button; the error is shown in an accessible alert); the placeholder home page links to it (depends on T097)
- [X] T269 Build the agent dashboard: apps/web/src/app/(agent)/agent/page.tsx lists the agent's packages (address, status, price range, photos) with `usePackages` (React Query, apps/web/src/features/listing-package/queries.ts, under apps/web/src/providers.tsx), loading, error, and empty states, and a "New package" link (from T133)
- [X] T271 Write the upload hook tests in apps/web/src/features/listing-package/usePhotoUpload.test.ts: a type or size error is shown before any request; the hook uploads with `fetch(upload.url, { method: upload.method, headers: upload.headers, body: file })` straight to storage (never through `/bff`), then calls attach once at the first free position (from T115; the field mapping is the form's, where each input is named by its api field path)
- [X] T270 Build the package form for both new and edit (apps/web/src/features/listing-package/PackageForm.tsx, useSavePackage.ts, PhotoSection.tsx, usePhotoUpload.ts), at apps/web/src/app/(agent)/agent/packages/new/page.tsx and apps/web/src/app/(agent)/agent/packages/[id]/page.tsx: one form with seller, property, and price sections; errors shown on their fields; a `DUPLICATE_ACTIVE_LISTING` error as an accessible notice that links to the existing package only when `details.existingPackageId` is present; after saving, the photo section adds and removes photos with `usePhotoUpload` (from T134) (depends on T271)

**Checkpoint**: `docker compose up --build` on a clean machine; the login page opens pre-filled;
signing in lands on `/agent`; a new package saves as a DRAFT with its seller encrypted at rest;
the agent can reopen it, change it, and add or remove photos; a second package for the same
address is refused; another agent cannot open it; the submission rehearsal passes.

---

## Sprint 2: An Agent Publishes, Matched Investors See It and Make Offers

**Goal** (owner, 2026-10-31): the demo agent publishes a draft from the listings page or the
package page. Publishing names every field that blocks it. A published package is matched against
every active buy box in the worker, and only matched investors can see it: each gets one in-app
notification, sees the package on their dashboard with the time left, sees no seller details,
and can make an offer and revise it. An investor whose buy box does not match gets "not found".
The agent sees how many investors matched, the offers that came in, and a timeline of what
happened to the package; can edit a published package (matching runs again); and can withdraw
it. Every request and job can be traced end to end.

**Decisions** (owner, 2026-10-31):
- **Publish from two places.** Each DRAFT row on `/agent` and the package page have a Publish
  button. It stays enabled; pressing it either publishes or lists every failing field, with a
  link to the field.
- **The publish fields join the form:** offer deadline (default now + 72 h), closing window,
  "currently listed?", and eligible programs (FR-012). Publishing also needs at least one photo
  and the fields the property type requires.
- **Matching runs when a package is published or materially edited, as a durable job.** Publish
  sets ACCEPTING_OFFERS and writes a `MATCH_PACKAGE` job in the same transaction; the worker polls
  the `Job` table (`FOR UPDATE SKIP LOCKED`) and runs it, so a crash or restart never loses a
  match run (constitution VIII). Matching on the event, not in a nightly batch, because offer
  windows are 72 hours; batch runs suit buy box changes (the daily digest, US5) and a periodic
  reconciliation sweep. research.md R24 records this choice. No Redis or BullMQ: the Postgres
  job table is enough at this size.
- **All 13 criteria are in the registry and the evaluator** (XIX), failing closed on a missing
  listing value. Stage 1 narrows by the hard cuts (investor active, proof of funds unexpired,
  box active) and geography only, so it can never drop a box stage 2 would match; the
  per-criterion SQL fragments and their fast-check property test wait.
- **A published package can be edited.** A change to a material field (one a criterion reads)
  writes a new `listingVersion` with its ListingVersion snapshot and runs matching again:
  existing matches stay, new matches are notified, and already-matched investors get one
  "this listing changed" notification.
- **Withdraw** moves a DRAFT or ACCEPTING_OFFERS package to WITHDRAWN, declines its open offers,
  notifies the matched investors, and frees the address for a new package (the address unique
  index becomes partial, FR-013). Reopen waits for Sprint 3 with the deadline job.
- **Notifications are in-app only**, written in the same transaction as the change: one per
  investor per event, a match naming every matching box. Email and SMS through the outbox wait.
- **Tracing and audit come first, so every later PR uses them.** A trace ID is created at the
  BFF (or taken from a valid incoming W3C `traceparent`) and sent to the api as `traceparent`, the
  standard header OpenTelemetry also uses. The api keeps it in an `AsyncLocalStorage` request
  context, so the logger adds it as `trace_id` to every line without any code passing it along;
  the audit log and the job table read it from the same context, and the worker restores a job's
  ID before running it. Every error body returns it as `requestId` (and every response as
  `X-Request-Id`), so support can find a whole request from one ID. An append-only AuditLog
  (actor, action, entity, outcome, correlation ID; no PII) is written in the same transaction as
  each change, and the agent's package page shows it as a timeline. Updated by the owner,
  2026-11-01: `traceparent` and the request context replace a custom `X-Request-Id` passed by
  hand, so tracing is consistent now and OpenTelemetry later is an SDK install, not a rewrite.
- **Idempotency keys, stored in Postgres** (XX.2, without Redis): every POST and PATCH carries an
  `Idempotency-Key` (the client creates one per action); a replay returns the stored response,
  a concurrent duplicate gets 409 with `Retry-After`, and the same key with a different body
  gets 422.
- **Investors and buy boxes are seeded**, not edited (buy box editing is US5):
  `summit@example.com` (two boxes, both match the sample listing), `harbor@example.com` (one
  broad box), `ridge@example.com` (one narrow box that does not match). Password `demo1234`, as
  for every demo account. The login page lists the demo accounts so the reviewer can switch.
- **Offers:** one per investor per package and round (a partial unique index), with every term
  in data-model.md; the investor can revise it until the deadline. Withdrawing an offer,
  counters, and comparing and accepting offers are Sprint 3.
- **Every match decision is audited** (XII lists buy box match decisions as audit-sensitive):
  the matching job appends one MATCH_DECISION entry per matched investor, with the matched box
  IDs and versions, the listing version, `EVALUATOR_VERSION`, and each criterion's result, and
  no PII. It stands in for the MatchEvaluation table until "why not matched?" needs replay.
- **Deviations recorded in plan.md Complexity Tracking** (approved by the owner, as VP of
  Engineering): idempotency keys stored in Postgres (XX.2); stage 1 narrowing by the hard cuts
  and geography only (XIX.3–XIX.4); in-app notifications only, with no email through the outbox
  (FR-022's email, XVIII); match decisions in the audit log instead of MatchEvaluation (XII,
  FR-074).
- **Later scope, not deviations:** reopen and extend deadline, the CLOSE_OFFER_ROUND and
  EXPIRE_OFFER jobs, offer withdrawal, counters, comparing and accepting offers (Sprint 3), buy
  box editing (US5), Redis (T082), and the OpenTelemetry SDK with a collector and dashboards (the
  `traceparent` trace ID in structured logs stands in for spans; XII asks for structured logging,
  which this meets; plan.md Prototype Shortcuts records the production path).
- Tasks are listed in merge order, one PR per group. A task split out of a larger one names its
  source; the source keeps the rest.

### PR: plan (this section)

- [X] T277 Record the Sprint 2 goal, decisions, and tasks in this section; update plan.md Complexity Tracking (idempotency now stored in Postgres; the cuts above); mirror the section to the board (`node scripts/board/sync-sprint.mjs --sprint 2 --apply`)

### PR: investor and buy box tables

- [X] T278 Add Investor to packages/core/prisma/schema.prisma (`companyName`, `contactName`, `email` unique, `phone?`, `investorType`, `status`, `proofOfFundsExpiresAt?`), the `INVESTOR` role and `User.investorId` (unique), and a migration that extends `User_role_link_check` (an INVESTOR has `investorId` and no `agentId`), with its integration test; then the Investor contracts shaped from the table, `INVESTOR` in `ROLES`, the INVESTOR variant of `User` and of the session actor (carrying `investorId`), and the token that names it (the enum value gets its own migration, because Postgres cannot use a new enum value in the transaction that adds it) (from T031, T051)
- [X] T279 Add BuyBox and BuyBoxGeography to the schema exactly as in data-model.md (every criterion a typed nullable column; enum arrays for `propertyTypes`, `conditionsAccepted`, `programsAccepted`), with the migration's hand-written CHECKs (every min ≤ max, `cardinality > 0` on each non-null array, `closeWithinDays` 7–120, `repairMax` ≥ 0) and the partial unique default box, plus their integration test; then the Criterion Registry definitions in packages/contracts/src/buy-box/criteria.ts (`CRITERION_KEYS`, `CRITERIA` with `label` and `listingFields`, `satisfies Record<CriterionKey, …>`, and `MATERIAL_FIELDS` derived from them) the `BuyBox` type, and `OFFER_PROGRAMS` (which T280 reuses for the package) (from T031, T022; the buy box input schemas, BuyBoxVersion, and the trigger that keeps the geography mode and its rows in agreement wait for buy box editing in US5, since only the seed writes buy boxes until then)

### PR: the publish fields, listing versions, and the offer and job tables

- [X] T280 Add the publish fields to ListingPackage (`round` default 1, `listingVersion` default 0, `closingWindowStart/End`, `currentlyListed?`, `eligiblePrograms` (`OFFER_PROGRAMS`), `offerDeadline?`, `publishedAt?`; status adds `ACCEPTING_OFFERS` and `WITHDRAWN`) with the CHECK `closingWindowStart ≤ closingWindowEnd`, the append-only ListingVersion table (unique `(packageId, listingVersion)`, snapshot JSONB with no PII), and the address index made partial (`WHERE status NOT IN ('CLOSED', 'WITHDRAWN')`); integration tests for the partial index and the CHECK; extend the package contracts (`OFFER_PROGRAMS`, the draft inputs accept the new fields) and add `publishInputSchema` (`{ version, offerDeadline? }`) and `withdrawInputSchema` (`{ version }`); the new statuses get their own migration (the partial index uses WITHDRAWN); the closing window is a `YYYY-MM-DD` date end to end; ListingVersion is append-only through a trigger; the draft service stores the new fields (with the merged closing-window check on update) and the duplicate-address lookup ignores withdrawn packages (from T031, T032, T116)
- [X] T281 Add Match (unique `(packageId, investorId, round)`, `matchedBuyBoxIds`, `trigger`, `firstMatchedAt`, `lastNotifiedListingVersion?`), Job (the VIII envelope plus `correlationId`; partial unique `(type, dedupeKey)` while QUEUED or PROCESSING; index `(status, runAt)`), Notification, Offer (partial unique `(packageId, investorId, round)` while ACTIVE; status ACTIVE or DECLINED for now), and OfferRevision (unique `(offerId, revision)`) with their CHECKs (offer price > 0, earnest money and fees ≥ 0) and integration tests; then the contracts shaped from them: `Match`, `Job` with `JOB_TYPES` and the MATCH_PACKAGE payload schema, `Notification` and `NotificationView`, and `Offer` with `createOfferInputSchema` / `reviseOfferInputSchema` (FINANCING required when FINANCED, also a CHECK) and `OfferView`; OfferRevision is append-only through a trigger; only the values Sprint 2 uses exist (match triggers PUBLISH and PACKAGE_EDIT, job type MATCH_PACKAGE, offer statuses ACTIVE and DECLINED) (from T031, T026, T144)

### PR: tracing and audit

- [X] T282 Add the AuditLog table (`occurredAt`, `actorType` USER or SYSTEM, `actorId?`, `action`, `entityType`, `entityId`, `outcome`, `correlationId?`, `details` JSONB with no PII; index `(entityType, entityId, occurredAt)`) with a trigger that raises on UPDATE or DELETE, and its integration test (an update and a delete are refused); `AUDIT_ACTIONS` as const in contracts; the audit repository in the unit of work (`append`, which stores the request context's trace ID as `correlationId`) and its InMemory double; `ListingPackageService.create` and `update` append their entry in the same unit of work (an update names the changed fields, never their values) (from T031, T032, T044; `listForEntity` waits for the timeline in T297)
- [X] T283 Write the tracing tests first, then carry one trace ID end to end with W3C Trace Context: the BFF keeps the trace ID of a valid incoming `traceparent` (or creates one) and sends `traceparent` to the api on every call, sign-in included; the api's first middleware reads it (a missing or malformed one gets a fresh ID) and runs the request inside an `AsyncLocalStorage` request context in packages/core; `createLogger` adds the context's ID as `trace_id` to every line, from any layer; pino-http uses it as the request ID; every error body returns it as `requestId` and every response as `X-Request-Id`, which the BFF passes back (tests: an api error body and header carry the incoming trace ID; a line logged inside a route after the JSON body is read carries it; the BFF forwards the incoming trace ID and creates one when it is missing or malformed) (the job half moves to T288, which stores the context's ID on enqueue, and T294, which restores it per job)

### PR: idempotency (Postgres)

- [X] T284 Write the idempotency integration test in apps/api/test/idempotency.int.test.ts (Testcontainers PostgreSQL 17): a POST or PATCH without `Idempotency-Key` → 400; the key store unreachable → 503 with `Retry-After: 5`; a replay with the same key and body → the stored status and body plus `Idempotent-Replay: true`; a concurrent duplicate → 409 with `Retry-After: 1`; the same key with a different body → 422; a 5xx response is not stored; keys are per user (from T076)
- [X] T285 Implement the IdempotencyKey table (`userId`, `key`, `method`, `path`, `bodyHash`, `status` IN_PROGRESS or DONE, `responseStatus?`, `responseBody?`, `createdAt`; unique `(userId, key)`; rows older than 24 h are ignored and replaced) and the `idempotency` middleware for POST and PATCH in apps/api/src/middleware/idempotency.ts (claim with an insert, store the response on `finish`, skip 5xx; a database error fails closed with 503 and `Retry-After: 5`; the api has no PUT routes, so POST and PATCH are every mutating method); `createApiClient` sends a fresh `Idempotency-Key` for each POST and PATCH unless one is passed, and the BFF forwards it (depends on T284) (from T077, T030, T091)

### PR: matching (packages/core)

- [X] T286 Write the evaluator tests in packages/core/src/registry/evaluators.test.ts: for each criterion one passing and one failing listing; a null criterion passes; a null listing value a non-null criterion needs fails with `actual: null` (fail closed, FR-025); `price` passes only when `priceMin ≤ priceExpectationMax ≤ priceMax`; `closingSpeed` passes only if `closeWithinDays` covers the closing window; `listedStatus` fails only for a listed home when `acceptsListed` is false; `programs` needs one shared program; NATIONWIDE passes any ZIP; a box matches only if every criterion passes (from T054; the fast-check property waits with the SQL fragments)
- [X] T287 Implement the evaluator layer in packages/core/src/registry/: `evaluators.ts` (`EVALUATORS` `satisfies Record<CriterionKey, …>`, pure; `EVALUATOR_VERSION = 1`), `evaluate-buy-box.ts`, and `listing-facts.ts` (`toListingFacts(pkg, property)`, the flat fact object with no PII, which is also the ListingVersion snapshot; the day matching runs is passed to the evaluator instead, so the snapshot stays the same whenever it is read) (depends on T286) (from T055)
- [X] T288 Create the repositories and their InMemory doubles: investor (`findById`), buy box (`listCandidates(zip, state, now)`: ACTIVE boxes of ACTIVE investors with unexpired proof of funds, whose geography is NATIONWIDE or contains the ZIP or state), listing version (`append`, `findLatest`), match (`upsert` that returns whether the row is new, `countByPackage`, `findOne`, `listForInvestor`, `listByPackage`), notification (`create`, `listForUser`, `markRead`), and job (`enqueue` with `ON CONFLICT DO NOTHING`, storing the request context's trace ID as `correlationId`, `claimNext(workerId, now)` with `FOR UPDATE SKIP LOCKED`, `reclaimStale`, `complete`, `fail` with retry up to `maxRetries` then FAILED); add them to the unit of work; also `users.findIdByInvestorId` (to notify an investor), `packages.findById` (for the system), `match.markNotified`, and `offers.declineOpen` (for withdraw). Built only what this PR calls: `match.findOne` and `listForInvestor` move to T295, `match.countByPackage` to T298, and `notification.listForUser` and `markRead` to T297; `investor.findById` is not needed (matching and offers key on the investor ID in the session) (from T051, T052, T057, T121)
- [X] T289 Write the job integration test in packages/core/test/jobs.int.test.ts: the same `(type, dedupeKey)` while QUEUED returns the existing job; two concurrent `claimNext` calls never claim the same job; a failure re-queues until `maxRetries`, then FAILED with a redacted error; a PROCESSING job locked over 60 s ago is reclaimed (from T056)
- [X] T290 Write the PublicationWorkflow tests in packages/core/src/workflows/publication/PublicationWorkflow.test.ts: a publish with missing or invalid fields → one ValidationError listing every failing field (at least 1 photo; `offerDeadline` > now and ≤ now + 30 days; closing window start ≥ today; `currentlyListed` set; at least one program; the fields the type requires: LAND needs `lotSqft`, MULTI_FAMILY needs `units`, every other type needs beds, baths, sqft, year built, and condition); only the owning agent can publish or withdraw; only a DRAFT can be published; a valid publish sets ACCEPTING_OFFERS, `publishedAt`, `listingVersion` 1 with its snapshot, and the default deadline, and enqueues MATCH_PACKAGE (dedupe `MATCH_PACKAGE:{id}:{round}:{listingVersion}`) and appends PACKAGE_PUBLISHED in the same unit of work; a material edit after publish writes `listingVersion` + 1 with a new snapshot and a new MATCH_PACKAGE, and a non-material edit does neither; withdraw sets WITHDRAWN, declines open offers, notifies matched investors, and frees the address (from T110, T123)
- [X] T291 Implement `PublicationWorkflow` (`publish`, `withdraw`) in packages/core/src/workflows/publication/PublicationWorkflow.ts and the material-edit path in `ListingPackageService.update` (depends on T290) (from T125, T123)
- [X] T292 Write the MatchingWorkflow tests in packages/core/src/workflows/matching/MatchingWorkflow.test.ts: inactive investors, expired proof of funds, and PAUSED boxes never match (FR-024); one Match per investor with every matching box in `matchedBuyBoxIds`; exactly one Notification per newly matched investor, naming both of `summit@example.com`'s boxes (FR-022), with no seller detail; after a material edit, already-matched investors get one "listing changed" notification and new matches get a match notification; a re-run creates no new Match or Notification; the run appends one MATCH_DECISION audit entry per matched investor (matched box IDs and versions, listing version, `EVALUATOR_VERSION`, each criterion's result, no PII) and one MATCHING_COMPLETED entry with the matched count (from T111, T044)
- [X] T293 Implement `MatchingWorkflow.evaluatePackage(packageId, round, listingVersion)` and the MATCH_PACKAGE handler with its payload schema check, in packages/core/src/workflows/matching/ and packages/core/src/jobs/; record when matching runs (on the event, not a nightly batch, and where batch runs fit) in research.md R24 (depends on T292) (from T126, T058)
- [X] T294 Give the worker its env, its container (the database, the job handlers, the error reporter), and the job loop in apps/worker/src/: every second reclaim stale jobs, then claim and run one inside the job's trace context (its `correlationId`, or a fresh ID), so every line of the run logs it; stop claiming on SIGTERM and let the running job finish. Every job run goes through the worker error translator in apps/worker/src/error-translator.ts (VII): it classifies a DomainError (the job fails without retry, not reported) and anything else (retried, then reported through `IErrorReporter` when the job is FAILED), and logs the correlation ID, `job_id`, `type`, and the payload with PII redacted (`redactPii`). Write its test first: a handler failure is logged with the job's correlation ID and the redacted payload, and an unexpected one is reported (from T082, T083; no Redis)

### PR: investor reads and offers (packages/core)

- [X] T295 Write the investor view tests, then implement them: `InvestorPackageView` and `InvestorPackageSummary` carry no `fullName`, `email`, `phone`, or `streetLine` key (SC-006); `InvestorPackageQueryService.listMatched` returns the investor's matched packages newest first with the deadline, the status, and their offer status, and `getForInvestor` → 404 unless a Match row exists for that investor, package, and round (from T108, T127)
- [X] T296 Write the OfferService tests: an investor without a Match → 404; after `offerDeadline` or on a withdrawn package → BusinessRuleError naming why; a second offer while one is active → BusinessRuleError pointing to revise; revise writes revision n+1 and needs the current `version`; only the package's agent can list its offers; create and revise append OFFER_SUBMITTED and OFFER_REVISED; then the duplicate-offer integration test (two concurrent creates → one row); then implement `OfferService` (create, revise, listForPackage; the investor's own offer comes with the package view, so no separate getMine) (from T140, T142, T145, T146)
- [X] T297 Implement `NotificationService` (`listMine`, `markRead`, only the user's own) and the package timeline query (the audit repository's `listForEntity`, and `listForPackage`: the package's audit entries, newest first, for its agent only) in packages/core/src/services/ (from T128, T044)

### PR: api

- [X] T298 Add the routes in contracts/api.md: `POST /listing-packages/:id/publication`, `POST /listing-packages/:id/withdrawal`, `GET /listing-packages/:id/timeline`; the agent view gains `matchedCount`; `GET /investor/packages`, `GET /investor/packages/:id`; `POST /listing-packages/:id/offers`, `PATCH /offers/:offerId`, `GET /listing-packages/:id/offers` (agent); `GET /notifications`, `POST /notifications/:id/read`; each route checks the caller's role through the service; wire them in container.ts and app.ts; publication and withdrawal answer 200 with the agent view (api.md); the typed client calls arrive with the screens that use them, T300–T302 (from T129, T132, T150, T151)

### PR: seed

- [X] T299 Seed the demo investors and their buy boxes in the migrate step (upsert by email, as for the agent): `summit@example.com` (two boxes that both match the sample listing: Austin 78704, single family, Fair condition, $250k–$300k), `harbor@example.com` (one NATIONWIDE box), `ridge@example.com` (a narrow box that does not match), each with a User (INVESTOR, `demo1234`) and proof of funds a year out; record the sample listing and its expected matches in packages/core/src/infra/seed/expected-matches.json, which the seed test checks; the rehearsal signs in with every seeded account (from T138, T139)

### PR: screens (apps/web)

- [X] T300 Send each role home after sign-in (AGENT → `/agent`, INVESTOR → `/investor`); list the demo accounts on the login page so one press fills each; protect `/investor/*` in proxy.ts and add the investor layout with the notification inbox (badge count, list, mark read); show the `requestId` with every error message, so a user can quote it to support (from T105, T137)
- [X] T301 Agent side: the publish fields on the package form; a Publish button on each DRAFT row of `/agent` and on the package page, with every blocking field listed and linked; the status on each row; the matched-investor count; Withdraw with a confirmation; the offers on the package page; and the timeline (published, matched N, edited, offers, withdrawn) (from T133, T135, T154)
- [X] T302 Investor side: the dashboard (matched packages newest first, time left to the deadline, "Offer made" badge, withdrawn packages marked), the privacy-safe package page (city, ZIP, facts, photos, price range, deadline; "not found" for a package not shared with them), and the offer form (every term; create, then revise until the deadline; the deadline-passed and withdrawn notices); write the offer form hook test first: double submit sends one request with one `Idempotency-Key`, field errors land on their fields (from T136, T143, T152, T153)

**Checkpoint**: `docker compose up --build` on a clean machine; avery publishes the sample
package (a publish with a field missing names it); within seconds summit and harbor each have
one notification and see the package with no seller details, and ridge gets "not found"; summit
makes and revises an offer, and a retried submit returns the same offer; avery edits the price,
and summit gets one "listing changed" notification; avery sees 2 matched investors, summit's
offer at its latest revision, and the timeline; any error shows a request ID that finds the
whole request in the api and worker logs; avery withdraws, and summit sees it withdrawn; the
submission rehearsal passes.

---

## Sprint 3: The Agent Compares Offers, the Seller Chooses, and the Deal Is Tracked to Closing

**Goal** (owner, 2026-11-01: "Next up: Sprint 3, comparing offers and closing the deal"): the offer
round ends on time: a job closes it at the deadline (a package with no offers moves to "No offers
received") and another expires each offer at its expiry. Investors can withdraw an offer. The
agent compares the offers side by side by estimated net proceeds, closing date, and certainty, with
the calculation explained, and records the seller's choice: accept one, counter one, or decline
all. Only one offer can ever be accepted; the others become backup offers, which their investors
can withdraw or extend. The winner sees the seller's contact details and the street. The agent
moves the deal through its milestones in order to closing; a deal that falls through can promote a
backup, who must reconfirm within 48 hours. With no backups left, the agent reopens the package for
a new round or withdraws it, and a package with no offers can have its deadline extended.

**Decisions** (proposed by Claude on 2026-11-01 while the owner was away, following spec.md,
data-model.md, and contracts/api.md; confirmed by the owner on 2026-11-01):
- **Time-based rules are durable jobs** (FR-059, VIII), scheduled with a `runAt` in the same change
  that sets the time: `CLOSE_OFFER_ROUND` at the deadline (dedupe
  `CLOSE_OFFER_ROUND:{packageId}:{round}:{deadline}`), `EXPIRE_OFFER` at each revision's expiry
  (`EXPIRE_OFFER:{offerId}:{revision}`), and `EXPIRE_RECONFIRMATION` at `reconfirmBy`
  (`EXPIRE_RECONFIRMATION:{dealId}`). Each handler re-reads the row and does nothing when the job
  is stale (a newer deadline, revision, or decision), so a late or repeated job is harmless. The
  worker claims due jobs by the injected clock, so a test can move time instead of sleeping.
- **The deadline closes the round, not the package.** With no open offers the package moves to
  NO_OFFERS_RECEIVED and the agent is told; with offers it stays ACCEPTING_OFFERS, new offers and
  revisions are refused (FR-044, already enforced), and the agent can still decide (data-model.md).
- **Statuses follow data-model.md's state machines.** The package adds NO_OFFERS_RECEIVED,
  OFFER_ACCEPTED, UNDER_CONTRACT, INSPECTION, CLOSING, CLOSED, and FELL_THROUGH (CLOSED joins
  WITHDRAWN in freeing the address); the offer adds COUNTERED, WITHDRAWN, EXPIRED, ACCEPTED,
  FELL_THROUGH, BACKUP, and DECLINED_TO_RECONFIRM, and the one-offer index covers ACTIVE, COUNTERED,
  BACKUP, and ACCEPTED (FR-042, FR-045). A Deal row tracks the accepted offer; at most one deal per
  package is active (a partial unique index, FR-053). Decisions are append-only rows.
- **Exactly one acceptance wins** because accepting first inserts the Deal: a second, concurrent
  accept waits on the unique index and gets "This package already has an accepted offer" (409).
- **A decision names the version it acted on:** the offer's for ACCEPT and COUNTER (an offer
  revised since the agent opened it is refused, so the seller never accepts terms they did not
  see), and the package's for DECLINE_ALL and a backup promotion.
- **Counters are agent revisions** (FR-052). The offer then shows the counter terms as COUNTERED,
  visible only to that investor, who accepts them (a new investor revision with those terms),
  declines them (a new investor revision restoring their last own terms; the agent is told), or
  revises freely before the deadline. Every revision schedules its own EXPIRE_OFFER.
- **Net proceeds come from configuration** (FR-051, IX): a ConfigEntry table holds `netProceeds`
  (`closingCostPct` 0.02, `flatFees` $1,500, demo values) and `reconfirmHours` (48), seeded in the
  migrate step and read when offers are compared or a backup is promoted. Editing them is the ops
  config screen (US6). `estimatedNetProceeds = price − feesAndConcessions − round(price ×
  closingCostPct) − flatFees`, with each subtraction listed. Certainty ranks by number of
  contingencies, with cash ahead of financed on ties.
- **The seller's choice is recorded by the agent** (FR-052); ops cannot record decisions (FR-080).
  The comparison, decisions, and the deal tracker are the package's agent's only; the ops views of
  them come with US6.
- **The winner sees the seller** (FR-031): only the investor whose offer is ACCEPTED on the
  package's active or closed deal gets the seller's name, email, phone, and street, and each such
  read writes a PII_ACCESSED audit entry. After a fall-through they get the PII-free view again;
  backups never see PII. The investor view also carries their own deal's status and `reconfirmBy`,
  so the buyer sees the milestone and a promoted backup sees their countdown, without a separate
  deal route for investors.
- **Milestones only in order** (FR-055): OFFER_ACCEPTED → UNDER_CONTRACT → INSPECTION → CLOSING →
  CLOSED; anything else is refused with the allowed next steps. The package status mirrors the
  deal. Closing declines the remaining backups. The fall-through reason and a decision's note are
  free text that could hold seller details, so they are encrypted at rest like the seller columns
  (XII), shown only to the agent, and kept out of audit details and notices.
- **Reopen and extend.** Reopen (from NO_OFFERS_RECEIVED or FELL_THROUGH) starts round + 1 with a
  new deadline, a new listing version, and a new MATCH_PACKAGE (match trigger REOPEN), so matched
  investors are told again (FR-058); leftover backups are declined. Extend (from ACCEPTING_OFFERS or
  NO_OFFERS_RECEIVED) sets a later deadline in the same round and tells the matched investors.
  Withdraw also works from NO_OFFERS_RECEIVED and FELL_THROUGH. Both are refused while a promoted
  backup is still deciding. Reopen answers 200 with the agent view, like publish (contracts/api.md
  is updated), since there is no job status route yet.
- **Offer withdrawal** (FR-043, FR-054): an ACTIVE, COUNTERED, or BACKUP offer can be withdrawn at
  any time before it is accepted, even after the deadline; a BACKUP offer's expiry can be extended
  after the deadline (only `expiresAt` changes, as a new revision).
- **Notifications stay in-app**, written in the same change (as in Sprint 2; the outbox events in
  events.md wait with the outbox, T059–T064): the winner, the backups, and the other matched
  investors on acceptance (FR-054); the investor on a counter, decline, milestone, fall-through,
  and promotion; the agent on the round closing, a counter response, and a reconfirmation or its
  timeout. The agent's layout gets the same inbox as the investor's.
- **Seeded deal data:** a second agent, `blake@example.com`, with a package that has offers from
  four investors (summit, harbor, and two new ones; ridge's narrow box does not fit it), so the
  comparison works at once; the later deal states (inspection, fallen through, closed) are reached
  by clicking through, and T177 keeps seeding them.
- **Later scope, not deviations:** REJECTED audit entries for refused actions (a refusal rolls back
  its change, so it needs its own transaction); the ops views of offers and deals (US6); the
  revision history drawer and the "investor deactivated" flag (T154).
- Tasks are listed in merge order, one PR per group. A task split out of a larger one names its
  source; the source keeps the rest.

### PR: plan (this section)

- [X] T303 Record the Sprint 3 goal, decisions, and tasks in this section; update plan.md Complexity Tracking (in-app notices only, now also for decisions and deals) and contracts/api.md (reopen answers 200 with the agent view; the deal route is the agent's; the investor view carries the buyer's deal and the winner's seller contact); add "Sprint 3" to the board's Sprint field and mirror the section (`node scripts/board/sync-sprint.mjs --sprint 3 --apply`)

### PR: the deal tables

- [X] T304 Add the Sprint 3 schema with its integration tests: the package statuses (their own migration, as before) with the address index freed by CLOSED as well as WITHDRAWN; the offer statuses with the one-offer index over ACTIVE, COUNTERED, BACKUP, and ACCEPTED; `OfferRevision.author` (INVESTOR or AGENT, default INVESTOR); the Decision table (append-only: `packageId`, `round`, `type` ACCEPT, COUNTER, or DECLINE_ALL, `offerId?` required for ACCEPT and COUNTER by a CHECK, `actorUserId`, `note?`, encrypted); the Deal table (`packageId`, `offerId` unique, `status`, `fellThroughReason?` required when FELL_THROUGH and encrypted, `promotedFromBackup`, `reconfirmBy?` required while PENDING_RECONFIRMATION, `version`; one active deal per package, a partial unique index); ConfigEntry (`key` unique, `value` JSONB, `updatedAt`); the match trigger REOPEN; and the Sprint 3 notification types; then the contracts shaped from them: the statuses, `Deal` and `Decision`, the config value schemas (`netProceeds`, `reconfirmHours`), and the new audit actions with their timeline wording; each job type and its payload schema arrive with its handler (T306, T311), because a job type without a handler fails the build (from T031, T032, T164)

### PR: the offer round on time (packages/core)

- [X] T305 Schedule a job for later: `jobs.enqueue` takes an optional `runAt`, and `claimNext(workerId, now)` claims only jobs due by the injected clock, which the worker passes; extend packages/core/test/jobs.int.test.ts (a job due later is not claimed until then) (from T056)
- [X] T306 Close the offer round at the deadline and expire offers at their expiry (the CLOSE_OFFER_ROUND and EXPIRE_OFFER job types, their payload schemas, and their handlers in packages/core/src/jobs/; handler tests first): publish, reopen, and an extended deadline schedule CLOSE_OFFER_ROUND at the deadline, and every offer revision schedules EXPIRE_OFFER at its expiry, in the same change; at the deadline a package with no open offers moves to NO_OFFERS_RECEIVED, its agent is notified, and OFFER_ROUND_CLOSED is audited, and one with offers stays ACCEPTING_OFFERS; a job for an old deadline does nothing; an ACTIVE, COUNTERED, or BACKUP offer past its expiry becomes EXPIRED (audited, investor told), and a job for an older revision or an accepted offer does nothing (from T141, T147, T148)
- [X] T307 Withdraw offers and reopen or extend a package's round (tests first): offer withdrawal (`OfferService.withdraw`: ACTIVE, COUNTERED, or BACKUP, by its investor, even after the deadline; audited OFFER_WITHDRAWN; a new offer is allowed afterwards before the deadline) and, in `PublicationWorkflow`, `reopen` (from NO_OFFERS_RECEIVED: round + 1, a new deadline, listing version + 1 with its snapshot, MATCH_PACKAGE for the new round, leftover backups declined, audited PACKAGE_REOPENED) and `extendDeadline` (from ACCEPTING_OFFERS or NO_OFFERS_RECEIVED: a later deadline within 30 days, the matched investors told, audited OFFER_DEADLINE_EXTENDED); withdraw also from NO_OFFERS_RECEIVED and declines COUNTERED and BACKUP offers too; a MATCH_PACKAGE job names its trigger (PUBLISH, PACKAGE_EDIT, or REOPEN), so a reopened round's matches say so; reopen and withdraw from FELL_THROUGH, refused while a promoted backup is deciding, arrive with deals in T311 (from T146, T148, T125)

### PR: comparing and deciding (packages/core)

- [X] T308 Compare offers by net proceeds (tests first): `computeNetProceeds(offer, assumptions)` and `certaintyRank(offer)` in packages/core/src/services/offer-comparison/net-proceeds.ts and `OfferComparisonService.compare(actor, packageId, query)` (the package's agent only; ACTIVE, COUNTERED, and BACKUP offers in the round with the investor's company name, each row's breakdown, and `acceptable` false for an expired or non-ACTIVE offer; sorted by net proceeds (desc), closing date (asc), or certainty (asc); the `netProceeds` assumptions from ConfigEntry returned with the rows); add the config and investor repositories it reads (from T156, T157, T166)
- [X] T309 Record the seller's decision: accept one offer, counter one, or decline all (`DecisionWorkflow` in packages/core/src/workflows/decision/; tests first): ACCEPT inserts the Deal first (the unique index turns a second accept into BusinessRuleError "This package already has an accepted offer"), then sets the offer ACCEPTED, every other ACTIVE or COUNTERED offer BACKUP, and the package OFFER_ACCEPTED, writes the Decision, audits DECISION_RECORDED with the backup offer IDs, and notifies the winner, each backup, and every other matched investor; an expired or non-ACTIVE offer, or a stale offer version, is refused; the decision repository encrypts the note with `IPiiCipher` (an integration test: it is not stored as plain text; a unit test: it reaches no audit entry or notification); COUNTER writes an AGENT revision, sets COUNTERED, and notifies that investor only; DECLINE_ALL declines every open offer and notifies each investor; only the package's agent decides (OPS → ForbiddenError); then the accept race integration test in packages/core/test/decisions.int.test.ts (two concurrent accepts of different offers → one Deal, and the loser gets BusinessRuleError; the same run checks the note is stored encrypted) (from T158, T162, T165, T167)
- [X] T310 Let investors answer a counter and keep a backup offer (tests first), in `OfferService`: `respondToCounter` (ACCEPT adopts the counter terms as a new INVESTOR revision and sets ACTIVE; DECLINE writes a new INVESTOR revision with the investor's last own terms, sets ACTIVE, and notifies the agent; only the offer's investor), a revise of a COUNTERED offer (ACTIVE again, before the deadline), and extending a BACKUP offer's expiry (only `expiresAt` may change; allowed after the deadline) (from T159, T169)

### PR: the deal to closing (packages/core)

- [X] T311 Track the deal to closing, with fall-through and backup promotion (`DealLifecycleWorkflow` in packages/core/src/workflows/deal-lifecycle/; tests first, FakeClock): `get` (the package's latest deal for its agent, with `allowedNextMilestones` and the backups ranked by net proceeds, an expired one marked and not promotable); `recordMilestone` (only in order, otherwise ConflictError with `allowedNext`; the package mirrors the deal; the buyer is notified; audited DEAL_MILESTONE; CLOSED refuses every change and declines the remaining backups); `fallThrough` (a reason, required, which the deal repository encrypts with `IPiiCipher` (an integration test: it is not stored as plain text; a unit test: it reaches no audit entry or notification); the deal, the winning offer, and the package FELL_THROUGH; the buyer told; audited DEAL_FELL_THROUGH); `promoteBackup` (an unexpired BACKUP offer on a FELL_THROUGH package; a Deal in PENDING_RECONFIRMATION with `reconfirmBy` = now + `reconfirmHours`, EXPIRE_RECONFIRMATION queued for then; the investor told; audited BACKUP_PROMOTED); `reconfirm` (CONFIRM → the deal and the package OFFER_ACCEPTED and the offer ACCEPTED; DECLINE → RECONFIRM_DECLINED and the offer DECLINED_TO_RECONFIRM; the agent told either way); reopen and withdraw from FELL_THROUGH (refused while a promoted backup is deciding); and the EXPIRE_RECONFIRMATION job type and handler (the same as DECLINE once `reconfirmBy` passes; a reconfirmed deal is untouched); then the deal timer integration test in packages/core/test/deal-timer.int.test.ts (promote, recreate the job runner as after a restart, move the clock 48 h: EXPIRE_RECONFIRMATION runs once and the deal is RECONFIRM_DECLINED) (from T160, T163, T168)
- [X] T312 Reveal the seller to the winning investor only (test first), in `InvestorPackageQueryService.getForInvestor`: only the investor whose offer is ACCEPTED on the package's active or closed deal gets `sellerContact` and `streetLine`, each such read audits PII_ACCESSED, and a backup or a fallen-through buyer gets the PII-free view; the view carries the investor's own deal (`status`, `reconfirmBy`) (from T161, T170)

### PR: api

- [X] T313 Add the routes in contracts/api.md: `POST /offers/:offerId/withdrawal`, `/counter-response`, and `/reconfirmation`; `POST /listing-packages/:id/reopening` and `PATCH /listing-packages/:id/offer-deadline`; `GET /listing-packages/:id/offer-comparison`; `POST /listing-packages/:id/decisions` (201 with the Decision); `GET /listing-packages/:id/deal`, `POST /deals/:dealId/milestones`, `POST /deals/:dealId/fall-through`, and `POST /listing-packages/:id/backup-promotions` (201 with the deal); wire the services in the api container (the worker's container already registers the three new job handlers: CLOSE_OFFER_ROUND and EXPIRE_OFFER in T306, EXPIRE_RECONFIRMATION in T311) (from T150, T171, T129)

### PR: seed

- [X] T314 Seed the deal demo in the migrate step: `blake@example.com` (AGENT, `demo1234`), two more investors (`cobalt@example.com`, `dune@example.com`, whose boxes fit Blake's listing and not the sample listing), and one published package of Blake's in Austin (78745), matched to four investors whose boxes really fit it, each with an offer that differs in price, payment, contingencies, and closing date, so the comparison and acceptance work at once; the config entries; the rehearsal signs in as Blake (from T177)

### PR: screens (apps/web)

- [X] T315 Agent comparison and decisions: a "Compare offers" link on the package page; the comparison page at `/agent/packages/[id]/compare` (every offer side by side; sort by net proceeds, closing date, or certainty; a breakdown popover for each net figure; expired offers marked and not selectable); accept with confirmation, counter with the offer terms, and decline all with a note, never optimistic (XIII); a 409 shows its message; the typed client calls for these routes; the agent's layout gets the notification inbox (from T172, T173, T174)
- [X] T316 Agent deal tracker and the round controls: the deal page at `/agent/packages/[id]/deal` (the milestones as a step list; buttons only for the allowed next milestones; fall through with a required reason; the ranked backups with Promote; reopen with a new deadline or withdraw when none remain); Extend deadline on an open or no-offers package and Reopen on a no-offers package, on the package page; the new statuses and timeline entries labelled (from T175)
- [X] T317 Investor side: withdraw an offer (with confirmation); a counter shown with Accept, Decline, or revise; a backup notice with withdraw and extend expiry; a reconfirm panel with the time left before `reconfirmBy`; the buyer's deal status; the seller contact card for the winner; the dashboard badges for the new offer statuses (from T176)

Every screen in T315–T317 keeps XI: each control has a label, dialogs and popovers move focus in and back and work from the keyboard, refusals are announced as alerts, and a countdown is announced politely, not every second.

**Checkpoint**: `docker compose up --build` on a clean machine; Blake opens the seeded package,
compares the offers sorted by net proceeds with each breakdown, and accepts the top one; the
winner sees the seller's contact details (one PII_ACCESSED entry) and the others see "Backup
offer"; Blake moves the deal to Under contract and Inspection, and a skip to Closed is refused with
the allowed steps; Blake marks it fell through, promotes the best backup, and that investor
reconfirms, so the deal is back at "Offer accepted"; Blake closes it, and the address is free;
avery publishes a package that gets no offers, and at the deadline it shows "No offers received"
and can be reopened; `pnpm test:integration` covers the accept race and the reconfirmation timer;
the submission rehearsal passes.

---

## Sprint 4: Investors Manage Their Buy Boxes, and Operations Import the Investor List

**Goal** (owner, 2026-11-01: "finish User Story 5"): an investor creates, edits, pauses, and
resumes one or more buy boxes, and a refused save names the field and says why. Saving a box
matches it at once against every package still taking offers, and a new match appears on the
investor's dashboard and in their inbox. Operations upload the legacy investor spreadsheet: valid
rows create or update the investor and their one default buy box, each invalid row is reported
with its reason, and importing the same file again duplicates nothing.

**Decisions** (proposed by Claude on 2026-11-01 while the owner was away, following spec.md,
data-model.md, contracts/api.md, and contracts/investor-import.md; for the owner to confirm):
- **The registry holds the rules** (XIX.3): each criterion's definition in
  packages/contracts/src/buy-box/criteria.ts gains its field schema and form metadata, and
  `buyBoxInputSchema` is composed from them, so the editor, the service, and the import share one
  set of rules. A refusal names the field and says why: min above max ("Min price must not be above
  max price"), an empty list ("Choose at least one, or leave it blank for any"), a state that is not
  a US state code, or a geography mode that disagrees with its entries. One rule needs I/O and so
  lives in the service: every ZIP must be known to `IGeoProvider` (the same check the import uses).
  The database CHECKs from Sprint 2 stay as the last line.
- **A save is versioned and matched in one change** (FR-060, FR-023): `version` + 1, a
  BuyBoxVersion snapshot (append-only), an audit entry, and, when the criteria or the status
  changed, a MATCH_BUY_BOX job (dedupe `MATCH_BUY_BOX:{buyBoxId}:{version}`). A rename or a new
  strategy label matches nothing new. A stale `version` is a ConflictError. Pause and resume are a
  status change. An investor sees and saves only their own boxes; the ops views come with US6.
- **Matching a saved box** (FR-023): `MatchingWorkflow.evaluateBuyBox` runs the evaluator against
  the current listing version of every package still accepting offers whose deadline has not
  passed. A box that was saved again since, paused, or whose investor is inactive or has expired
  proof of funds matches nothing (a stale job is harmless). A new match is created with trigger
  BUY_BOX_CHANGE, an in-app "matches your buy box" notice, and a MATCH_DECISION audit entry, as a
  publish's matches are; an investor already matched to the package gets the box added to the
  match and no second notice. An edit that stops a box matching leaves its matches alone, so
  shared packages stay visible.
- **The daily digest waits for the outbox** (deviation, in plan.md Complexity Tracking): FR-023's
  digest is an email, and email is delivered only through the outbox (T059–T064, US6). Until then
  a buy box match reaches the dashboard and the inbox, and nothing is sent by email or SMS. The
  digest tasks (T220, T221) move to the outbox's sprint.
- **Missed-by-one-criterion** (T222, T223) is a stretch in Phase 7 and is left out of this sprint.
- **The import follows contracts/investor-import.md.** The browser uploads the CSV with an
  `UploadInstruction` (`text/csv`, at most 5 MB), the api checks it with `stat`, records an
  ImportBatch, and queues IMPORT_INVESTORS (202). The worker reads the file through a new
  `IStorageProvider.read` (the sandbox gets an internal read route; S3 uses GetObject), so the
  worker now gets the storage settings. Each row runs in its own change; a row result is unique per
  batch and row, so a retried job skips the rows it already did. A row matches an investor by
  `Investor ID` (the new `Investor.externalRef`), else by email; an email that already belongs to
  another investor rejects the row. The batch's status comes from its job, with a file-level
  refusal (too large, too many rows, a missing required column) recorded on the batch.
  IMPORT_COMPLETED is audited with the counts. Imported investors get no sign-in: the file carries
  no passwords, and inviting them is later scope.
- **A small ops area**: `morgan@example.com` (OPS) is seeded, signs in to `/ops`, and has one page,
  Import investors. The rest of the ops screens come with US6.
- **Seed**: each seeded buy box gets its version 1 snapshot. The sample file is
  `seed/legacy-investors.csv` at the repository root, where the reviewer can find it.
- Tasks are listed in merge order, one PR per group. A task split out of a larger one names its
  source; the source keeps the rest.

### PR: plan (this section)

- [X] T318 Record the Sprint 4 goal, decisions, and tasks in this section; add the digest deferral to plan.md Complexity Tracking; add "Sprint 4" to the board's Sprint field and mirror the section (`node scripts/board/sync-sprint.mjs --sprint 4 --apply`)

### PR: the tables

- [ ] T319 Add the Sprint 4 schema with its integration tests: `Investor.externalRef` (unique, nullable); the BuyBoxVersion table (`buyBoxId`, `version`, `snapshot` JSONB, `createdBy`; unique per box and version; append-only, a trigger); the match trigger BUY_BOX_CHANGE (its own migration); ImportBatch (`fileName`, `storageKey`, `jobId?`, `totalRows?`, `imported`, `updated`, `rejected`, `ignoredColumns`, `error?`, `createdBy`, `finishedAt?`) and ImportRowResult (`batchId`, `rowNumber`, `outcome` IMPORTED, UPDATED, or REJECTED, `reason?`, `investorId?`; unique per batch and row); then the contracts shaped from them; each job type arrives with its handler (T321, T322) (from T030, T031, T184)

### PR: buy boxes (packages/contracts, packages/core)

- [ ] T320 Put the buy box rules in the registry (tests first): each criterion's field schema and form metadata in criteria.ts, `buyBoxInputSchema` (name, strategy, status, geography mode and its states or ZIP codes, every criterion, each blank for "any") composed from them, and the US state codes; each rule's refusal names its field (from T022)
- [ ] T321 Save buy boxes and match them (tests first): `BuyBoxService` (`list` default first, `get`, `create`, `update` with pause and resume; only the investor's own; the ZIP codes checked with `IGeoProvider`; version + 1, the BuyBoxVersion snapshot, BUY_BOX_SAVED audited, and MATCH_BUY_BOX when the criteria or status changed, all in one change; a stale version is a ConflictError); the buy box repository's reads and writes; `MatchingWorkflow.evaluateBuyBox` and the MATCH_BUY_BOX job type, payload schema, and handler (from T178, T185, T218, T219)

### PR: the import (packages/core, apps/sandbox, apps/worker)

- [ ] T322 Import the legacy investor file (tests first): `seed/legacy-investors.csv` (30 rows: 26 valid, 4 invalid, one unknown column); `parseLegacyCsv` (columns only; each row mapped to the buy box input and checked with `buyBoxInputSchema`, failures reported with the CSV column name); `IStorageProvider.read` with the sandbox's internal read route and S3's GetObject; `InvestorImportWorkflow` (`requestUpload`, `start`, `run`, `getBatch`) with the import repository; the IMPORT_INVESTORS job type and handler; the worker's storage settings; then packages/core/test/investor-import.int.test.ts (26 imported and 4 rejected, then 0 imported, 26 updated, and 4 rejected, with the investor, buy box, and version counts unchanged) (from T179, T180, T181, T182, T184, T186)

### PR: api and seed

- [ ] T323 Add the routes in contracts/api.md: GET and POST `/investor/buy-boxes`, GET and PUT `/investor/buy-boxes/:id`; POST `/ops/investor-imports/uploads`, POST `/ops/investor-imports` (202), and GET `/ops/investor-imports/:batchId`; the idempotency middleware covers PUT as well as POST and PATCH, since the buy box save is the api's first PUT (XX.2; plan.md and contracts/api.md updated), with a test that a retried PUT replays its answer; the typed client modules; seed `morgan@example.com` (OPS) and each seeded box's version 1 snapshot (from T183, T187)

### PR: screens (apps/web)

- [ ] T324 Investor buy boxes: the list at `/investor/buy-boxes` (name, status, strategy, default badge; add a box; pause and resume) and the editor at `/investor/buy-boxes/[id]` and `/investor/buy-boxes/new`, its fields generated from the registry's form metadata, each criterion blank for "any", field-level errors, and a note that changes apply to new packages and to packages still taking offers; a link in the investor header (from T188)
- [ ] T325 The ops area and its import page: OPS signs in to `/ops`; the page at `/ops/imports` uploads the CSV with the returned instruction, polls the batch, and shows the counts, the ignored columns, and a table of row results with reasons (from T189)

Every screen in T324–T325 keeps XI: each field has a label, errors are tied to their field and
announced, and the upload's progress is announced politely.

**Checkpoint**: `docker compose up --build` on a clean machine; harbor saving Min Price above Max
Price is refused with the field named, and clearing every property type is refused; ridge adds
a second box whose ZIP code covers an open package that ridge's narrow box does not fit, and the
package appears on ridge's dashboard and inbox within a minute; a paused box matches nothing;
morgan imports `seed/legacy-investors.csv` (26 imported, 4 rejected with reasons) and again (0
imported, 26 updated, 4 rejected), with one default box per investor; the submission rehearsal
passes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Contracts, database, core infrastructure, the outbox and job engine, providers,
the sandbox, and app skeletons that every story needs.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

**Phase rule**: Phase 2 starts only after Sprint 0 is complete, and no work starts outside its
phase. A task that belongs to a later phase moves there instead of being pulled forward. Every
task merges through the Sprint 0 pipeline (CI, Claude review, and the submission
rehearsal on `main`).

### Contracts (packages/contracts)

- [ ] T273 [P] Add `investorId?` to `actorSchema` in packages/contracts/src/auth/ when the Investor table and the INVESTOR role arrive; `createSessionSchema` is unchanged (remainder of T020, which Sprint 1 built without it)
- [ ] T016 [P] Create common schemas in packages/contracts/src/common/ (IDs are plain strings: the database creates them, and lookups plus ownership checks reject bad ones): `usdSchema` (integer USD), `paginationQuerySchema` (`cursor?`, `limit` default 25, max 100), `pageSchema(item)` → `{ items, nextCursor }`, `errorResponseSchema` → `{ error, code, details? }`, with barrel index.ts
- [ ] T018 [P] Write the state machine tests in packages/contracts/src/listing-package/status.test.ts, packages/contracts/src/offer/status.test.ts, packages/contracts/src/deal/status.test.ts, packages/contracts/src/ops/status.test.ts: every allowed transition in the data-model tables passes; every other pair fails; CLOSED and WITHDRAWN are final; `allowedNext()` returns the listed next states
- [ ] T019 [P] Implement the status machines as `as const` arrays and transition maps with `canTransition(from, to)` and `allowedNext(from)`: `PACKAGE_STATUSES` (DRAFT, ACCEPTING_OFFERS, NO_OFFERS_RECEIVED, OFFER_ACCEPTED, UNDER_CONTRACT, INSPECTION, CLOSING, CLOSED, FELL_THROUGH, WITHDRAWN) in packages/contracts/src/listing-package/status.ts; `OFFER_STATUSES` (ACTIVE, COUNTERED, WITHDRAWN, EXPIRED, ACCEPTED, BACKUP, DECLINED_TO_RECONFIRM, FELL_THROUGH, DECLINED), plus BACKUP → WITHDRAWN (spec FR-054) in packages/contracts/src/offer/status.ts; `DEAL_STATUSES` (OFFER_ACCEPTED, UNDER_CONTRACT, INSPECTION, CLOSING, CLOSED, FELL_THROUGH, PENDING_RECONFIRMATION, RECONFIRM_DECLINED) in packages/contracts/src/deal/status.ts; `JOB_STATUSES`, `JOB_TYPES` (MATCH_PACKAGE, MATCH_BUY_BOX, SEND_MATCH_DIGESTS, IMPORT_INVESTORS, CLOSE_OFFER_ROUND, EXPIRE_OFFER, EXPIRE_RECONFIRMATION), `DELIVERY_STATUSES` (PENDING, SENDING, SENT, RETRYING, NEEDS_ATTENTION), and `DELIVERY_TARGETS` (CRM, EMAIL, SMS, IN_APP) in packages/contracts/src/ops/status.ts (depends on T018)
- [ ] T021 [P] Create the property and listing enums in packages/contracts/src/listing-package/enums.ts: `PROPERTY_TYPES` (SINGLE_FAMILY, CONDO, TOWNHOME, MULTI_FAMILY, MANUFACTURED, LAND), `CONDITIONS` (EXCELLENT, GOOD, FAIR, POOR, DISTRESSED), and `OFFER_PROGRAMS` (CASH_OFFER, CASH_WITH_UPSIDE, SEVEN_DAY_SOLD); and in packages/contracts/src/buy-box/enums.ts: `BUY_BOX_STATUSES` (ACTIVE, PAUSED), `BUY_BOX_STRATEGIES` (FIX_FLIP, BUY_HOLD, WHOLESALE, NOVATION, SELLER_FINANCE), `GEOGRAPHY_MODES` (NATIONWIDE, STATES, ZIPS), with derived types
- [ ] T224 [P] Write the registry definition tests in packages/contracts/src/buy-box/criteria.test.ts: every key in `CRITERION_KEYS` has a definition; every `listingFields` entry names a real listing fact; `MATERIAL_FIELDS` equals the union of all `listingFields`; the buy box schema accepts null for every criterion ("any"), rejects every empty array, rejects each inverted min/max pair with the field named, and rejects a geography mode that disagrees with its entries (STATES with a ZIP, ZIPS with none, NATIONWIDE with any)
- [ ] T022 [P] Create the Criterion Registry definitions in packages/contracts/src/buy-box/criteria.ts (XIX.3): `CRITERION_KEYS` (as const: `geography`, `propertyType`, `price`, `yearBuilt`, `beds`, `baths`, `sqft`, `units`, `condition`, `repair`, `closingSpeed`, `listedStatus`, `programs`) and `CRITERIA` typed `satisfies Record<CriterionKey, CriterionDefinition>`, each entry holding `label`, the Zod field schema, form metadata (group, input kind), and `listingFields`; `MATERIAL_FIELDS` derived from the union of `listingFields`; the buy box schemas built from the entries (`createBuyBoxInputSchema`, `updateBuyBoxInputSchema` with `version`): `name` 1–60, `status`, `strategy?`, `geographyMode` with `states[]` or `zips[]`, every criterion nullable (null = any), no empty arrays, every min ≤ max, `closeWithinDays` 7–120, each failure naming its field (FR-060, FR-025); and `clauseResultSchema` (`{ key, label, passed, expected, actual }`) (depends on T224)
- [ ] T023 [P] Create the config key schemas in packages/contracts/src/config/: `CONFIG_KEYS` and a schema for each — `netProceeds` (`closingCostPct` 0–0.2, `flatFees` integer ≥ 0), `offerWindowHours` (default 72), `reconfirmHours` (default 48), `deliveryRetry` (`baseMs` 2000, `factor` 2, `capMs` 60000, `jitter` 0.2, `attempts` 10: about 5 minutes of automatic retries), `packageFormSteps` (an ordered list of steps, each with field keys and a required flag), `matchDigest` (`hourUtc` 0–23, default 14), `nearMiss` (`windowDays` default 30, `minCount` ≥ 5, default 5)
- [ ] T024 [P] Write the PII contract test in packages/contracts/src/events/events.pii.test.ts: walk every event payload schema and fail if any key is `fullName`, `sellerName`, `email`, `phone`, `streetLine`, or `sellerContact` (FR-032, SC-006)
- [ ] T025 [P] Create the outbox event contracts in packages/contracts/src/events/: the envelope (`id`, `type`, `aggregateType`, `aggregateId`, `occurredAt`, `version: 1`, `payload`); a discriminated union on `type` for every event in [contracts/events.md](./contracts/events.md) with its listed payload; and `EVENT_TARGETS` (as const: event type → targets and recipient rule) (depends on T024)
- [ ] T026 [P] Create job payload schemas per `JOB_TYPES` in packages/contracts/src/ops/jobs.ts (e.g., MATCH_PACKAGE `{ packageId, round, listingVersion }`; MATCH_BUY_BOX `{ buyBoxId, buyBoxVersion }`; SEND_MATCH_DIGESTS `{ digestDate }`; EXPIRE_OFFER `{ offerId, revision }`; EXPIRE_RECONFIRMATION `{ dealId }`; CLOSE_OFFER_ROUND `{ packageId, round, deadline }`; IMPORT_INVESTORS `{ batchId, storageKey }`) and the job status view `{ status, progress, error? }`
- [ ] T027 [P] Create the brand contracts in packages/contracts/src/brand/: `REQUIRED_SEMANTIC_TOKENS` (as const; every token in the [design-tokens.md](./contracts/design-tokens.md) table, including the five status tones `neutral`, `info`, `success`, `warning`, and `danger`, each with an indicator, a `-text`, and a `-surface` token, plus `color.brand.accent`), `brandTokenSetSchema` (`#RRGGBB` hex; every semantic value references an existing primitive; no raw values in `semantic`; `content.displayName` required), `brandThemeViewSchema` (`{ brandId, tokenVersion, cssVariables, content }`), and `toCssVariables(tokenSet)` (dots become dashes: `color.action.primary` → `--color-action-primary`)
- [ ] T028 [P] Write the contrast checker tests in packages/contracts/src/brand/contrast.test.ts: `#000000` on `#FFFFFF` is 21:1; `#767676` on `#FFFFFF` passes 4.5:1; `#777777` on `#FFFFFF` fails; white on `#0D9488` is 3.74 (fails as button text); `#0284C7` on `#FFFFFF` is 4.10 (fails as text, passes as a 3:1 indicator); `validateBrandTokenSet` names every missing token and every failing pair with its ratio
- [ ] T029 Implement `contrastRatio(hexA, hexB)` (WCAG 2.1 relative luminance) and `validateBrandTokenSet(tokenSet)` in packages/contracts/src/brand/contrast.ts, checking the [design-tokens.md](./contracts/design-tokens.md) rules: 4.5:1 for `text.default`, `text.muted`, and `text.link` on `surface.page` and `surface.card`, `action.on-primary` on `action.primary` and `action.primary-hover`, `action.on-secondary` on `action.secondary`, and each `status.<tone>-text` on `status.<tone>-surface` and on `surface.card`; 3:1 for `focus.ring` on `surface.page` and `surface.card`, `border.strong` on `surface.card`, and each `status.<tone>` indicator on `surface.card`. It lives in contracts (not packages/ui) so the api and the seed can enforce FR-095 server-side, and packages/ui re-exports it (depends on T027, T028)
- [ ] T030 Create the typed REST client base in packages/contracts/src/client/http.ts: `createApiClient({ baseUrl, getToken?, fetch })`, JSON handling, an `idempotencyKey` option sent as `Idempotency-Key`, and an automatically generated key (`crypto.randomUUID()`) on every POST, PUT, and PATCH that does not pass one (XX.2: the api rejects mutations without a key), and a typed `ApiError` parsed from `errorResponseSchema` that exposes `details.fields` (Sprint 1 part split out as T264)

### Database (packages/core/prisma)

- [ ] T031 Write packages/core/prisma/schema.prisma for every other entity in [data-model.md](./data-model.md) (User and Agent are T236, Seller is T238, and the draft parts of Property, ListingPackage, and Photo are T240; this task adds the rest of their fields): Brand, ListingVersion, Investor, BuyBox, BuyBoxGeography, BuyBoxVersion, Match, MatchEvaluation, Offer, OfferRevision, Decision, Deal, Job, OutboxEvent, Delivery, Notification, AuditLog, ImportBatch, ImportRowResult, ConfigEntry. Include CUID ids, `createdAt` / `updatedAt` (append-only tables have `createdAt` only), `version Int` on ListingPackage, BuyBox, Offer, and Deal, `listingVersion Int` on ListingPackage, every buy box criterion as its own typed nullable column (enum arrays for `propertyTypes`, `conditionsAccepted`, `programsAccepted`; no criteria or clauses JSON), the nullable type-dependent Property fields (`beds`, `baths`, `sqft`, `yearBuilt`, `condition`, plus `lotSqft`, `units`, `lat`, `lng`), `ListingPackage.currentlyListed`, `eligiblePrograms`, and `addressHash` (a copy of the Property's), `Investor.proofOfFundsExpiresAt`, `onDelete: Cascade` on parent-child relations (never on AuditLog or history), the unique constraints (User.email, User.agentId, and User.investorId; Agent.email; ListingPackage.propertyId and ListingPackage.sellerId; Investor.externalRef and email; BuyBox `(investorId, name)`; BuyBoxGeography `(buyBoxId, kind, value)`; BuyBoxVersion `(buyBoxId, version)`; ListingVersion `(packageId, listingVersion)`; Match `(packageId, investorId, round)`; MatchEvaluation `(packageId, listingVersion, buyBoxId, buyBoxVersion)`; Photo `(packageId, position)`; OfferRevision `(offerId, revision)`; Deal.offerId; Delivery `(outboxEventId, target, recipientRef)`; ConfigEntry `(key, brandId)`), and the indexes (Property `(zip)` and `(addressHash)`; ListingPackage `(agentId, status)` and `(status, offerDeadline)`; BuyBox `(investorId)` and `(status)`; BuyBoxGeography `(kind, value)`; Match `(investorId)`; Job `(status, runAt)`; Delivery `(status)`; AuditLog `(entityType, entityId, occurredAt)`). BuyBox.investorId is **not** unique (1:N). Use the driver-adapters preview feature if the pinned Prisma version needs it
- [ ] T032 Generate the migration for the T031 tables (User, Agent, Seller, and the Sprint 1 draft tables already have theirs: T236, T238, T240), then append the SQL Prisma cannot express:
  - the partial unique indexes: ListingPackage `(addressHash)` WHERE status NOT IN (`CLOSED`, `WITHDRAWN`) (FR-013), replacing the plain unique from T240 once packages can close; Offer `(packageId, investorId, round)` WHERE status IN (`ACTIVE`, `COUNTERED`, `BACKUP`, `ACCEPTED`); Deal `(packageId)` WHERE status NOT IN (`FELL_THROUGH`, `CLOSED`, `RECONFIRM_DECLINED`); Job `(type, dedupeKey)` WHERE status IN (`QUEUED`, `PROCESSING`); OutboxEvent `(relayedAt)` WHERE relayedAt IS NULL;
  - the User CHECK extended for INVESTOR ⇒ investorId (AGENT and OPS are in T236);
  - BuyBox: a partial unique `(investorId)` WHERE `isDefault`; CHECKs for every min ≤ max pair (price, year built, beds, baths, sqft, units), `cardinality(...) > 0` on each non-null enum array, `closeWithinDays` 7–120, and `repairMax` ≥ 0 (XIX.2);
  - a deferred constraint trigger on BuyBox and BuyBoxGeography that rejects a geography mode that disagrees with its rows (NATIONWIDE with any row; STATES without a STATE row or with a ZIP row; ZIPS without a ZIP row or with a STATE row);
  - a trigger that raises on UPDATE or DELETE of AuditLog, and the same for BuyBoxVersion, MatchEvaluation, and ListingVersion (ListingVersion allows only the one-time set of `matchedCount` and `topExclusionReasons`);
  - `CREATE SCHEMA IF NOT EXISTS sandbox` (the sandbox also creates it on boot)
  (depends on T031)
- [ ] T033 Create `createPrismaClient(databaseUrl)` (driver adapter `PrismaPg`, the URL from validated env only) in packages/core/src/infra/prisma-client.ts and `createRedisClient(redisUrl)` (ioredis, `maxRetriesPerRequest: null` for BullMQ) in packages/core/src/infra/redis-client.ts; export both from packages/core/src/adapters.ts (Sprint 1 part split out as T244)
- [ ] T034 Write the database constraint integration test in packages/core/test/integration/schema.int.test.ts (Testcontainers PostgreSQL 17, `prisma migrate deploy`): each partial unique index rejects a second active row and allows one after the first becomes inactive; AuditLog UPDATE and DELETE raise, and so do BuyBoxVersion, MatchEvaluation, and ListingVersion updates (except the one-time match summary); the User CHECK holds, and a second User with the same `agentId` or `investorId` is rejected; a second Agent with the same email is rejected; a Seller with neither email nor phone is rejected; a Property with `units` set on a non-MULTI_FAMILY type is rejected; a second ListingPackage pointing at the same Property is rejected; a second ListingPackage pointing at the same Seller is rejected; a second ListingPackage with the same `addressHash` is rejected while the first is not CLOSED or WITHDRAWN (including FELL_THROUGH) and allowed once it is; BuyBox rejects an inverted price range (the case Clever's own form lets through), an empty property-type array, and a second default box per investor; the geography trigger rejects each inconsistent mode at commit; an investor can hold two buy boxes; deleting a ListingPackage cascades Photos and Matches

### Core infrastructure (packages/core)

- [ ] T035 [P] Create the `IClock` port and `SystemClockImpl` in packages/core/src/providers/clock/, and `FakeClock` (settable `now`, `advance(ms)`) in packages/core/test/doubles/FakeClock.ts
- [ ] T042 Implement `translateError(err, { reporter, logger })` → `{ status, body }` in packages/core/src/errors/http-error-translator.ts, and `translateWorkerError(err, context)` (always logs plus reports with `job_id` / `delivery_id`, redacted) in packages/core/src/errors/worker-error-translator.ts (depends on T041) (Sprint 1 part split out as T245)

### Shared repository slices (packages/core/src/repositories)

- [ ] T044 [P] Create the audit slice in packages/core/src/repositories/audit/: `append({ actorType, actorId, action, entityType, entityId, outcome, details })` (details passed through `redactPii`), `listByEntity(entityType, entityId)`; `AUDIT_ACTIONS` as const in packages/contracts/src/ops/audit.ts (PACKAGE_PUBLISHED, MATCH_EVALUATED, OFFER_SUBMITTED, OFFER_REVISED, DECISION_RECORDED, DEAL_MILESTONE, DEAL_FELL_THROUGH, BACKUP_PROMOTED, PII_ACCESSED, CONFIG_CHANGED, IMPORT_COMPLETED, plus PACKAGE_STATUS_CHANGED and DELIVERY_RETRIED)
- [ ] T045 [P] Create the outbox slice in packages/core/src/repositories/outbox/ (`insert`, `claimUnrelayed(limit)` using `FOR UPDATE SKIP LOCKED`, `markRelayed(id)`) and `OutboxWriter.write(repos, event)` in packages/core/src/outbox/outbox-writer.ts, which validates the event against the contracts union before inserting
- [ ] T046 [P] Create the delivery slice in packages/core/src/repositories/delivery/: `createMany` (skips duplicates on the unique key), `findById`, `markSending`, `markSent`, `markRetrying(error, nextAttemptAt)`, `markNeedsAttention(error)`, `resetForRetry(id)` (PENDING, attempts 0), `listByStatus`, `listByPackage`; `lastError` passed through `redactPii`
- [ ] T047 [P] Create the notification slice in packages/core/src/repositories/notification/: `create`, `listForUser(userId)`, `markRead(id, userId)`
- [ ] T048 [P] Create the config slice in packages/core/src/repositories/config/ and `ConfigService` in packages/core/src/services/config/: `get(key, brandId?)` (brand-scoped value, else the global value, parsed with the per-key schema), `list()`, `set(actor, key, value)` (OPS only; validated; writes a CONFIG_CHANGED audit entry)
- [ ] T050 [P] Create the brand slice in packages/core/src/repositories/brand/: `findById`, `list`, `updateTheme(brandId, tokens)` (increments `tokenVersion`)
- [ ] T051 [P] Create the investor slice in packages/core/src/repositories/investor/: `findById`, `findByExternalRef`, `findByEmail`, `upsert(investor)` (including `proofOfFundsExpiresAt`), and `getContact(investorId)` (used only by the email/SMS delivery handlers). Candidate selection for matching lives in the buy-box slice (T052), not here
- [ ] T052 [P] Create the buy-box slice in packages/core/src/repositories/buy-box/: `findByInvestorId` (returns an array, default box first), `findById`, `findDefaultForInvestor`, `create(box)` and `update(id, version, box)` (each replaces the BuyBoxGeography rows, increments `version`, and appends a BuyBoxVersion snapshot in the same transaction; a stale `version` → ConflictError), `findVersionAt(buyBoxId, at)`, `listActiveForMatching(now)` (all ACTIVE boxes of ACTIVE investors with unexpired proof of funds), and `findCandidates(listingFacts, now)`, the stage 1 pre-filter: one SQL query with the hard cuts (investor ACTIVE, `proofOfFundsExpiresAt > now`, box ACTIVE) plus every fragment from packages/core/src/repositories/buy-box/prefilter-fragments.ts, a `Record<CriterionKey, (facts) => Prisma.Sql>` typed with `satisfies` (NATIONWIDE skips the geography fragment; every fragment lets a null criterion pass). Fragments live in the adapter because they contain SQL (IV)
- [ ] T053 [P] Create InMemory doubles for T044–T052 in packages/core/test/doubles/ (InMemoryAuditRepository.ts, InMemoryOutboxRepository.ts, InMemoryDeliveryRepository.ts, InMemoryNotificationRepository.ts, InMemoryConfigRepository.ts, InMemoryUserRepository.ts, InMemoryBrandRepository.ts, InMemoryInvestorRepository.ts, InMemoryBuyBoxRepository.ts). `InMemoryBuyBoxRepository.findCandidates` applies only the hard cuts and returns every remaining box, which is a valid superset under the XIX.4 invariant

### Criterion Registry and two-stage matching (Principle XIX)

- [ ] T054 Write the evaluator tests in packages/core/src/registry/evaluators.test.ts: for each criterion key, one passing and one failing listing; a null criterion passes; a null listing value that a non-null criterion needs fails with `actual: null` (fail closed, FR-025); `price` passes only when `priceMin ≤ priceExpectationMax ≤ priceMax`; `closingSpeed` passes only if `closeWithinDays` covers the seller's closing window; `listedStatus` fails only for a listed home when `acceptsListed` is false; `programs` needs one shared program; NATIONWIDE passes any ZIP; `evaluateBuyBox` returns `[{ key, label, passed, expected, actual }]` for every key and matches only if all pass; add a fast-check property (unit tier) that a box with every criterion null matches any complete listing
- [ ] T055 Implement the evaluator layer in packages/core/src/registry/: `evaluators.ts` (`EVALUATORS` typed `satisfies Record<CriterionKey, CriterionEvaluator>`, each `evaluate(box, facts)` → `{ passed, expected, actual }`, pure; `EVALUATOR_VERSION = 1`, raised whenever any predicate changes), `evaluate-buy-box.ts` (`evaluateBuyBox(box, facts)` running every key in `CRITERION_KEYS` order), and `listing-facts.ts` (`toListingFacts(listingPackage, property, today)`, the flat no-PII fact object that also becomes the ListingVersion snapshot); export from the core barrel (depends on T022, T054)
- [ ] T217 Write the pre-filter safety property test in packages/core/test/integration/prefilter-safety.int.test.ts (Testcontainers PostgreSQL 17, fast-check default 100 runs): generate random investors (some inactive, some with expired proof of funds), buy boxes (nulls, ranges, every geography mode, paused boxes), and complete or partly null listings; insert them, then assert that every box `evaluateBuyBox` matches (among ACTIVE boxes of ACTIVE investors with unexpired proof of funds) is returned by `findCandidates` (XIX.4). Lower `numRuns` only if CI time requires, never below 50 (depends on T052, T055)

### Durable jobs (Principle VIII)

- [ ] T056 Write the job integration test in packages/core/test/integration/jobs.int.test.ts: enqueuing with the same `(type, dedupeKey)` while QUEUED returns the existing job; two concurrent `claimNext` calls never claim the same job (SKIP LOCKED); a job with a future `runAt` is not claimed until FakeClock passes it; a PROCESSING job with `lockedAt` older than 60 s is reclaimed; a failure re-queues while `retryCount < maxRetries`, then sets FAILED with a redacted error
- [ ] T057 Create the job slice in packages/core/src/repositories/job/: `enqueue({ type, dedupeKey, payload, runAt?, maxRetries? })` (insert `ON CONFLICT DO NOTHING`, returns the existing job), `claimNext(workerId, now)` (`FOR UPDATE SKIP LOCKED WHERE status = 'QUEUED' AND runAt <= now`), `reclaimStale(now)`, `complete(id, result)`, `fail(id, error)`, `updateProgress(id, pct)`, `findById` (depends on T056)
- [ ] T058 Create `JobHandlerRegistry` (generic: `register(type, payloadSchema, handler)`, where each handler module supplies its own payload schema from T026; the registry validates the payload with that schema before calling the handler (VI) and imports no feature types itself (VIII); the worker container does the registering) and `JobService.getStatus(actor, jobId)` (owner or OPS) in packages/core/src/jobs/registry.ts and packages/core/src/services/job/JobService.ts

### Outbox relay and delivery (Principle XVIII)

- [ ] T059 [P] Create the outbound provider ports with Zod response schemas: `ICrmProvider` (`upsertListingStatus(record, idempotencyKey)` → `{ result: "APPLIED" | "STALE" }`) in packages/core/src/providers/crm/; `IMessagingProvider` (`sendEmail`, `sendSms`, both keyed) in packages/core/src/providers/messaging/; `IStorageProvider` (`createUpload(key, contentType, maxBytes)` → the vendor-neutral `UploadInstruction` `{ url, method, headers, expiresAt }`, `getReadUrl(key)`, `exists(key)`, `read(key)` (the CSV import), and `put(key, body, contentType)` (server-side write, used only by the seed; user uploads always use `createUpload`)) in packages/core/src/providers/storage/, with `uploadInstructionSchema` in packages/contracts/src/common/upload.ts; `IGeoProvider` (`isValidZip`, `lookup`) in packages/core/src/providers/geo/; `ISimulationControlProvider` (`get`, `set`) in packages/core/src/providers/simulation/; `ICrmMirrorReader` (`listListings()`, read-only, for the ops CRM comparison, so the api never holds the CRM write provider) in packages/core/src/providers/crm/; `ISellerContactReader` (`getForPackage(packageId)`) in packages/core/src/providers/seller-contact/ (Sprint 1 part split out as T250)
- [X] T060 Update [contracts/providers.md](./contracts/providers.md) with `IStorageProvider.createUpload` → `UploadInstruction`, `read(key)` with sandbox `GET /internal/storage/objects/:key`, `ICrmMirrorReader`, and `ISellerContactReader` (done during planning, 2026-10-30)
- [ ] T061 Write the outbox integration test in packages/core/test/integration/outbox.int.test.ts: a `uow.run` that throws after writing a state change and an outbox event commits neither; the relay creates exactly one Delivery per target and recipient per `EVENT_TARGETS`; running the relay twice creates no duplicates; the event is marked relayed; each delivery is enqueued once in BullMQ (`jobId = delivery.id`)
- [ ] T062 Implement `OutboxRelay.tick()` in packages/core/src/outbox/outbox-relay.ts: claim unrelayed events, resolve recipients from `EVENT_TARGETS` (matched investors → investorId; package agent → userId; CRM → none), insert deliveries, enqueue on the `deliveries` BullMQ queue with `jobId = delivery.id`, then mark relayed (depends on T061)
- [ ] T063 Write the dispatcher unit tests in packages/core/src/outbox/delivery-dispatcher.test.ts (mock providers, FakeClock): 2xx → SENT; 5xx, timeout, or malformed → RETRYING with `nextAttemptAt` = min(base 2 s × 2^attempt, 60 s) ± 20%, so the 10 default attempts span about 5 minutes; CRM `STALE` → SENT (superseded); any other 4xx except 408/429 → NEEDS_ATTENTION immediately; the last attempt → NEEDS_ATTENTION and the error is reported; IN_APP writes a Notification; EMAIL and SMS resolve the investor's contact at send time and never read it from the payload
- [ ] T064 Implement `DeliveryDispatcher.dispatch(deliveryId)` in packages/core/src/outbox/delivery-dispatcher.ts with target handlers in packages/core/src/outbox/targets/{crm,email,sms,in-app}.ts. The CRM handler loads seller contact through `ISellerContactReader` and writes a `PII_ACCESSED` audit entry with actor SYSTEM. Messages are rendered from packages/core/src/outbox/message-templates.ts using the brand's `content.displayName` (no hard-coded brand names, XVI). The retry policy comes from `ConfigEntry["deliveryRetry"]` (depends on T063)

### Provider implementations (sandbox and static)

- [ ] T065 Write the provider tests in packages/core/src/providers/sandbox-http.test.ts (mocked fetch): a call over 5 s → InfrastructureError; a malformed body → InfrastructureError; a 503 → InfrastructureError with retryable=true; CRM 409 `{ code: "STALE" }` → `{ result: "STALE" }`; every request sends `Idempotency-Key` (Sprint 1 part split out as T251)
- [ ] T066 Implement the shared `sandboxRequest()` helper (5 s AbortSignal timeout, Zod-validated response, InfrastructureError mapping) in packages/core/src/providers/sandbox-http.ts, then `SandboxCrmProviderImpl`, `SandboxCrmMirrorReaderImpl`, `SandboxMessagingProviderImpl`, `SandboxStorageProviderImpl` (`createUpload` returns `{ url: PUBLIC_SANDBOX_URL/storage/objects/:key?sig=&exp=, method: "PUT", headers: { "Content-Type" }, expiresAt }`, signed with HMAC-SHA256; `exists`, `read`, and `put` use `SANDBOX_INTERNAL_TOKEN`), and `SandboxSimulationProviderImpl` in their port folders under packages/core/src/providers/ (depends on T065) (Sprint 1 part split out as T251)
- [ ] T068 Fill the barrels: packages/core/src/index.ts (ports, services, workflows, domain types, errors, `redactPii`, translators — no `*Impl`) and packages/core/src/adapters.ts (every `*Impl`, `createPrismaClient`, `createRedisClient`, `createLogger`)

### Sandbox app (apps/sandbox, port 4100)

- [ ] T069 Write the sandbox route tests (supertest, in-memory store) in apps/sandbox/src/routes/crm.test.ts, messages.test.ts, storage.test.ts, simulation.test.ts: CRM upsert deduplicates by `Idempotency-Key`; an older `occurredAt` → 409 `{ code: "STALE" }`; messages are captured once per key; (storage is tested in T252: signature, expiry, content type, size, internal token); an `OPTIONS` preflight from `WEB_ORIGIN` gets the CORS headers and one from any other origin does not; each mode `down` (503), `slow` (10 s, fake timers), and `garbage` (200 with malformed JSON) applies only to its own service
- [ ] T070 Create apps/sandbox/src/env.ts (Zod; fail fast), apps/sandbox/src/container.ts (pg pool on the `sandbox` schema, store), apps/sandbox/src/store.ts (on boot runs `CREATE SCHEMA IF NOT EXISTS sandbox`, so the sandbox can start before `migrate`; tables created if missing: `crm_listings`, `messages`, `idempotency_keys`, `simulation_modes`; storage objects are files on the `SANDBOX_STORAGE_DIR` volume, with no table, since T252), and apps/sandbox/src/server.ts (listen 0.0.0.0:4100) (Sprint 1 part split out as T252: env.ts and the file-based storage)
- [ ] T071 Implement the per-service simulation middleware in apps/sandbox/src/middleware/simulation.ts and the routes in apps/sandbox/src/routes/: crm.ts (`PUT /crm/listings/:packageId`, `GET /crm/listings`), messages.ts (`POST /messages/email`, `POST /messages/sms`, `GET /messages`), storage.ts (from T252, extended here with `GET` / `PUT /internal/storage/objects/:key` for the CSV import and the photo seed), simulation.ts (`GET /simulation`, `PUT /simulation/:service`), per [contracts/providers.md](./contracts/providers.md) (depends on T069, T070) (Sprint 1 part split out as T252)
- [ ] T072 Implement the HTML inspection page `GET /` (CRM records, captured messages newest first, current modes; server-rendered, escaped) in apps/sandbox/src/inspect-page.ts

### API skeleton (apps/api, port 4000)

- [ ] T074 Write the app tests in apps/api/src/app.test.ts (supertest, mock services): the middleware order is helmet → pino-http → json → authenticate → idempotency → routers → notFound → errorTranslator; an unknown route → 404 `{ error }`; a thrown `BusinessRuleError` → 409 body shape; an unexpected error → 500 generic body with no stack; protected routes without a bearer → 401
- [ ] T075 Implement the `authenticate` middleware (jose HS256 verify; sets `res.locals.actor`; public allowlist: `POST /api/v1/sessions`, `GET /api/v1/health`, `GET /api/v1/brands`, and `GET /api/v1/brands/:brandId/theme`) in apps/api/src/middleware/authenticate.ts, plus `notFound` and `errorTranslator` (4-argument; calls `translateError`) in apps/api/src/middleware/ (Sprint 1 part split out as T253)
- [ ] T076 Write the idempotency integration test in apps/api/test/integration/idempotency.int.test.ts (Testcontainers Redis 7): POST without a key → 400; replay with the same key and body → the stored response plus `Idempotent-Replay: true`; a concurrent duplicate → 409 with `Retry-After: 1`; the same key with a different body → 422; a 5xx response is not stored; Redis stopped → 503 with `Retry-After: 5`
- [ ] T077 Implement the `idempotency(redis)` middleware for POST, PUT, and PATCH in apps/api/src/middleware/idempotency.ts: key `idem:{method}:{path}:{key}` plus the SHA-256 body hash; `SET NX` 60 s in-progress marker; wrap `res.json` / `res.send` and store status and body for 24 h on `finish` (skip 5xx); fail closed on Redis errors (depends on T076)
- [ ] T080 Create the routers: `createHealthRouter` (`GET /health` → `{ status, db, redis }` via `SELECT 1` and `PING`) in apps/api/src/routes/health.router.ts; `createSessionsRouter` (`POST /sessions` → 201, `GET /me`) in apps/api/src/routes/sessions.router.ts; `createJobsRouter` (`GET /jobs/:jobId`) in apps/api/src/routes/jobs.router.ts. With the sessions route, add a step to scripts/submission/rehearse.sh that signs in with every demo account in README.md and fails if any cannot (Sprint 1 part split out as T254)
- [ ] T081 Create `createContainer(env)` in apps/api/src/container.ts (Prisma, Redis, cipher, clock, uow, geo, storage, simulation, CRM mirror reader, error reporter, services; `Object.freeze`; `dispose()`), `createApp(container)` in apps/api/src/app.ts (fixed middleware order; routers mounted at `/api/v1`), and apps/api/src/server.ts (parse env → container → app → listen `0.0.0.0:4000`; dispose on SIGTERM and SIGINT) (Sprint 1 part split out as T255)

### Worker skeleton (apps/worker)

- [ ] T082 Create apps/worker/src/env.ts (Zod; fail fast) and apps/worker/src/container.ts: Prisma, Redis, cipher, clock, uow, the job registry, `OutboxRelay`, `DeliveryDispatcher`, `ICrmProvider` and `IMessagingProvider` chosen by `CRM_PROVIDER` and `MESSAGING_PROVIDER` (only `sandbox` implemented; any other value fails startup with a clear message), `ISellerContactReader`, and the error reporter; add the `redis` service back to compose.yaml (redis:7-alpine, `--maxmemory 64mb --maxmemory-policy noeviction --save ""`, healthcheck `redis-cli ping`) and make api and worker depend on it being healthy; and add Redis 7 back to the integration tier (packages/config/vitest/integration.js) and CI's image pull, for the Redis-backed tests (T077 idempotency, the outbox consumers)
- [ ] T083 Implement the loops in apps/worker/src/loops/: job-poller.ts (every 1 s: `reclaimStale`, then claim and run handlers; failures go through `translateWorkerError`), outbox-relay.ts (every 1 s `OutboxRelay.tick()`), delivery-consumers.ts (BullMQ Worker on `deliveries` with a custom backoff from `deliveryRetry`; on final failure, move to the `deliveries-dlq` queue and mark NEEDS_ATTENTION). Add apps/worker/src/error-translator.ts and apps/worker/src/main.ts (graceful shutdown: stop polling, let in-flight jobs finish, close BullMQ, dispose)

### Design system foundation (packages/ui)

- [ ] T084 Create the semantic token names (`SEMANTIC_TOKENS` as const, re-exporting `REQUIRED_SEMANTIC_TOKENS` and the contrast checker from `@clever/contracts/brand`) in packages/ui/src/tokens/semantic.ts, the domain status → tone map from [design-tokens.md](./contracts/design-tokens.md) in packages/ui/src/tokens/status-tones.ts (StatusPill takes a domain status, never a color), and the Tailwind 4 bridge in packages/ui/src/styles/theme.css (`@theme` maps every semantic token to its CSS variable, so utilities such as `bg-action-primary`, `text-muted`, `p-inset-md`, `rounded-control`, and `shadow-card` exist; the default palette is disabled) (Sprint 1 part split out as T267)
- [ ] T085 Create seed/brands/clever.json from the owner-supplied values: every supplied color as a primitive, plus the semantic mapping and the derived text shades exactly as listed under "Seeded brand values" (`clever`) in [design-tokens.md](./contracts/design-tokens.md); default type, space, radius, and shadow scales; `content` (display name, logo path `/brands/clever/logo.svg`, legal footer). It must pass `validateBrandTokenSet`
- [ ] T086 [P] Build the React Aria primitives (`ref` as a prop, semantic utilities only, visible focus ring `ring-focus`) in packages/ui/src/primitives/: Button, TextField, NumberField, Select, ComboBox, DatePicker, Checkbox, CheckboxGroup, RadioGroup, Dialog, Table, Tabs, Badge, StatusPill, Toast, Card, Skeleton (Sprint 1 part split out as T268)
- [ ] T087 [P] Build the patterns in packages/ui/src/patterns/: FormSection, MoneyField (USD integer), StatusTimeline, ComparisonTable, EmptyState, LoadingState, ErrorState (each with an accessible name and `role="status"` or `role="alert"` as fitting)
- [ ] T088 Write the hook test in packages/ui/src/hooks/useWizard.test.ts (`renderHook`): next and back move between steps; `next` is blocked while a step has errors; the announcement text changes on each step change; focus moves to the step heading
- [ ] T089 Implement `useWizard` in packages/ui/src/hooks/useWizard.ts, then the templates in packages/ui/src/templates/: AppShell (role navigation, logo, and footer from props; skip link), ListPageTemplate, DetailPageTemplate, WizardTemplate (`aria-live="polite"` step announcements; keyboard only), ComparisonTemplate, TimelineTemplate; export everything from packages/ui/src/index.ts (depends on T086–T088)

### Web skeleton (apps/web, port 3000)

- [ ] T090 Create apps/web/src/env.ts (Zod: `API_URL`, `COOKIE_SECURE`, `DEFAULT_BRAND_ID`) and apps/web/src/container.ts (server-side `createApiClient` with `API_URL`) (Sprint 1 part split out as T261)
- [ ] T091 Write the BFF tests in apps/web/src/app/bff/bff.test.ts: a POST, PUT, PATCH, or DELETE whose `Origin` does not match the host → 403; a GET without Origin passes; the cookie token is forwarded as `Authorization: Bearer`; `Idempotency-Key` is passed through; the session route's login POST to the api carries an `Idempotency-Key`; the api's status and body are returned unchanged (Sprint 1 part split out as T262)
- [ ] T092 Implement the BFF in apps/web/src/app/bff/[...path]/route.ts (`await params`; cookie → bearer; Origin check on state-changing methods; forwards to `API_URL/api/v1/...`) and apps/web/src/app/bff/session/route.ts (POST: login through the api with the contracts client, which attaches the `Idempotency-Key`; set the `session` cookie HTTP-only, Secure (per `COOKIE_SECURE`), SameSite=Lax, 8 h; DELETE: clear it) (depends on T091) (Sprint 1 part split out as T263)
- [ ] T093 Create apps/web/src/providers.tsx (QueryClientProvider plus coordination contexts composed once), apps/web/src/lib/query-keys.ts (`["entity", id]` factories), and apps/web/src/lib/bff-client.ts (browser `createApiClient` pointed at `/bff`)
- [ ] T094 Implement brand resolution once per request in apps/web/src/brand/resolve-brand.ts (demo `brand` cookie, else host mapping, else `DEFAULT_BRAND_ID`; fetch `GET /brands/:brandId/theme`), render the CSS variables in a `<style>` on `<html data-brand>` in apps/web/src/app/layout.tsx (import `@clever/ui/styles/theme.css`), and expose `BrandContentContext` through `useBrandContent()` in apps/web/src/brand/BrandContent.tsx
- [ ] T095 Implement the brands API: `BrandService` (`list`, `getTheme(brandId)` → `toCssVariables` plus content) in packages/core/src/services/brand/, and `createBrandsRouter` (`GET /brands`, `GET /brands/:brandId/theme` with `ETag` = tokenVersion) in apps/api/src/routes/brands.router.ts

**Checkpoint**: `pnpm test` passes offline. `pnpm test:integration` passes. api, worker, sandbox,
and web start locally against Docker PostgreSQL and Redis; `/api/v1/health` reports `ok`.

---

## Phase 3: User Story 1 - Reviewer starts and explores the prototype (Priority: P1) 🎯 MVP

**Goal**: One `docker compose up --build` on a fresh 2 GB x86_64 machine builds in ≤ 20 min,
serves a home page within 5 min, seeds demo data once, and lets every demo account log in to
its role workspace.

**Independent Test**: Quickstart V1: clean build and start, timed; open
http://localhost:3000; log in as each demo account; `docker compose restart` and confirm seed
counts are unchanged.

### Tests for User Story 1 (write first, must fail) ⚠️

- [ ] T096 [P] [US1] Write the seed idempotency integration test in packages/core/test/integration/seed.int.test.ts: run the baseline seed twice and assert identical row counts for User, Agent, Investor, BuyBox, BuyBoxGeography, BuyBoxVersion, Brand, and ConfigEntry; every seeded brand passes `validateBrandTokenSet`; every demo user can log in with `demo1234` (Sprint 1 part split out as T260)

### Implementation for User Story 1

- [ ] T098 [P] [US1] Create the seed fixtures in seed/fixtures/: agents.json (`avery@example.com`, `blake@example.com`, plus one more; brokerage; brand `clever`), investors.json (about 50 investors with varied buy boxes across the T067 markets, each with a `proofOfFundsExpiresAt`; `summit@example.com` with two boxes, "Austin flips" and "Austin rentals", that both fit the V2 sample address; `harbor@example.com` with one broad box; `ridge@example.com` with a deliberately narrow one; at least one NATIONWIDE box, one STATES box, and one PAUSED box; and one investor whose proof of funds has expired, to show the stage 1 cut), users.json (the six demo accounts from [quickstart.md](./quickstart.md) plus users for the remaining investors), config.json (the T023 keys with defaults) (Sprint 1 part split out as T260)
- [ ] T099 [US1] Implement the modular seed: packages/core/prisma/seed/index.ts (runs every registered seed module in order inside a single advisory lock), packages/core/prisma/seed/baseline.ts (upserts by natural key: every file in seed/brands/ after `validateBrandTokenSet` (a failure stops the seed with the failing pairs named), config entries, agents, investors and buy boxes (each box validated with the T022 schema and written through the buy-box slice, so it gets its geography rows and a version 1 snapshot; boxes upsert by `(investorId, name)`, and an unchanged box is skipped so restarts add no versions), and users with bcrypt hashes of `demo1234`), and the `prisma.seed` entry in packages/core/package.json (depends on T096, T098); the seed must run in the `migrate` image as plain JavaScript (no tsx there), through the seed command in prisma.config.ts (Sprint 1 part split out as T260)
- [ ] T100 [US1] Write the multi-stage Dockerfile at the repo root: `deps` (pnpm fetch with a cache mount), `build` (`pnpm install --offline`, `prisma generate`, `NODE_OPTIONS=--max-old-space-size=1280 turbo run build --concurrency=1`), `prune` (`pnpm deploy --prod` per app or a pruned node_modules), and `runtime` (`node:24-bookworm-slim`, non-root user, Next.js standalone output copied, one image for all services) (extends the Dockerfile started in T232); follow-up: `prisma` is a production dependency of @clever/core, so the api and worker images (about 840 MB) carry the Prisma CLI that only `migrate` needs; moving it to a dev dependency and installing it in the `migrate` image alone would shrink them
- [ ] T101 [US1] Write compose.yaml: `postgres` (postgres:17-alpine, `shared_buffers=64MB`, healthcheck `pg_isready`, named volume), `redis` (redis:7-alpine, `--maxmemory 64mb --save ""`, healthcheck), `sandbox` (same image, `pull_policy: never`, `env_file: .env`; starts once postgres is healthy; healthcheck `node -e "fetch('http://localhost:4100/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"`, because the slim image has no curl), `migrate` (the only service with `build:`; `image: investor-platform:local`; `env_file: .env`; command `prisma migrate deploy && prisma db seed`; depends on healthy postgres and healthy sandbox, because the seed writes photos through `IStorageProvider.put`), and `api`, `worker`, `web` (same image, `pull_policy: never`, `env_file: .env`, start after `migrate` completes successfully; the api healthcheck is the same `node -e fetch(...)` pattern against `http://localhost:4000/api/v1/health`; web waits for it; ports 3000, 4000, 4100; sandbox storage volume; every server listens on 0.0.0.0) (extends the compose.yaml started in T232, adding `migrate` and the seed)
- [ ] T103 [US1] Build the home page in apps/web/src/app/page.tsx: what the prototype demonstrates (the publish → match → offer → compare → accept → close loop, the outage demo, the white-label switch), the demo accounts table (from apps/web/src/content/demo-accounts.ts), links to sign in, the sandbox (`PUBLIC_SANDBOX_URL`), and the design-system page; brand name and footer come from `useBrandContent()`
- [ ] T105 [US1] Extend the route protection in apps/web/src/proxy.ts (T266; Next.js 16 replaces middleware.ts) with the role-mismatch redirect (a signed-in user on another role's pages → their role's home) and the role layouts using AppShell with role navigation in apps/web/src/app/(agent)/agent/layout.tsx, apps/web/src/app/(investor)/investor/layout.tsx, apps/web/src/app/(ops)/ops/layout.tsx (sign out via `DELETE /bff/session`) (Sprint 1 part split out as T266)
- [ ] T106 [US1] Build the role home pages (welcome, the user's display name from `GET /me`, and links to the areas added by later stories, with EmptyState where a list is not built yet) in apps/web/src/app/(agent)/agent/page.tsx, apps/web/src/app/(investor)/investor/page.tsx, apps/web/src/app/(ops)/ops/page.tsx
- [ ] T107 [US1] Write README.md: one-command start, ports, demo accounts table, tour by role, the Prototype Shortcuts table from [plan.md](./plan.md), test commands, a note that the app must be opened at `http://localhost` (use an SSH tunnel such as `ssh -L 3000:localhost:3000 -L 4100:localhost:4100 <vm>` for a remote VM), because the Secure session cookie is dropped over plain HTTP on any other host, with `COOKIE_SECURE=false` in `.env` as the fallback, and a placeholder section for the curl recipes (filled in T211)

**Checkpoint**: Quickstart V1 passes. Every demo account logs in to its role shell. The role
lists fill in as US2–US6 land.

---

## Phase 4: User Story 2 - Agent builds and publishes a listing package (Priority: P1)

**Goal**: An agent creates a package (seller, property, expectations, photos, deadline),
publishing is blocked with every failing field named, and publishing matches it against every
active buy box. Matched investors get a privacy-safe view and one notification.

**Independent Test**: Quickstart V2: as `avery@example.com`, create and publish the sample package;
the match count equals `seed/expected-matches.json`; the sandbox shows one email per matched
investor within 1 minute; `ridge@example.com` gets 404; `summit@example.com` sees no seller PII in
the page or the BFF JSON.

### Tests for User Story 2 (write first, must fail) ⚠️

- [ ] T108 [P] [US2] Write the PII contract test in packages/contracts/src/listing-package/views.pii.test.ts: `InvestorPackageView` and `InvestorPackageSummary` have no `fullName`, `email`, `phone`, `streetLine`, or `sellerContact` key (SC-006); `AgentPackageView` does have them
- [ ] T109 [P] [US2] Write the ListingPackageService tests in packages/core/src/services/listing-package/ListingPackageService.test.ts (InMemory doubles, FakeClock): each property rule rejects with its field named (`beds` 0–20; `baths` 0–20 in 0.5 steps; `sqft` 100–20,000 (0 rejected); `lotSqft` > 0 on any type; `units` 2–500 and only for MULTI_FAMILY; `yearBuilt` 1800 to the current year; `zip` 5 digits and known to `IGeoProvider`; `city`, `state`, and the default `neighborhood` come from `IGeoProvider.lookup(zip)` and any typed city or state is ignored; each package gets its own Property row and its own Seller row; `repairEstimate` ≥ 0); a DRAFT may leave type-dependent fields empty; `lat` / `lng` are set from `IGeoProvider.lookup(zip)`, never from input; seller `fullName` required, `email` valid if present, `phone` E.164 if present, email or phone required; `priceExpectationMin` ≤ `priceExpectationMax`, both > 0; `specialCircumstances` ≤ 2,000 chars; a package for an `addressHash` that has an active package (not CLOSED or WITHDRAWN) → `BusinessRuleError` code `DUPLICATE_ACTIVE_LISTING`, with `details.existingPackageId` when the caller owns the existing package and no package ID or agent name when another agent does; an edit that changes the address runs the same check and updates `ListingPackage.addressHash` in the same uow; a repository unique violation on that index (simultaneous creates) is translated to the same error; an agent can't read or edit another agent's package (404); an OPS read of `AgentPackageView` writes a `PII_ACCESSED` audit entry and the owning agent's read does not (XX.1); an update with a stale `version` → ConflictError; `undefined` fields in an update stay unchanged (Sprint 1 part split out as T258)
- [ ] T110 [P] [US2] Write the PublicationWorkflow tests in packages/core/src/workflows/publication/PublicationWorkflow.test.ts: publish with missing or invalid fields → ValidationError listing every failing field (including "at least 1 photo", `offerDeadline` > now and ≤ now + 30 days, `closingWindowStart` ≥ today and ≤ `closingWindowEnd`, `currentlyListed` set, at least one `eligiblePrograms` entry); the required fields depend on `propertyType` (FR-012): a LAND package publishes without beds, baths, sqft, year built, or condition but needs `lotSqft`, a MULTI_FAMILY package needs `units`, and any other type needs beds, baths, sqft, year built, and condition; the default deadline is now + `offerWindowHours`; a valid publish runs in one uow and sets ACCEPTING_OFFERS, `publishedAt`, and `listingVersion` 1, appends the ListingVersion snapshot (with `evaluatorVersion`), enqueues MATCH_PACKAGE (dedupe `MATCH_PACKAGE:{id}:{round}:{listingVersion}`) and CLOSE_OFFER_ROUND (`runAt` = deadline; dedupe `CLOSE_OFFER_ROUND:{id}:{round}:{deadline}`), writes `package.published` and `package.status_changed`, and audits PACKAGE_PUBLISHED; withdraw from DRAFT, ACCEPTING_OFFERS, or NO_OFFERS_RECEIVED → WITHDRAWN plus `package.withdrawn`; reopen → round + 1, `listingVersion` + 1 with a new snapshot, and a new MATCH_PACKAGE; extend deadline reschedules CLOSE_OFFER_ROUND; an illegal transition → ConflictError with `allowedNext`
- [ ] T111 [P] [US2] Write the MatchingWorkflow tests for `evaluatePackage` in packages/core/src/workflows/matching/MatchingWorkflow.test.ts: stage 1 candidates come from `findCandidates` and stage 2 runs `evaluateBuyBox` on each; inactive investors, expired proof of funds, and PAUSED boxes never match (FR-024); one MatchEvaluation per matching box (with `buyBoxVersion`, `listingVersion`, `evaluatorVersion`, `clauseResults`) and none for non-matches; one Match row per investor per round, with `matchedBuyBoxIds` listing every matching box; exactly one `package.matched` per investor per round with `buyBoxNames[]` naming both of `summit@example.com`'s boxes (FR-022); re-running the job inserts and sends nothing new; a material edit creates a new `listingVersion`, re-evaluates, notifies newly matched investors, and sends `package.changed` only to already-notified investors whose matched boxes check a changed field; an investor whose box stops matching keeps their Match row and access; zero matches → every active box is evaluated in memory and `ListingVersion.topExclusionReasons` lists the most common failing criterion labels; `matchedCount` is stored; each run is audited as MATCH_EVALUATED
- [ ] T112 [P] [US2] Write the CLOSE_OFFER_ROUND handler test in packages/core/src/jobs/handlers/close-offer-round.handler.test.ts: at the deadline with 0 active offers → NO_OFFERS_RECEIVED plus `package.status_changed`; with ≥ 1 offer the status stays ACCEPTING_OFFERS; a stale job (deadline changed or round advanced) does nothing; running twice is safe
- [ ] T114 [P] [US2] Write the publish-and-match integration test in packages/core/test/integration/publish-match.int.test.ts: seed the baseline, publish the V2 sample package through the workflows, run the MATCH_PACKAGE handler, and assert matched investor IDs equal `seed/expected-matches.json`, Delivery rows exist for EMAIL and IN_APP per matched investor (exactly one EMAIL for `summit@example.com`, whose two boxes both match), none exist for unmatched investors, and no outbox payload contains the seller's name or street line
- [ ] T115 [P] [US2] Write the wizard hook tests in apps/web/src/features/listing-package/usePackageWizard.test.tsx and the upload hook tests in apps/web/src/features/listing-package/usePhotoUpload.test.tsx: a 400 `details.fields` maps each error to its step and field; a type or size error is shown before upload; the hook uploads with `fetch(upload.url, { method: upload.method, headers: upload.headers, body: file })` straight to storage (never through `/bff`); an expired instruction is requested again; a successful upload calls attach once (Sprint 1 part split out as T271)

### Implementation for User Story 2

- [ ] T116 [P] [US2] Create the listing-package contracts in packages/contracts/src/listing-package/: `createPackageInputSchema` (seller, property, and expectations with the T109 rules), `updatePackageInputSchema` (separate; every field optional, `undefined` means unchanged; requires `version`), `publishInputSchema` (`{ offerDeadline?, version }`), `withdrawInputSchema`, `reopenInputSchema`, `extendDeadlineInputSchema`, the publish schema with type-dependent required fields (FR-012) built from the T022 registry so the wizard, the service, and matching agree, re-exporting `MATERIAL_FIELDS` from the registry (no hand-written list), `AgentPackageView`, `AgentPackageSummary`, `InvestorPackageView` (no PII fields: city, ZIP, neighborhood, property facts including `lotSqft` and `units`, the seller's expected price range, `currentlyListed`, `eligiblePrograms`, photos, timeline, deadline), and `InvestorPackageSummary` (Sprint 1 part split out as T243 and T257)
- [ ] T117 [P] [US2] Create the photo and match contracts: `photoUploadRequestSchema` (`contentType` enum, `sizeBytes` ≤ 10,485,760), `attachPhotoSchema` (`storageKey`, `position` 0–19), `photoUploadResponseSchema` (`{ storageKey, upload: UploadInstruction }`), and `PhotoView` in packages/contracts/src/listing-package/photo.ts; `MatchView` (`investorId`, `round`, `trigger`, `matchedBuyBoxes: [{ buyBoxId, name, buyBoxVersion, clauseResults[] }]`), `AgentMatchSummary` (`matchedCount`, `topExclusionReasons[]`), and `MatchExplanationView` (`matched`, `listingVersion`, `buyBoxes: [{ buyBoxId, name, buyBoxVersion, matched, clauseResults[], source: STORED | REPLAYED }]`, `replayedWithNewerRules`) in packages/contracts/src/match/
- [ ] T118 [P] [US2] Create the seller slice in packages/core/src/repositories/seller/ (the mapper encrypts and decrypts `fullName`, `email`, and `phone` with `IPiiCipher`) and `PrismaSellerContactReaderImpl` (`ISellerContactReader`) in packages/core/src/providers/seller-contact/ (Sprint 1 part split out as T246)
- [ ] T120 [P] [US2] Create the listing-package slice in packages/core/src/repositories/listing-package/: `create`, `findById`, `findForAgent(agentId, id)`, `listByAgent(agentId, status?)`, `listAll(status?)`, `update(id, version, patch)` (`WHERE id AND version`; 0 rows → ConflictError), `countActiveOffers(packageId, round)` (Sprint 1 part split out as T247)
- [ ] T121 [P] [US2] Create the photo slice in packages/core/src/repositories/photo/ and the match slice in packages/core/src/repositories/match/ (Match: `upsert` on `(packageId, investorId, round)` that adds to `matchedBuyBoxIds` and returns whether the row is new, `markNotified(listingVersion)`, `markDigested`, `listUndigested(investorId)`, `listByPackage`, `listMatchedForInvestor(investorId)`, `findOne(packageId, investorId, round)`; MatchEvaluation: `appendMany` (skips duplicates on the unique key), `findFor(packageId, listingVersion, buyBoxId, buyBoxVersion)`), and the listing-version slice in packages/core/src/repositories/listing-version/ (`append`, `findLatest(packageId, round)`, `setMatchSummary(id, matchedCount, topExclusionReasons)`, `listPublishedSince(date)` for the near-miss summary) (Sprint 1 part split out as T248)
- [ ] T122 [US2] Add the seller, property, listing-package, listing-version, photo, and match repositories to `UnitOfWorkRepositories` and `PrismaUnitOfWorkImpl`, add their InMemory doubles in packages/core/test/doubles/, and export them from the barrels (depends on T118–T121) (Sprint 1 part split out as T249)
- [ ] T123 [US2] Implement `IListingPackageService` and `ListingPackageService` (create (DRAFT, with duplicate warning), get (an OPS read audits `PII_ACCESSED`), list, update; a material update after publish, meaning a change to any field in `MATERIAL_FIELDS`, increments `listingVersion`, appends a ListingVersion snapshot, enqueues MATCH_PACKAGE, and returns a job handle) in packages/core/src/services/listing-package/ (depends on T109, T122) (Sprint 1 part split out as T259)
- [ ] T125 [US2] Implement `PublicationWorkflow` (publish, withdraw, reopen, extendDeadline) in packages/core/src/workflows/publication/PublicationWorkflow.ts, reading publish requirements from `ConfigEntry["packageFormSteps"]` (depends on T110, T122)
- [ ] T126 [US2] Implement `MatchingWorkflow.evaluatePackage(packageId, round, listingVersion)` (stage 1 `findCandidates`, stage 2 `evaluateBuyBox`, MatchEvaluation and Match writes plus `package.matched` / `package.changed` events in one uow; the zero-match exclusion summary) in packages/core/src/workflows/matching/MatchingWorkflow.ts and the job handlers packages/core/src/jobs/handlers/match-package.handler.ts and packages/core/src/jobs/handlers/close-offer-round.handler.ts (depends on T111, T112, T122)
- [ ] T127 [US2] Implement `InvestorPackageQueryService` (`listMatched(actor)` newest first with `offerDeadline`; `getForInvestor(actor, id)` → 404 unless a Match row exists for this investor, package, and current round; returns `InvestorPackageView` built field by field, never by spreading the entity) in packages/core/src/services/investor-package/ (depends on T108, T122)
- [ ] T128 [US2] Implement `NotificationService` (`listMine`, `markRead`) in packages/core/src/services/notification/
- [ ] T129 [US2] Create the api routers: `createListingPackagesRouter` (GET list, POST, GET `:id`, PATCH `:id`, POST `:id/publication`, `:id/withdrawal`, `:id/reopening`, PATCH `:id/offer-deadline`, GET `:id/matches`) in apps/api/src/routes/listing-packages.router.ts; `createPhotosRouter` (POST `:id/photo-uploads`, POST `:id/photos`, DELETE `:id/photos/:photoId`) in apps/api/src/routes/photos.router.ts; `createInvestorPackagesRouter` (GET `/investor/packages`, GET `/investor/packages/:id`) in apps/api/src/routes/investor-packages.router.ts; `createNotificationsRouter` in apps/api/src/routes/notifications.router.ts. Wire them in apps/api/src/container.ts and app.ts (Sprint 1 part split out as T256)
- [ ] T130 [US2] Implement `GET /package-form` (AGENT) → the `packageFormSteps` config (already in [contracts/api.md](./contracts/api.md)) in apps/api/src/routes/listing-packages.router.ts via `ConfigService` (IX: the wizard steps come from config)
- [ ] T131 [US2] Register the MATCH_PACKAGE and CLOSE_OFFER_ROUND handlers and `PrismaSellerContactReaderImpl` in apps/worker/src/container.ts (US5 adds MATCH_BUY_BOX and SEND_MATCH_DIGESTS in T219 and T221)
- [ ] T132 [P] [US2] Add the typed client modules in packages/contracts/src/client/listing-packages.ts, photos.ts, investor-packages.ts, and notifications.ts (Sprint 1 part split out as T265)
- [ ] T133 [US2] Build the agent package list (ListPageTemplate; status filter; StatusPill) in apps/web/src/app/(agent)/agent/packages/page.tsx with `usePackages` in apps/web/src/features/listing-package/usePackages.ts (Sprint 1 part split out as T269)
- [ ] T134 [US2] Build the new-package wizard (WizardTemplate driven by `GET /package-form`; steps seller, property, expectations, photos, review; a `DUPLICATE_ACTIVE_LISTING` error shown as an accessible error notice on the property step, linking to the existing package only when `details.existingPackageId` is present, otherwise telling the agent to contact operations) in apps/web/src/app/(agent)/agent/packages/new/page.tsx, with `usePackageWizard` and `usePhotoUpload` in apps/web/src/features/listing-package/ (depends on T115) (Sprint 1 part split out as T270)
- [ ] T135 [US2] Build the agent package detail page (DetailPageTemplate: status; edit; publish with field errors; matched count; the "no matches" notice with `topExclusionReasons`; withdraw, reopen, and extend-deadline dialogs) in apps/web/src/app/(agent)/agent/packages/[id]/page.tsx
- [ ] T136 [US2] Build the investor package list and the read-only privacy-safe detail page (city, ZIP, neighborhood, facts, photos via read URLs, timeline, deadline) in apps/web/src/app/(investor)/investor/packages/page.tsx and apps/web/src/app/(investor)/investor/packages/[id]/page.tsx; a 404 shows "not found"
- [ ] T137 [US2] Add the notification inbox (badge count plus panel; `useNotifications` with polling) to the AppShell slot in apps/web/src/features/notifications/NotificationInbox.tsx
- [ ] T138 [US2] Create seed/photos/ (small sample JPEGs, under 5 MB total) and the package seed module packages/core/prisma/seed/packages.ts (upserts by fixed keys: a DRAFT package, ACCEPTING_OFFERS packages for `avery@example.com` and `blake@example.com`, and a "no matches" package; photos are seeded directly through `IStorageProvider.put()` from seed/photos/*.jpg under fixed keys (`seed/<package>/<n>.jpg`; overwriting is idempotent), bypassing the browser upload contract, and matching Photo rows are upserted; compose starts the sandbox before `migrate` (T101); matches are computed with the same stage 1 `findCandidates` and stage 2 `evaluateBuyBox` functions as live matching, writing ListingVersion, Match, and MatchEvaluation rows directly with `notifiedAt` set and no outbox events, so seeding sends no messages), then register it in packages/core/prisma/seed/index.ts
- [ ] T139 [US2] Generate seed/expected-matches.json (investor IDs per seeded package and for the V2 sample address) with a script in packages/core/prisma/seed/expected-matches.ts, and add the V2 sample address (Austin 78704, single-family, Fair condition) as the hint in the wizard config

**Checkpoint**: Quickstart V2 passes. US1 still passes.

---

## Phase 5: User Story 3 - Investor reviews matched packages and submits an offer (Priority: P1)

**Goal**: Matched investors see their packages with time left, submit one offer per package,
and can revise or withdraw it before the deadline. Duplicates are impossible.

**Independent Test**: Quickstart V3: as `summit@example.com`, submit and revise an offer; the agent
sees one offer at the latest revision with history; the same `Idempotency-Key` twice returns
`Idempotent-Replay: true` with one offer; the "Deadline passed" package refuses submission.

### Tests for User Story 3 (write first, must fail) ⚠️

- [ ] T140 [P] [US3] Write the OfferService tests in packages/core/src/services/offer/OfferService.test.ts (FakeClock): `price` > 0; `paymentType` CASH or FINANCED; `closingDate` ≥ today; `earnestMoney` ≥ 0; `contingencies` subset of INSPECTION, FINANCING, APPRAISAL, TITLE, SALE_OF_HOME, and FINANCING is required if `paymentType = FINANCED`; `feesAndConcessions` ≥ 0; `expiresAt` > now; an investor without a Match row for the package and round → NotFoundError; after `offerDeadline` → BusinessRuleError "The offer deadline passed on …"; a second create while one is active → BusinessRuleError pointing to revise; revise writes OfferRevision n+1 (author INVESTOR) and requires `version`; withdraw works from ACTIVE or COUNTERED only; each write emits `offer.submitted` or `offer.revised`, audits OFFER_SUBMITTED or OFFER_REVISED, and schedules EXPIRE_OFFER at `expiresAt` (dedupe `EXPIRE_OFFER:{offerId}:{revision}`); another investor's offer → NotFoundError; an OPS or AGENT actor creating or revising an offer → ForbiddenError (FR-080)
- [ ] T141 [P] [US3] Write the EXPIRE_OFFER handler test in packages/core/src/jobs/handlers/expire-offer.handler.test.ts: an ACTIVE or COUNTERED offer past `expiresAt` → EXPIRED; a job for an older revision does nothing; an accepted offer is untouched
- [ ] T142 [P] [US3] Write the duplicate-offer integration test in packages/core/test/integration/duplicate-offer.int.test.ts: two concurrent creates for the same investor, package, and round → exactly one row; the loser gets BusinessRuleError (partial unique index); a withdrawn offer allows a new one
- [ ] T143 [P] [US3] Write the offer form hook test in apps/web/src/features/offers/useOfferForm.test.tsx: one `Idempotency-Key` is created when the form opens and reused on double submit and retry; a new key is created after success; field errors map from `details.fields`

### Implementation for User Story 3

- [ ] T144 [P] [US3] Create the offer contracts in packages/contracts/src/offer/: `CONTINGENCIES` and `PAYMENT_TYPES` (as const), `createOfferInputSchema` (the T140 rules), `reviseOfferInputSchema` (separate; requires `version`), `OfferView` (includes `investorActive` for the deactivated-investor flag), `OfferRevisionView`, and `myOfferStatus` on `InvestorPackageSummary`
- [ ] T145 [US3] Create the offer slice in packages/core/src/repositories/offer/ (offers plus revisions: `create` with revision 1, `revise(id, version, terms, author)`, `updateStatus(id, version, status)`, `findById`, `findActiveForInvestor(packageId, investorId, round)`, `listActiveByPackage(packageId, round)`, `listRevisions(offerId)`); add it to the unit of work, the InMemory doubles, and the barrels
- [ ] T146 [US3] Implement `IOfferService` and `OfferService` (create, revise, withdraw, getRevisions, listForPackage (agent owner or OPS)) in packages/core/src/services/offer/ (depends on T140, T145)
- [ ] T147 [US3] Implement the EXPIRE_OFFER handler in packages/core/src/jobs/handlers/expire-offer.handler.ts and register it in apps/worker/src/container.ts (depends on T141)
- [ ] T148 [US3] Extend `PublicationWorkflow.withdraw` to set every open offer (ACTIVE, COUNTERED, BACKUP) to DECLINED with notifications, and make the CLOSE_OFFER_ROUND handler use `countActiveOffers` from the offer slice, in packages/core/src/workflows/publication/PublicationWorkflow.ts and its test
- [ ] T149 [US3] Add `myOfferStatus` to `InvestorPackageQueryService.listMatched` in packages/core/src/services/investor-package/
- [ ] T150 [US3] Create `createOffersRouter` (POST `/listing-packages/:id/offers`, PATCH `/offers/:offerId`, POST `/offers/:offerId/withdrawal`, GET `/offers/:offerId/revisions`, GET `/listing-packages/:id/offers` for the agent) in apps/api/src/routes/offers.router.ts, wired in container.ts and app.ts (the agent list route is already in [contracts/api.md](./contracts/api.md))
- [ ] T151 [P] [US3] Add the typed client module packages/contracts/src/client/offers.ts
- [ ] T152 [US3] Build the investor dashboard (matched packages newest first; a time-left countdown via `useCountdown` with an injectable clock; `myOfferStatus` badge) in apps/web/src/app/(investor)/investor/page.tsx and apps/web/src/features/offers/useCountdown.ts
- [ ] T153 [US3] Add the offer panel to the investor package page: the offer form (MoneyField, DatePicker, CheckboxGroup for contingencies, RadioGroup for payment type), revise, a withdraw confirmation Dialog, revision history, and the deadline-passed notice, in apps/web/src/features/offers/OfferPanel.tsx and `useOfferForm` in apps/web/src/features/offers/useOfferForm.ts (depends on T143)
- [ ] T154 [US3] Add the offers section to the agent package detail page (latest revision per investor, a revision history drawer, and an "investor deactivated" flag) in apps/web/src/features/offers/AgentOfferList.tsx
- [ ] T155 [US3] Create the offer seed module packages/core/prisma/seed/offers.ts (offers on the seeded ACCEPTING_OFFERS packages; a "Deadline passed" package with a past deadline and one offer) and register it in the seed index

**Checkpoint**: Quickstart V3 passes. US1 and US2 still pass.

---

## Phase 6: User Story 4 - Agent compares offers, the seller chooses, and the deal is tracked to close (Priority: P2)

**Goal**: The agent compares offers by net proceeds and records accept, counter, or decline
all; exactly one acceptance can win; the deal moves through milestones in order; a
fallen-through deal can promote a backup that must reconfirm within 48 hours.

**Independent Test**: Quickstart V4: as `blake@example.com`, open the 6-offer package, sort by net
proceeds, and accept the top offer; the winner sees seller details and the others see "Backup
offer"; out-of-order milestones are refused; fall through, promote a backup, reconfirm as that
investor; `pnpm test:integration -- accept-race` passes.

### Tests for User Story 4 (write first, must fail) ⚠️

- [ ] T156 [P] [US4] Write the net proceeds tests in packages/core/src/services/offer-comparison/net-proceeds.test.ts: `estimatedNetProceeds = price − feesAndConcessions − round(price × closingCostPct) − flatFees`, using `ConfigEntry["netProceeds"]`; the breakdown lists each subtracted item; `certaintyRank` = number of contingencies, with cash ahead of financed on ties
- [ ] T157 [P] [US4] Write the OfferComparisonService tests in packages/core/src/services/offer-comparison/OfferComparisonService.test.ts: sorts by `netProceeds` (desc), `closingDate` (asc), and `certainty` (asc); includes ACTIVE, COUNTERED, and BACKUP offers; marks expired offers as not acceptable; returns the `assumptions` used; only the package's agent or OPS may call it
- [ ] T158 [P] [US4] Write the DecisionWorkflow tests in packages/core/src/workflows/decision/DecisionWorkflow.test.ts: ACCEPT runs in one uow and sets the package and a new Deal to OFFER_ACCEPTED, the offer to ACCEPTED, and every other ACTIVE or COUNTERED offer to BACKUP; it emits `decision.accepted` with `backupOfferIds`, plus `package.closed_to_offers` for matched investors with no offer, and audits DECISION_RECORDED; ACCEPT of an expired offer → BusinessRuleError; ACCEPT when a deal is active → BusinessRuleError "This package already has an accepted offer"; COUNTER writes an AGENT revision, sets COUNTERED, and emits `offer.countered` for that investor only; DECLINE_ALL sets every open offer to DECLINED and emits `decision.declined_all`; an OPS actor recording any decision → ForbiddenError (FR-080: ops can see everything but cannot make seller decisions); a stale `version` → ConflictError
- [ ] T159 [P] [US4] Write the counter-response tests in packages/core/src/services/offer/OfferService.counter.test.ts: ACCEPT adopts the counter terms as a new INVESTOR revision and sets ACTIVE; DECLINE sets ACTIVE again at the investor's last own revision and notifies the agent; a revision replaces the counter; only the offer's investor may respond
- [ ] T160 [P] [US4] Write the DealLifecycleWorkflow tests in packages/core/src/workflows/deal-lifecycle/DealLifecycleWorkflow.test.ts (FakeClock):
  - milestones only in order OFFER_ACCEPTED → UNDER_CONTRACT → INSPECTION → CLOSING → CLOSED; out of order → ConflictError with `allowedNext`; the package status mirrors the deal; each step emits `deal.milestone` and `package.status_changed` and audits DEAL_MILESTONE with the actor; CLOSED refuses every change;
  - fall-through needs a reason, sets the deal and the winning offer to FELL_THROUGH, emits `deal.fell_through`, audits DEAL_FELL_THROUGH, and returns unexpired backups ranked by net proceeds;
  - promote creates a Deal in PENDING_RECONFIRMATION with `reconfirmBy` = now + `reconfirmHours`, enqueues EXPIRE_RECONFIRMATION (dedupe `EXPIRE_RECONFIRMATION:{dealId}`), emits `deal.backup_promoted`, and audits BACKUP_PROMOTED; an expired backup can't be promoted;
  - reconfirm CONFIRM → the deal and package go to OFFER_ACCEPTED and the offer to ACCEPTED; DECLINE or the timeout → RECONFIRM_DECLINED, the offer goes to DECLINED_TO_RECONFIRM, and the agent is notified;
  - with no usable backups, reopen (round + 1, new MATCH_PACKAGE) or withdraw
- [ ] T161 [P] [US4] Write the seller-reveal tests in packages/core/src/services/investor-package/InvestorPackageQueryService.reveal.test.ts: only the investor whose offer is ACCEPTED on the active deal gets `sellerContact` and `streetLine`; each reveal writes a PII_ACCESSED audit entry; after fall-through the same investor gets the PII-free view again; backup investors never get PII
- [ ] T162 [P] [US4] Write the acceptance race integration test in packages/core/test/integration/accept-race.int.test.ts: two concurrent ACCEPT decisions for different offers on one package → exactly one succeeds and the other gets BusinessRuleError; one Deal row exists
- [ ] T163 [P] [US4] Write the deal timer integration test in packages/core/test/integration/deal-lifecycle.int.test.ts: promote a backup, stop and recreate the job poller (a simulated restart), advance FakeClock 48 h, and assert EXPIRE_RECONFIRMATION runs once and the deal is RECONFIRM_DECLINED (FR-059)

### Implementation for User Story 4

- [ ] T164 [P] [US4] Create the comparison, decision, and deal contracts: `OfferComparisonRow` (with `breakdown`), `comparisonQuerySchema` (`sort`: `netProceeds` | `closingDate` | `certainty`) in packages/contracts/src/offer/comparison.ts; `DECISION_TYPES`, `createDecisionSchema` (`offerId` required for ACCEPT and COUNTER, `counterTerms` required for COUNTER, `version`) in packages/contracts/src/deal/decision.ts; `DealView` (`allowedNextMilestones[]`, `backups[]` for agent and OPS only), `milestoneInputSchema`, `fallThroughInputSchema` (`reason` 1–500 chars required), `promoteBackupSchema`, `counterResponseSchema`, `reconfirmationSchema`, and the investor `sellerContact` extension of `InvestorPackageView` in packages/contracts/src/deal/
- [ ] T165 [P] [US4] Create the decision slice in packages/core/src/repositories/decision/ (append-only) and the deal slice in packages/core/src/repositories/deal/ (`create`, `findActiveByPackage`, `findById`, `update(id, version, patch)`, `listByPackage`); add both to the unit of work, the InMemory doubles, and the barrels
- [ ] T166 [US4] Implement `computeNetProceeds(offer, assumptions)` and `certaintyRank(offer)` in packages/core/src/services/offer-comparison/net-proceeds.ts and `OfferComparisonService` in packages/core/src/services/offer-comparison/OfferComparisonService.ts (depends on T156, T157)
- [ ] T167 [US4] Implement `DecisionWorkflow` (accept, counter, declineAll) in packages/core/src/workflows/decision/DecisionWorkflow.ts (depends on T158, T165)
- [ ] T168 [US4] Implement `DealLifecycleWorkflow` (recordMilestone, fallThrough, promoteBackup, reconfirm, reopenAfterFallThrough, withdrawAfterFallThrough) in packages/core/src/workflows/deal-lifecycle/DealLifecycleWorkflow.ts, and the EXPIRE_RECONFIRMATION handler in packages/core/src/jobs/handlers/expire-reconfirmation.handler.ts registered in apps/worker/src/container.ts (depends on T160, T165)
- [ ] T169 [US4] Add `respondToCounter`, BACKUP withdrawal, and extending a BACKUP offer's `expiresAt` (allowed after the deadline; no other field may change) to `OfferService` in packages/core/src/services/offer/OfferService.ts (already documented under `PATCH /offers/:offerId` in [contracts/api.md](./contracts/api.md)) (depends on T159)
- [ ] T170 [US4] Implement the seller reveal in `InvestorPackageQueryService.getForInvestor` (via the seller slice; PII_ACCESSED audit) in packages/core/src/services/investor-package/ (depends on T161)
- [ ] T171 [US4] Create the routers: `createComparisonRouter` (GET `/listing-packages/:id/offer-comparison`) in apps/api/src/routes/comparison.router.ts; `createDecisionsRouter` (POST `/listing-packages/:id/decisions`) in apps/api/src/routes/decisions.router.ts; `createDealsRouter` (GET `/listing-packages/:id/deal`, POST `/deals/:dealId/milestones`, POST `/deals/:dealId/fall-through`, POST `/listing-packages/:id/backup-promotions`) in apps/api/src/routes/deals.router.ts; and add POST `/offers/:offerId/counter-response` and `/offers/:offerId/reconfirmation` to apps/api/src/routes/offers.router.ts; wire everything in container.ts and app.ts
- [ ] T172 [P] [US4] Add the typed client modules packages/contracts/src/client/comparison.ts, decisions.ts, and deals.ts
- [ ] T173 [US4] Build the comparison page (ComparisonTemplate plus ComparisonTable for up to 10 offers; sort control; a breakdown popover explaining each subtraction; expired offers marked and not selectable) in apps/web/src/app/(agent)/agent/packages/[id]/compare/page.tsx
- [ ] T174 [US4] Build the decision dialogs (accept with confirmation; counter with an offer-terms form; decline all with a note; a 409 shows "already has an accepted offer") in apps/web/src/features/decisions/DecisionDialogs.tsx; decisions are never optimistic (XIII)
- [ ] T175 [US4] Build the deal tracker page (StatusTimeline; buttons only for `allowedNextMilestones`; a fall-through Dialog with a required reason; ranked backups with promote; reopen or withdraw when no backups remain) in apps/web/src/app/(agent)/agent/packages/[id]/deal/page.tsx
- [ ] T176 [US4] Build the investor deal views: counter response (accept, revise, decline), a backup notice with withdraw and extend-expiry, a reconfirm page with a 48 h countdown, the deal status for the buyer, and a seller contact card for the winner, in apps/web/src/features/deals/ and apps/web/src/app/(investor)/investor/packages/[id]/page.tsx
- [ ] T177 [US4] Create the deal seed module packages/core/prisma/seed/deals.ts (for `blake@example.com`: a package with 6 offers; an accepted package with backups; one at INSPECTION; a FELL_THROUGH package with backups; a CLOSED package) and register it in the seed index

**Checkpoint**: Quickstart V4 passes. US1–US3 still pass.

---

## Phase 7: User Story 5 - Investor manages their buy box (Priority: P2)

**Goal**: Investors create, edit, pause, and resume one or more buy boxes with specific
validation errors. Saving a box matches it against packages still accepting offers, and new
matches reach the dashboard and a daily digest. Operations import the legacy spreadsheet:
valid rows are upserted into one default box per investor, invalid rows are reported per row,
and a re-import never duplicates.

**Independent Test**: Quickstart V5: `harbor@example.com` saving Min Price > Max Price is refused
with the field named; a second harbor box that fits an open package puts it on the dashboard
with no instant email, and the digest lists it; a paused box never matches; importing
seed/legacy-investors.csv gives 26 imported and 4 rejected; a second import gives 0 imported,
26 updated, and 4 rejected, with still one default box per investor.

### Tests for User Story 5 (write first, must fail) ⚠️

- [ ] T178 [P] [US5] Write the BuyBoxService tests in packages/core/src/services/buy-box/BuyBoxService.test.ts: an investor can create a second box; names are unique per investor; each T022 rule rejects with its field named (including an empty array and a geography mode that disagrees with its entries); a save increments `version`, appends a BuyBoxVersion, and enqueues MATCH_BUY_BOX (dedupe `MATCH_BUY_BOX:{buyBoxId}:{version}`) in the same uow when criteria or status change; a stale `version` → ConflictError; pause and resume are status changes; only the investor themselves (or OPS) can read or save their boxes; `list` returns the default box first
- [ ] T218 [P] [US5] Write the MatchingWorkflow tests for `evaluateBuyBox` in packages/core/src/workflows/matching/MatchingWorkflow.buy-box.test.ts: a saved box is evaluated against every package still accepting offers (offer deadline not passed) and no other package; a new match creates a Match row with trigger BUY_BOX_CHANGE and one `package.matched` event whose targets are IN_APP only; an investor already matched to that package gets no second event, and the new box is added to `matchedBuyBoxIds`; a PAUSED box, an inactive investor, or expired proof of funds matches nothing; a box whose edit stops it matching leaves existing Match rows alone (FR-023)
- [ ] T220 [P] [US5] Write the SEND_MATCH_DIGESTS handler test in packages/core/src/jobs/handlers/send-match-digests.handler.test.ts (FakeClock): one `investor.match_digest` event per investor with undigested BUY_BOX_CHANGE matches, listing each package with its matching box names; those matches get `digestedAt`; a second run the same day sends nothing; the handler schedules the next run at the next `matchDigest.hourUtc`; an investor with no undigested matches gets no event
- [ ] T222 [P] [US5] Write the NearMissService tests in packages/core/src/services/buy-box/NearMissService.test.ts (stretch: cut first if time is short): for one box, replays the evaluator against the ListingVersions published in the last `nearMiss.windowDays`; counts packages that failed exactly one criterion, grouped by criterion key; drops any group with fewer than `nearMiss.minCount` (never below 5); the result holds no package IDs, addresses, or prices; only the box's owner (or OPS) can read it (FR-062)
- [ ] T179 [P] [US5] Write the CSV parser tests in packages/core/src/workflows/investor-import/parse-legacy-csv.test.ts: headers match case-insensitively; unknown columns are returned for the summary; `Type` maps `Direct Buyer`, `Wholesaler`, and `iBuyer`; `Property Types` maps `SFR`, `Condo`, `Townhome`, `Multi`, `Manufactured`, and `Land`; `Markets` is `ALL` (NATIONWIDE), or `;`-separated state codes (STATES), or `;`-separated ZIP codes (ZIPS), and a row mixing states and ZIP codes is rejected; `Proof of Funds Expires` parses `YYYY-MM-DD` and blank means not verified; `Phone` normalizes to E.164; the defaults are `Close Within Days` 30, `Active` Y, and blank `Conditions` meaning any (null); range and min ≤ max failures come from the registry schema (T022), not the parser, and are reported with the CSV column name; the reasons read exactly like `row 7: Max Price (-5) must be ≥ 0`, `row 12: ZIP 00000 is not a valid ZIP code`, and `row 19: Email is required`; files over 5 MB or 10,000 rows are rejected
- [ ] T180 [P] [US5] Write the InvestorImportWorkflow tests in packages/core/src/workflows/investor-import/InvestorImportWorkflow.test.ts: upsert by `Investor ID`, else by `Email`; each row creates or updates exactly one default buy box (`isDefault: true`, name "Legacy Import") and never touches the investor's other boxes; a changed or new default box gets a BuyBoxVersion and a MATCH_BUY_BOX job, and an unchanged one gets neither; each row in its own uow (a failing row leaves no partial investor or box); the batch counts are `imported`, `updated`, and `rejected`; `Job.progress` updates; IMPORT_COMPLETED is audited
- [ ] T181 [P] [US5] Write the import integration test in packages/core/test/integration/investor-import.int.test.ts: importing seed/legacy-investors.csv gives 26 IMPORTED and 4 REJECTED with the expected reasons; a second run gives 0 IMPORTED, 26 UPDATED, and 4 REJECTED, and the Investor count, the BuyBox count (one default per imported investor), and the BuyBoxVersion count are unchanged

### Implementation for User Story 5

- [ ] T182 [P] [US5] Create `seed/legacy-investors.csv` per [contracts/investor-import.md](./contracts/investor-import.md): 30 rows; 26 valid; 4 invalid (a negative price, an unknown ZIP code, a missing email, and min price above max); `Markets` within the T067 ZIP list, plus a few rows using state codes and one using `ALL`; `Proof of Funds Expires` filled for most rows and blank for a few; one extra unknown column
- [ ] T183 [P] [US5] Create the buy-box view contracts (`BuyBoxView` with `id`, `name`, `status`, `isDefault`, `strategy`, `geographyMode`, `states[]` or `zips[]`, every criterion, `version`, `updatedAt`; `NearMissSummary` `[{ criterionKey, label, count }]`) in packages/contracts/src/buy-box/view.ts, and the import contracts (`importUploadRequestSchema` (`sizeBytes` ≤ 5 MB) with the response `{ storageKey, upload: UploadInstruction }`, `startImportSchema` (`storageKey`, `fileName`), `ImportBatchView`, `ImportRowResultView`) in packages/contracts/src/investor/import.ts
- [ ] T184 [US5] Create the import slice in packages/core/src/repositories/import/ (ImportBatch plus ImportRowResult: `createBatch`, `addRowResult`, `finalizeCounts`, `findBatchWithRows`); add it to the unit of work, the InMemory doubles, and the barrels
- [ ] T185 [US5] Implement `IBuyBoxService` and `BuyBoxService` (`list`, `get`, `create`, `update` including pause and resume; each save enqueues MATCH_BUY_BOX in the same uow) in packages/core/src/services/buy-box/ (depends on T178)
- [ ] T219 [US5] Implement `MatchingWorkflow.evaluateBuyBox(buyBoxId, buyBoxVersion)` in packages/core/src/workflows/matching/MatchingWorkflow.ts and the MATCH_BUY_BOX handler in packages/core/src/jobs/handlers/match-buy-box.handler.ts, registered in apps/worker/src/container.ts; set `trigger` on `package.matched` and route BUY_BOX_CHANGE to IN_APP only in `EVENT_TARGETS` (depends on T126, T218)
- [ ] T221 [US5] Implement the SEND_MATCH_DIGESTS handler in packages/core/src/jobs/handlers/send-match-digests.handler.ts (registered in apps/worker/src/container.ts; on startup the worker enqueues the next daily run if none is queued, using the dedupe key `SEND_MATCH_DIGESTS:{date}`), the `investor.match_digest` event and its EMAIL template, and `POST /ops/match-digests` (OPS, 202, enqueues a run now) in its own router factory apps/api/src/routes/match-digests.router.ts, wired in container.ts and app.ts, so it does not wait for US6's ops router (depends on T220)
- [ ] T223 [US5] Implement `NearMissService` in packages/core/src/services/buy-box/NearMissService.ts, `GET /investor/buy-boxes/:id/near-misses` in apps/api/src/routes/buy-box.router.ts, and a "Missed by one criterion" panel on the buy box editor that shows only the returned groups (stretch: cut first if time is short) (depends on T222, T187, T188)
- [ ] T186 [US5] Implement `parseLegacyCsv(buffer, geo)` in packages/core/src/workflows/investor-import/parse-legacy-csv.ts (column parsing only: headers, `;` lists, enum names, dates, phone, ZIP lookup; it maps each row to the buy box input and validates that input with `createBuyBoxInputSchema` from T022, translating each failing field path to its CSV column name through a `CRITERION_COLUMNS` map, e.g. `repairMax` → `Max Repairs`; it holds no range or min ≤ max rules of its own, XIX.3) and `InvestorImportWorkflow` (`requestUpload`, `start` → 202 `{ jobId, batchId }` enqueuing IMPORT_INVESTORS with dedupe `IMPORT_INVESTORS:{batchId}`, `run(batchId)` reading the file via `IStorageProvider.read`) in packages/core/src/workflows/investor-import/InvestorImportWorkflow.ts, plus the IMPORT_INVESTORS handler in packages/core/src/jobs/handlers/import-investors.handler.ts registered in apps/worker/src/container.ts (depends on T179, T180, T184)
- [ ] T187 [US5] Create `createBuyBoxRouter` (GET and POST `/investor/buy-boxes`, GET and PUT `/investor/buy-boxes/:id`) in apps/api/src/routes/buy-box.router.ts and `createInvestorImportsRouter` (POST `/ops/investor-imports/uploads`, POST `/ops/investor-imports`, GET `/ops/investor-imports/:batchId`) in apps/api/src/routes/investor-imports.router.ts; wire them in container.ts and app.ts; add typed client modules packages/contracts/src/client/buy-box.ts and investor-imports.ts
- [ ] T188 [US5] Build the investor buy boxes list (name, status, strategy, default badge; add box; pause and resume) in apps/web/src/app/(investor)/investor/buy-boxes/page.tsx and the editor in apps/web/src/app/(investor)/investor/buy-boxes/[id]/page.tsx, with fields generated from the T022 registry form metadata (FormSection groups: where (nationwide, states, or ZIP codes), property types, price, year built, beds and baths, size and units, condition, repairs, closing speed, listed homes, programs; each criterion can be left blank for "any"; field-level errors; a notice that changes apply to new packages and to packages still accepting offers), with `useBuyBoxForm` in apps/web/src/features/buy-box/useBuyBoxForm.ts
- [ ] T189 [US5] Build the ops import page (the browser uploads the CSV with the returned `UploadInstruction` via `fetch`; progress by polling `GET /jobs/:jobId`; a summary of imported, updated, and rejected; a table of row results with reasons; ignored columns listed) in apps/web/src/app/(ops)/ops/imports/page.tsx

**Checkpoint**: Quickstart V5 passes. US1–US4 still pass.

---

## Phase 8: User Story 6 - Operations sees what happened and recovers from failures (Priority: P3)

**Goal**: Operations get a per-package timeline, a "why (not) matched" explanation, the
delivery list with "needs attention" and manual retry, outage switches, and a CRM comparison
that proves the one-way sync converges.

**Independent Test**: Quickstart V6: set CRM `down` and messaging `garbage`, publish and accept
(both succeed), watch deliveries go to Retrying and then Needs attention, switch the services
back up and retry; within 5 minutes the CRM comparison is all in sync with no duplicate
messages; restarting the worker loses nothing.

### Tests for User Story 6 (write first, must fail) ⚠️

- [ ] T190 [P] [US6] Write the status-event coverage test in packages/core/src/workflows/status-events.test.ts: a table-driven check that every PackageStatus and DealStatus transition performed by PublicationWorkflow, DecisionWorkflow, DealLifecycleWorkflow, and the CLOSE_OFFER_ROUND handler writes `package.status_changed` (and `deal.*` where listed) in the same uow (FR-077); extend the same table to every OfferStatus transition (withdraw, expire, backup, declined, declined-to-reconfirm) and assert each transition also writes an `AuditLog` entry with the actor, and that a refused transition writes one with outcome `REJECTED` (XII)
- [ ] T191 [P] [US6] Write the ops service tests in packages/core/src/services/ops/: TimelineService.test.ts (merges audit entries, matches, offers, and delivery attempts for one package in time order; OPS only), MatchExplanationService.test.ts (for an investor with two boxes, each box is reported; a matched box returns its stored MatchEvaluation with `source: STORED`; a non-matched box is replayed with the BuyBoxVersion live at the latest ListingVersion's `createdAt`, not the current box, with `source: REPLAYED`; editing the box after publish does not change the answer; `replayedWithNewerRules` is true only when the current `EVALUATOR_VERSION` differs from the ListingVersion's; OPS only; FR-074), CrmComparisonService.test.ts (in sync when the CRM status equals the platform status; otherwise `pendingDeliveryId` points to the newest unsent CRM delivery), DeliveryOpsService.test.ts (retry only from NEEDS_ATTENTION; sets PENDING with attempts 0, re-enqueues, and audits DELIVERY_RETRIED; `retryAll` does the same for every NEEDS_ATTENTION delivery, optionally filtered by target, and returns the count), SimulationService.test.ts (OPS only; passes the mode through)
- [ ] T192 [US6] Write the outage recovery integration test in packages/core/test/integration/outage-recovery.int.test.ts (sandbox app in-process, BullMQ on Testcontainers Redis, the `deliveryRetry` config shortened for the test): with CRM `down` and messaging `garbage`, publishing and accepting succeed; deliveries move to RETRYING and then NEEDS_ATTENTION; after switching to `up` and a manual retry, everything is SENT, the sandbox has each idempotency key exactly once, and every CRM record equals the platform status; stopping and restarting the dispatcher mid-retry loses and duplicates nothing (SC-007, SC-012)

### Implementation for User Story 6

- [ ] T193 [P] [US6] Create the ops contracts in packages/contracts/src/ops/: `TimelineEntry` (`occurredAt`, `kind`: audit | match | offer | delivery, `summary`, `outcome`, `actor?`), `DeliveryView` (with `lastError` redacted), `CrmComparisonRow` (`packageId`, `platformStatus`, `crmStatus`, `inSync`, `pendingDeliveryId?`), `SIMULATION_SERVICES` (`crm`, `messaging`, `storage`), `SIMULATION_MODES` (`up`, `down`, `slow`, `garbage`), and `simulationInputSchema`
- [ ] T194 [US6] Implement `TimelineService`, `MatchExplanationService` (`explain(actor, packageId, investorId)` → `MatchExplanationView`, replaying non-matches from the ListingVersion and BuyBoxVersion snapshots with the registry evaluator), `DeliveryOpsService` (list by status, retry, retryAll), `CrmComparisonService` (via `ICrmMirrorReader`), and `SimulationService` (via `ISimulationControlProvider`) in packages/core/src/services/ops/ (depends on T191)
- [ ] T195 [US6] Create `createOpsRouter` (GET `/ops/listing-packages/:id/timeline`, GET `/ops/listing-packages/:id/matches/:investorId`, GET `/ops/deliveries`, POST `/ops/deliveries/:id/retry` → 202, POST `/ops/deliveries/retry-all` → 202 `{ count }`, GET `/ops/crm-comparison`, GET `/ops/simulations`, PUT `/ops/simulations/:service`, GET `/ops/config`, PUT `/ops/config/:key`) in apps/api/src/routes/ops.router.ts, wired in container.ts and app.ts; add the typed client module packages/contracts/src/client/ops.ts
- [ ] T196 [US6] Build the ops home (every package with status, offer count, and failing-delivery count) in apps/web/src/app/(ops)/ops/page.tsx and the ops package page with the timeline (TimelineTemplate) and the "Why not matched?" panel (pick an investor → each of their buy boxes with its failing criteria and expected and actual values, a "replayed" label on non-matches, and a notice when `replayedWithNewerRules` is true) in apps/web/src/app/(ops)/ops/packages/[id]/page.tsx
- [ ] T197 [US6] Build the deliveries page (filter by status; Needs attention first; the error shown; a retry button; a "Retry all" button for Needs attention; a "Send digests now" button calling `POST /ops/match-digests`; auto-refresh) in apps/web/src/app/(ops)/ops/deliveries/page.tsx
- [ ] T198 [US6] Build the simulations page (a mode RadioGroup per service with the current state) in apps/web/src/app/(ops)/ops/simulations/page.tsx, the CRM comparison page (in-sync badge, or a link to the pending delivery) in apps/web/src/app/(ops)/ops/crm/page.tsx, and the config editor (JSON per key with server validation errors shown) in apps/web/src/app/(ops)/ops/config/page.tsx

**Checkpoint**: Quickstart V6 passes. US1–US5 still pass.

---

## Phase 9: Design System and White-Label (FR-090 to FR-097, cross-cutting)

**Purpose**: The second brand, the brand switcher, the living style guide, ops theme updates,
and the automated brand checks. The foundation (tokens, primitives, templates) is in Phase 2.

- [ ] T199 [P] Write the per-brand test in packages/core/src/services/brand/seed-brands.test.ts: every file in seed/brands/ passes `brandTokenSetSchema` and `validateBrandTokenSet` (SC-015, part of `pnpm test`)
- [ ] T200 [P] Write the BrandService.updateTheme tests in packages/core/src/services/brand/BrandService.test.ts: OPS only; a missing token → ValidationError naming it; a failing pair → ValidationError naming both tokens and the ratio; success increments `tokenVersion` and audits CONFIG_CHANGED
- [ ] T201 Create seed/brands/brand-beta.json from the owner-supplied partner values plus the derived shades listed under "Seeded brand values" (`brand-beta`) in [design-tokens.md](./contracts/design-tokens.md) (`action.primary` `#0F766E`, hover `#115E59`, `focus.ring` and `brand.accent` `#0D9488`, `text.muted` `#4B5563`; pill controls and 4px cards), a fictional name, logo, and legal footer; add the logos apps/web/public/brands/brand-beta/logo.svg and apps/web/public/brands/clever/logo.svg
- [ ] T202 Implement `BrandService.updateTheme` in packages/core/src/services/brand/BrandService.ts and `PUT /ops/brands/:brandId/theme` in apps/api/src/routes/brands.router.ts (depends on T200)
- [ ] T203 Build the brand switcher (a Select listing `GET /brands`; sets the `brand` cookie; `router.refresh()`) in apps/web/src/brand/BrandSwitcher.tsx, shown in AppShell and on the home page (FR-093)
- [ ] T204 Build the living style guide at apps/web/src/app/design-system/page.tsx: every semantic token with its swatch or sample and its resolved value, every primitive and pattern in each state (default, hover, focus, disabled, error, loading, empty), every template with sample content, and the brand switcher (FR-097)
- [ ] T205 Build the ops theme editor (paste or upload a token set JSON; the server's missing-token and failing-pair errors are listed) in apps/web/src/app/(ops)/ops/brands/page.tsx (FR-095)
- [ ] T206 Run `pnpm lint` across apps/web and packages/ui and fix every raw style value (SC-014); confirm there are no brand names, colors, or logos in source files outside seed/ and apps/web/public/brands/ (XVI)
- [ ] T207 Compare every screen side by side with cleveroffers.com (SC-013) and adjust primitives in seed/brands/clever.json only where they differ, keeping the AA text shades; re-run T199

**Checkpoint**: Quickstart V7 passes.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end proof, security checks, delivery limits, and the submission package.

- [ ] T208 [P] Write the end-to-end integration test in packages/core/test/integration/end-to-end.int.test.ts: publish → match → offer → accept → milestones → CLOSED, with CRM deliveries SENT and the sandbox CRM record CLOSED (R18, SC-010)
- [ ] T209 [P] Write the log redaction integration test in packages/core/test/integration/log-redaction.int.test.ts: capture api and worker pino output during the end-to-end flow (including a failed delivery) and assert no seeded seller name, email, phone, or street line appears (FR-032, SC-006)
- [ ] T210 [P] Review the api security settings in apps/api/src/app.ts: helmet defaults, `x-powered-by` disabled, a 1 MB JSON limit, no CORS (the browser only talks to the BFF); and in the BFF, cookie flags and the Origin check on every state-changing method
- [ ] T211 Fill the README curl recipes (login, idempotent POST replay showing `Idempotent-Replay: true`, the 409 in-progress case, health) and copy the current Prototype Shortcuts table from [plan.md](./plan.md) into README.md
- [ ] T212 [P] Write scripts/verify-limits.sh: a clean `docker builder prune -af`, a timed `docker compose build` (fails if over 20 min), `docker compose up -d`, scripts/wait-for-home.sh (fails if over 5 min), and `docker stats --no-stream` (prints the total memory); document running it on a 2 GB x86_64 VM in README.md
- [ ] T214 Run the full quickstart (V1–V7) on a clean 2 GB x86_64 Linux VM and record the build time, startup time, and memory in README.md
- [ ] T215 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm test:integration` from the root package.json, and fix anything that fails in the reported files

---

## After Sprint 1: Production Storage Adapter (owner-scheduled)

**Purpose**: show that storage is swappable by adding the production adapter that
[contracts/providers.md](./contracts/providers.md) already names, behind the same port. The owner
(Tarun) scheduled it on 2026-11-01 to run after Sprint 1. It stays switched off in the demo: the
reviewer's `docker compose up` uses the sandbox, and nothing needs an AWS account. Recorded as a
deviation in plan.md Complexity Tracking.

- [X] T274 Write the S3 adapter tests first in packages/core/src/providers/storage/S3StorageProviderImpl.test.ts (a mocked S3 client; no AWS in CI): an upload link signs the `Content-Type` and the exact `Content-Length` (the declared size the port receives, see T275), so the browser cannot change either; `stat` returns `{ contentType, sizeBytes }` from `HeadObject`, and `null` on a 404; an S3 failure becomes `InfrastructureError`
- [X] T275 Make the storage port's size exact and its signing async (the AWS presigner is async, so `createUpload` and `getReadUrl` return Promises and the package routes sign photo links before building the view), then implement `S3StorageProviderImpl`. A presigned S3 `PUT` can pin one exact `Content-Length` but not a maximum, so `createUpload(key, contentType, maxBytes)` becomes `createUpload(key, contentType, sizeBytes)`: the exact size the browser declared (`PhotoService` already passes it; the browser sends `file.size`). The sandbox then refuses a body whose length differs (413 over, 400 under), and its test and contracts/providers.md change to match; `stat` after upload stays the real size guard. Then in packages/core/src/providers/storage/: `createUpload` → a presigned `PUT`, `getReadUrl` → a presigned `GET`, `stat` → `HeadObject`), select it in apps/api/src/container.ts with `STORAGE_PROVIDER=s3` (`S3_BUCKET` and `S3_REGION` required only then; credentials from the environment, never in the committed `.env`), and add a README note on switching (depends on T274)
- [X] T276 Put the database behind one swappable adapter (owner-requested 2026-10-31): an `IDatabase` port (`uow`, `check()`, `dispose()`) in packages/core/src/unit-of-work/IDatabase.ts and `PostgresDatabaseImpl` (the Prisma client, `PrismaUnitOfWorkImpl`, the health check, and disconnect) in packages/core/src/unit-of-work/PostgresDatabaseImpl.ts, so apps/api/src/container.ts builds the database in one line and another database (for example MySQL) is an `IDatabase` implementation plus that one line; the adapters barrel stops exporting `createPrismaClient` and `PrismaUnitOfWorkImpl`. No new tests: no rule changes, and the existing unit, integration, and end-to-end checks cover the wiring

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies.
- **Sprint 0**: depends on Setup; runs before Foundational. T226 must finish before T227 (no
  push until the repo is safe). After Sprint 0, every task merges to `main` through a pull request
  from a short-lived branch (trunk-based development).
- **Foundational (Phase 2)**: depends on Setup and Sprint 0; blocks every story.
- **US1 (Phase 3)**: depends on Foundational. It is the MVP gate: if the reviewer can't start
  it, nothing else is seen.
- **US2 (Phase 4)**: depends on Foundational. It reuses the US1 seed baseline and role shells,
  but its tests run without US1's Docker files.
- **US3 (Phase 5)**: depends on US2 (offers need published, matched packages).
- **US4 (Phase 6)**: depends on US3 (comparison needs offers).
- **US5 (Phase 7)**: depends on Foundational (the Criterion Registry, evaluators, and the
  investor and buy-box slices). Most of it can run in parallel with US2–US4, but the
  buy-box-side matching (T218, T219) extends US2's MatchingWorkflow (T126), and its "not matched
  after the edit" check needs US2's publish. T222 and T223 (near-miss) are a stretch.
- **US6 (Phase 8)**: depends on US2 (timeline and deliveries need packages). Its outage test
  T192 uses US4's accept, so finish US4 first or limit T192 to publish until US4 lands.
- **Design system (Phase 9)**: depends on Foundational and runs in parallel with any story.
  T207 is a visual check against cleveroffers.com.
- **Polish (Phase 10)**: depends on every phase you intend to ship.

### Story dependency graph

```text
Setup → Foundational ─┬─ US1 (MVP gate) ───────────────────────────┐
                      ├─ US2 → US3 → US4 ─┬─ US6 ──────────────────┼─ Polish
                      ├─ US5 ─────────────┘                        │
                      └─ Design system ────────────────────────────┘
```

### Within each story

- Tests first; confirm they fail (XVII.2).
- Test only the rules that matter (XV, test selection): list the task's rules, give each
  important one a single test, and skip tests of libraries, types, cosmetics, or rules already
  covered. A test task's wording ("tests for X") names the scope, not a quota.
- Prisma model and migration first, then contracts shaped from it (see the fields in the
  database before writing a contract) → repository slices → unit-of-work wiring → services and workflows → job handlers
  → routers and container wiring → client modules → screens → seed module.
- Each story ends at a checkpoint that re-runs the earlier stories' quickstart steps.

## Parallel Opportunities

- Setup: T002–T013 and T015 in parallel after T001.
- Foundational: the contracts tasks (T016–T028), the shared repository slices (T044–T052),
  the provider ports (T059), the UI primitives and patterns (T086, T087), and the sandbox tests
  (T069) are independent files.
- Every story's test tasks marked [P] can be written together.
- US5 and Phase 9 can be staffed in parallel with US2–US4.

### Parallel example: User Story 2

```text
# Tests together:
T108 views.pii.test.ts · T109 ListingPackageService.test.ts · T110 PublicationWorkflow.test.ts
T111 MatchingWorkflow.test.ts · T112 close-offer-round.handler.test.ts · T113 PhotoService.test.ts
T114 publish-match.int.test.ts · T115 usePackageWizard / usePhotoUpload tests

# Then contracts and slices together:
T116 listing-package contracts · T117 photo and match contracts
T118 seller slice · T119 property slice · T120 listing-package slice · T121 photo and match slices
```

### Parallel example: User Story 4

```text
T156 net-proceeds.test.ts · T157 OfferComparisonService.test.ts · T158 DecisionWorkflow.test.ts
T159 OfferService.counter.test.ts · T160 DealLifecycleWorkflow.test.ts · T161 reveal test
T162 accept-race.int.test.ts · T163 deal-lifecycle.int.test.ts
then T164 contracts ∥ T165 decision and deal slices
```

## Implementation Strategy

### MVP first

1. Phases 1 and 2.
2. Phase 3 (US1): the zip starts on a 2 GB machine and every demo account logs in.
3. **Stop and validate** with quickstart V1 on a clean VM. This is the assignment's hard gate.

### Incremental delivery

1. US2 → V2 (one package, many matched investors, privacy-safe).
2. US3 → V3 (offers flow back; duplicates impossible). The core hypothesis is now demonstrable.
3. US4 → V4 (compare, accept, close, backups).
4. US5 → V5 (buy box editing and the legacy import).
5. US6 → V6 (failure behavior and diagnosability).
6. Phase 9 → V7 (white-label), then Phase 10.

Re-run V1 after each increment, because every story adds to the build and the seed.

## Notes

- [P] means different files and no dependency on an unfinished task.
- A task that extends a file created in an earlier story names that file. Run it after the
  earlier task.
- The contract changes these tasks rely on (the upload instruction, `read`, `ICrmMirrorReader`,
  `ISellerContactReader`, `GET /package-form`, the agent offer list, and the backup-expiry
  extension) were written into [contracts/](./contracts/) before implementation, so the
  contracts stay the source of truth (V).
- Commit after each task or logical group, once the user asks for commits. After Sprint 0,
  each task or small group is one pull request from a short-lived `t###-short-summary` branch
  off `main`, merged by squash within about a day (trunk-based development, Sprint 0).
