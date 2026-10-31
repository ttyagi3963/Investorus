# CLAUDE.md

Conventions for working in this repository. The rules themselves live in the constitution and
the feature docs; this file says where they are and how work moves through the repo.

## What this is

A prototype investor platform: agents publish listing packages, matching investors are notified
and make offers, and agents compare offers and track the accepted deal to closing. It is a pnpm +
Turborepo monorepo:

- `apps/api` (Express, port 4000), `apps/worker` (background jobs), `apps/web` (Next.js BFF,
  port 3000), `apps/sandbox` (stand-in CRM, email/SMS, and storage, port 4100)
- `packages/contracts` (Zod schemas and types), `packages/core` (domain: ports, services,
  workflows, adapters, Prisma), `packages/ui` (React Aria components), `packages/config`
  (shared tsconfig, ESLint, Vitest)

## Sources of truth

- **Constitution**: `.specify/memory/constitution.md`. It overrides everything else.
- **Feature docs**: `specs/001-investor-platform-prototype/` (spec, plan, research, data model,
  contracts, quickstart).
- **Tasks**: `specs/001-investor-platform-prototype/tasks.md` is the single source of truth for
  work. The GitHub Projects board mirrors it (`node scripts/board/sync-sprint.mjs --sprint N`); never add
  work to the board that is not in tasks.md.
- Work is spec-driven (GitHub Spec Kit): spec → plan → tasks → implement. No code without a task.

## How work merges (trunk-based)

- `main` is the trunk and must stay releasable: the submission zip must start with one command.
- One task, or a small group, per short-lived branch named `t###-short-summary`, cut from `main`.
  Merge it within about a day. Do not stack branches on unmerged branches.
- Squash merge. The PR uses `.github/pull_request_template.md` and says `Closes #N` for the
  task's board issue.
- Merge only when every check is green: `lint-typecheck`, `unit-tests`, `integration-tests`,
  `security`, `review-threads`, and `submission-rehearsal` when it runs. The free private plan
  has no rulesets, so this is enforced by convention.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `ci:`, `chore:`, `docs:`).
- Mark the task `[X]` in tasks.md when it is done.

## Architecture rules (summary; see the constitution)

- Hexagonal: dependencies point inward. `*Impl` classes and `@clever/core/adapters` are imported
  only in each app's `container.ts`. Lint enforces the boundaries.
- Routes only translate; services validate `unknown` input with Zod and own the business rules.
- Errors use the `DomainError` / `InfrastructureError` hierarchy.
- Seller PII never appears in events, logs, or investor views; it is encrypted at rest.
- Outbound calls (CRM, email, SMS) go through the transactional outbox.
- Buy box criteria come from the Criterion Registry (constitution XIX).
- No brand names, colors, or copy in source; brand tokens come from the theming layer.

## Writing code

- Every new file starts with a 1–3 line comment saying what the file does and why it exists.
- Database first: write the Prisma model and its migration before the contracts for that entity,
  and shape the contract from the table's actual fields. No contract without its table.
- Build only what the current task uses: no empty folders, unused exports, dependencies, or
  script steps for features that do not exist yet, and no checks for cases that cannot happen.

## Commands

pnpm is not installed globally; `npx -y pnpm@10.34.9 <command>` works.

```sh
pnpm install
pnpm lint            # ESLint, including boundary and jsx-a11y rules
pnpm typecheck
pnpm test            # unit tests: offline, no database, network, or containers
pnpm test:integration  # *.int.test.ts with Testcontainers (needs Docker)
pnpm db:check        # prisma validate + migration drift check
docker compose up --build   # the whole stack, exactly as the reviewer runs it
```

Submission: `scripts/package-zip.sh` builds the zip from git; `scripts/submission/check_zip.py`
checks Clever's limits; `scripts/submission/rehearse.sh` runs it in a 2 GB / 2-core
Docker-in-Docker machine.

## Testing

- Tests come first and must fail without the change.
- Test only the rules that matter (constitution XV, test selection). Before writing tests, list
  the rules the task introduces and give each important one a single test: privacy and
  secrets, data invariants, fields that must not change, service business rules, and
  security limits.
- Do not test Zod, Prisma, or React themselves, what TypeScript already rejects, cosmetic
  normalization, exact boundaries (unless the boundary is the rule), or a rule that is
  already covered. Delete weak or redundant tests instead of keeping them.
- Unit tests stub the network; fake timers only inside the test files that need them, set up
  and torn down per file, never globally.
- Integration tests are `*.int.test.ts` and start their own Postgres 17 containers.

## Hard constraints

- **Submission limits**: one `docker compose up --build`, no secrets or outside accounts, build
  ≤ 20 min and home page ≤ 5 min on a 2 GB x86_64 machine, zip ≤ 100 MB. Keep
  `PNPM_MAX_WORKERS=2` in the Dockerfile; without it the build runs out of memory.
- **Confidentiality**: `assignment.md` is Clever's brief. It stays local, is gitignored, and is
  never committed, quoted at length, or uploaded. The repository is private.
- **Secrets**: none. `.env` holds demo values only and is committed on purpose; accepted gitleaks
  findings are listed in `.gitleaksignore`.
- **Pinned versions**: Node 24, TypeScript 5.9 (not 7: typescript-eslint), Prisma 7, pnpm 10.
- **Line endings**: LF everywhere (`.gitattributes`).

## Working on Windows

- Git Bash rewrites Linux paths passed to Docker (`/sys/...`); set `MSYS_NO_PATHCONV=1`.
- Windows PowerShell 5.1 reads UTF-8 files without a BOM as ANSI. Do not round-trip Markdown
  through `Get-Content`/`Set-Content`; let tools read files directly (for example
  `gh pr create --body-file`).
