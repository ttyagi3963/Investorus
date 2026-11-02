# 0002. Govern engineering with a constitution

## Status
Accepted, 2026-11-01. Deciders: Tarun (owner), Claude.

## Context
- Over 200 tasks were written by AI agents across many sessions. Without fixed rules, each session
  makes locally reasonable choices that disagree with each other: Prisma in a route here, a vendor
  call inside a transaction there, a seller's phone number in a log line.
- A prototype that Clever might grow must show production habits (privacy, durability, brand
  safety), not just a working demo.
- The owner, acting as VP of Engineering, cannot review every line. He needs a short list of rules
  that automation and reviewers can check, and one place where exceptions are approved.

## Decision
We will govern the codebase with a constitution (version 7.2.0, kept with the spec documents),
which overrides every other document.
- Sixteen core principles and five platform extensions, written as MUST rules with a rationale.
  The ones that shape this codebase most:
  - I Hexagonal architecture, II Thin delivery layers, III Services own business logic;
  - XII Security, privacy, and auditability, and XX Data boundary security and PII protection;
  - XV Testing priorities (two tiers; only rules that matter get a test);
  - XVII AI-augmented engineering guardrails (Spec Kit first, test first, a human judge);
  - XVIII Transactional outbox, XIX Criterion Registry, XXI Workspace boundaries.
- Compliance: every PR is checked against it. A violation blocks the merge, including a failing
  boundary lint rule or test. The only exception is a deviation written in plan.md's Complexity
  Tracking table, naming the principle, the reason, the simpler alternative rejected, and the
  owner's dated approval.
- Amendments are versioned (MAJOR for removing or redefining a principle, MINOR for a new one,
  PATCH for wording), documented with a rationale, and approved by the VP of Engineering before
  merge.
- Rules are enforced by tools where possible: ESLint boundary rules, the style lint, the CI test
  tiers (ADR 0020), and an advisory Claude review of each PR against the constitution (the human
  reviewer stays the gate, XVII.3).

## Alternatives considered
- **A style guide or README conventions:** advisory; nothing blocks a merge, and agents treat it
  as a suggestion.
- **Rules only in prompts or CLAUDE.md:** they shape one session; they carry no approval process
  and no version history. (CLAUDE.md now points to the constitution instead.)
- **No written rules, review catches it:** puts all the load on the one reviewer and hides
  exceptions inside merged code.

## Consequences
- **Positive:** consistent structure across sprints written by different agent sessions. Every
  exception is visible in one table: seven rows today, each with its reason and production path.
- **Positive:** the constitution changed when evidence did. 6.0.0 replaced JSON Logic rules with
  the Criterion Registry (XIX, 2026-10-30; ADR 0016); 7.2.0 added test selection to XV
  (2026-10-31).
- **Negative:** some principles are written for production and are heavier than a prototype needs
  (Redis for idempotency keys, TLS everywhere). Each such gap costs a deviation row (ADR 0011,
  ADR 0013).
- **Negative:** fixes lag. plan.md recommends a PATCH to XXI.1 (where the Prisma schema lives); it
  has not been made, so the deviation row stands in for it.
- **Revisit when:** a deviation row has stood for more than one release, or the same principle is
  deviated from twice; then amend the principle instead of excusing it again.

## Evidence
- Spec documents (available on request): the constitution (Core Principles, Quality Gates,
  Governance); plan.md Constitution Check and Complexity Tracking; tasks T216 (the 6.0.0
  follow-up)
- [packages/config/eslint/boundaries.js](../../packages/config/eslint/boundaries.js),
  [ci.yml](../../.github/workflows/ci.yml)
