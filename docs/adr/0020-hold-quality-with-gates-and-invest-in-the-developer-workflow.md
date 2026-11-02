# 0020. Hold quality with gates and invest in the developer workflow

## Status
Accepted, 2026-11-01. Deciders: Tarun (owner), Claude.

## Context
- One owner directs Claude agents that write most of the code, quickly, across ten sprints (0 to 9). Review alone cannot keep up, and agents produce plausible code that can still be wrong.
- `main` must stay releasable: the submission zip must start with one command at any moment.
- The free private GitHub plan has no rulesets or branch protection.
- Early tests were padded. The first User contracts had 28 tests, and the owner cut them to 1 because the database and the services already owned those rules.
- Before T401, the core integration suite started 34 Postgres containers and ran migrations 34 times, taking 170 s. Formatting was not checked, and 19 files had drifted (T400).
- A 48-hour prototype must take shortcuts. A reviewer has to be able to tell a deliberate shortcut from an oversight.

## Decision
We will make quality a property of the pipeline, not of attention, and spend effort on a fast feedback loop.
- **Trunk-based delivery (CLAUDE.md):**
  - One branch and one PR per batch (normally a sprint), with one commit per task, squash-merged, and `Closes #N` for each task.
  - A PR is merged only when `lint-typecheck` (including `pnpm format:check`, T400), `unit-tests`, `integration-tests` (with the migration drift check), `security` (gitleaks), and `submission-rehearsal` (when it runs) are all green.
  - An automated review against the constitution comments on each PR.
  - No code without a task in tasks.md. The board mirrors tasks.md.
- **Tests first, and only for rules that matter (constitution XV).** Before writing tests, list the rules the task introduces. Each important rule gets one test, which must fail without the change. Zod, Prisma, React, and what the type checker rejects are never re-tested, and weak tests are deleted.
- **Two tiers, split by what each tier can prove (T403):**
  - An in-memory fake carries pure business rules for fast offline unit tests.
  - Locks, constraints, races, and SQL are tested on real Postgres 17.
- **One migrated template database (T401).** A Vitest global setup starts one Postgres per run and migrates it once. Each test file then copies the template into its own database.
- **A debt ledger.** Every shortcut is recorded in plan.md's Prototype Shortcuts table, repeated in the README, each with its production path. Every deviation from the constitution goes in Complexity Tracking with its approval. Examples:
  - Brand token files are complete sets today (156 of 195 values identical); production uses a base theme plus per-brand overrides (T408).
  - The in-memory fake has no contract tests yet; production runs one suite against both repositories (T403).
  - Match decisions are audit entries until the MatchEvaluation table is needed (Complexity Tracking).

## Alternatives considered
- **Merge on review alone:** reviews missed a leaked test key that gitleaks caught (#92) and drift that only CI sees. Without branch protection, the checks are the only gate that is applied the same way every time.
- **Mocks everywhere:** a fake cannot show a lock, a unique index, or a race. The repository and the database's unique index disagreed about "active listing" until a test compared them for every status (T369). The Sprint 9 race tests (T365, T383) need a real database.
- **Coverage targets:** they reward exactly the padding XV removes.
- **Untracked shortcuts:** a reviewer cannot tell a choice from an omission, and the production path is lost.

## Consequences
- **Positive:**
  - The core integration suite went from 170 s to 32–34 s (T401).
  - The Sprint 9 PR ran 34 core integration files (86 tests) plus the api and sandbox suites, and all 167 core unit tests passed (T391). The PR closed 47 Sprint 9 tasks, and every fix had a test that fails without it.
  - Formatting can no longer drift unseen.
  - Every shortcut has a named production path.
- **Negative:**
  - The gates are enforced by convention, not by GitHub.
  - The rehearsal is path-filtered to save Actions minutes.
  - With fewer tests, a rule nobody listed gets no test.
  - The fake can drift from Postgres until contract tests exist.
  - Integration tests need Docker.
- **Revisit when:**
  - A paid plan or a public repo allows branch protection and a merge queue.
  - The team grows beyond one owner. Then add required reviewers.
  - The fake drifts again. Then write the contract suite, or run service tests on the template database.

## Evidence
- [CLAUDE.md](../../CLAUDE.md)
- [Constitution XV, XVII, Quality Gates](../../.specify/memory/constitution.md)
- [ci.yml](../../.github/workflows/ci.yml), [submission.yml](../../.github/workflows/submission.yml)
- [tasks.md Sprint 9: T369, T400, T401, T403, T408](../../specs/001-investor-platform-prototype/tasks.md)
- [plan.md Complexity Tracking and Prototype Shortcuts](../../specs/001-investor-platform-prototype/plan.md)
- [research.md R18](../../specs/001-investor-platform-prototype/research.md)
- Study notes 07, 27, 58 (local, git-excluded)
