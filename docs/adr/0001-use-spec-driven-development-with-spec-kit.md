# 0001. Use spec-driven development with GitHub Spec Kit

## Status
Accepted, 2026-11-01. Deciders: Tarun (owner), Claude.

## Context
- The prototype was built in about 48 hours by one owner directing Claude agents. Most of the code
  is AI-generated, so the risk is not typing speed but drift: code that solves a problem nobody
  asked for, or quietly breaks a rule agreed earlier.
- The brief has hard limits that every change must respect: one `docker compose up --build`, a
  2 GB x86_64 machine, no secrets or outside accounts, seller privacy.
- Agents lose context between sessions. Whatever is not written down is lost, or reinvented
  differently next time.
- The owner has to stay able to review: what is being built, why, and what was left out.

## Decision
We will drive all work through GitHub Spec Kit: spec → plan → tasks → implement.
- `spec.md` holds user stories and functional requirements; `plan.md` the technical approach, the
  constitution check, approved deviations, and prototype shortcuts; `research.md` each technical
  decision with its rejected alternatives (R1–R24).
- `tasks.md` is the single source of work. A GitHub Projects board mirrors it
  (`node scripts/board/sync-sprint.mjs --sprint N`), never the other way round.
- No code without a task. Each sprint opens with a goal and a "Decisions" list written by the
  owner; a task split from a larger one names its source.
- One branch and one PR per batch (normally a sprint), one commit per task, squash merged when
  every CI check is green. The PR says `Closes #N` for each task's board issue.
- Decisions made during implementation go back into the task line ("Decided", "Not done, by
  decision"), so the reason survives the session that made it.

## Alternatives considered
- **Ad-hoc prompting:** fastest for the first hour; after that, each session re-decides
  architecture, and nothing records why a choice was made or what was skipped.
- **A ticket tracker as the source of truth:** tickets live outside the repo, so agents cannot
  read or update them in the same change as the code, and they drift from it.
- **Code first, documents after:** documents written after the fact describe what was built, not
  what was intended, so a reviewer cannot tell a deliberate shortcut from a mistake.

## Consequences
- **Positive:** 218 tasks done across Sprints 0–9 (counted in tasks.md), each traceable to a
  requirement and a commit. Every deviation from the plan or the constitution is a dated row with
  the owner's approval (plan.md Complexity Tracking). Reviewers can read the reasoning, not just
  the result.
- **Positive:** a review finding becomes a task with a test, and a rejected finding becomes a
  written "Not done" with the reason (see ADR 0003).
- **Negative:** the documents are large (tasks.md alone is 1,562 lines; spec.md 649). The
  original phase-ordered task list stays as the backlog beside the sprint tasks cut from it, so
  187 boxes remain open there and reading status takes care.
- **Negative:** process text can drift. tasks.md's closing notes still describe one PR per task;
  CLAUDE.md changed that to one PR per batch.
- **Negative:** writing and keeping the documents costs time a 48-hour build feels.
- **Revisit when:** the team grows past one owner, or work runs over many features at once; then
  move work tracking to a real tracker fed from the specs, and split tasks.md per feature.

## Evidence
- [spec.md](../../specs/001-investor-platform-prototype/spec.md),
  [plan.md](../../specs/001-investor-platform-prototype/plan.md),
  [research.md](../../specs/001-investor-platform-prototype/research.md),
  [tasks.md](../../specs/001-investor-platform-prototype/tasks.md) (Sprint goals and "Decisions"
  lists; T228 and T272 for the board sync)
- [scripts/board/sync-sprint.mjs](../../scripts/board/sync-sprint.mjs),
  [.github/pull_request_template.md](../../.github/pull_request_template.md),
  [CLAUDE.md](../../CLAUDE.md) ("Sources of truth", "How work merges")
- Constitution XVII.1 (Spec Kit before generation):
  [constitution.md](../../.specify/memory/constitution.md)
- Study notes 27 (trunk-based development and CI) and 30 (build only what the task uses)
