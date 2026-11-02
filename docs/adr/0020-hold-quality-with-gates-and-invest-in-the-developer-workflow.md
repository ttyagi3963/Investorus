# 0020. Hold quality with gates and invest in the developer workflow

## Status
Accepted, 2026-11-01. Deciders: Tarun (owner), Claude.

## Context
- One owner directs Claude agents that write most of the code, quickly, across ten sprints (0 to
  9). Review alone cannot keep up, and agents produce plausible code that can still be wrong
  (ADR 0003).
- `main` must stay releasable: the submission zip must start with one command at any moment.
- The free private GitHub plan has no rulesets or branch protection.
- Early tests were padded: many re-tested what the database, Zod, or the type checker already
  guaranteed.
- Before T401, the core integration suite started 34 Postgres containers and ran migrations 34
  times, taking 170 s. Formatting was not checked, and 19 files had drifted (T400).
- A prototype built fast must take shortcuts, and a reviewer has to be able to tell a deliberate
  shortcut from an oversight.

## Decision
We will make quality a property of the pipeline, not of attention, and spend effort on a fast
feedback loop.
- **Trunk-based delivery (ADR 0001).** One branch and one PR per batch (normally a sprint), one
  commit per task, squash merged, with `Closes #N` for each task. A PR is merged only when
  `lint-typecheck` (including `pnpm format:check`, T400), `unit-tests`, `integration-tests` (with
  the migration drift check), `security` (gitleaks), and `submission-rehearsal` (when it runs,
  ADR 0015) are all green. An automated review against the constitution comments on each PR.
- **Tests first, and only for rules that matter (constitution XV).** Before writing tests, list the
  rules the task introduces. Each important rule gets one test, which must fail without the
  change. Zod, Prisma, React, and what the type checker rejects are never re-tested, and weak
  tests are deleted.
- **Two tiers, split by what each tier can prove (T403):** an in-memory fake carries pure business
  rules for fast offline unit tests; locks, constraints, races, and SQL are tested on real
  Postgres 17 (ADR 0005, ADR 0008).
- **One migrated template database (T401).** A Vitest global setup starts one Postgres per run and
  migrates it once; each test file copies the template into its own database.
- **A debt ledger.** Every shortcut is recorded in plan.md's Prototype Shortcuts table, repeated in
  the README, each with its production path; every deviation from the constitution goes in
  Complexity Tracking with its approval (ADR 0002). For example: brand token files are complete
  sets today (156 of 195 values identical), where production would use a base theme plus
  per-brand overrides (T408); the in-memory fake has no contract tests yet (T403).

## Alternatives considered
- **Merge on review alone:** reviews miss leaked secrets and drift that only CI sees. Without
  branch protection, the checks are the only gate applied the same way every time.
- **Mocks everywhere:** a fake cannot show a lock, a unique index, or a race. The repository and
  the database's unique index disagreed about "active listing" until a test compared them for
  every status (T369). The Sprint 9 race tests (T365, T383) need a real database.
- **Coverage targets:** they reward exactly the padding XV removes.
- **Untracked shortcuts:** a reviewer cannot tell a choice from an omission, and the production
  path is lost.

## Consequences
- **Positive:** the core integration suite went from 170 s to about 32 s (T401).
- **Positive:** the Sprint 9 PR (#262) ran 34 core integration files (86 tests) plus the api and
  sandbox suites, with all 167 core unit tests passing (T391). It closed 44 Sprint 9 tasks
  (T365–T408), and every fix had a test that fails without it.
- **Positive:** formatting can no longer drift unseen, and every shortcut has a named production
  path.
- **Negative:** the gates are enforced by convention, not by GitHub, and the rehearsal is
  path-filtered to save Actions minutes.
- **Negative:** with fewer tests, a rule nobody listed gets no test.
- **Negative:** the fake can drift from Postgres until contract tests exist, and integration tests
  need Docker.
- **Revisit when:** a paid plan or a public repo allows branch protection and a merge queue; the
  team grows beyond one owner (then add required reviewers); or the fake drifts again (then write
  the contract suite, or run service tests on the template database).

## Evidence
- [ci.yml](../../.github/workflows/ci.yml), [submission.yml](../../.github/workflows/submission.yml),
  [.github/pull_request_template.md](../../.github/pull_request_template.md)
- [migrated-template.ts](../../packages/core/test/migrated-template.ts),
  [InMemoryRepositories.ts](../../packages/core/test/doubles/InMemoryRepositories.ts)
- [README.md Prototype Shortcuts](../../README.md#prototype-shortcuts)
- Spec documents (available on request): constitution XV, XVII, Quality Gates; tasks.md Sprint 9
  (T369, T400, T401, T403, T408); plan.md Complexity Tracking and Prototype Shortcuts; research R18
