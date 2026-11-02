# Architecture Decision Records

An Architecture Decision Record (ADR) is a short note on one decision: the forces behind it, what
we chose, what we rejected, and what it costs. We write one when a decision had real alternatives
and is costly to reverse or cuts across the system; smaller choices stay in the task that made
them. A replaced decision is not deleted: it is marked "Superseded" and points to its successor.
New ADRs start from [template.md](template.md). The detailed research, task log, and engineering
constitution behind these decisions are kept in the project's spec documents, available on
request.

## Foundations

| # | Title | Status | Date |
| --- | --- | --- | --- |
| 0001 | [Use spec-driven development with GitHub Spec Kit](0001-use-spec-driven-development-with-spec-kit.md) | Accepted | 2026-11-01 |
| 0002 | [Govern engineering with a constitution](0002-govern-engineering-with-a-constitution.md) | Accepted | 2026-11-01 |
| 0003 | [Direct AI agents as an engineering team, and verify before trusting](0003-direct-ai-agents-as-a-team-and-verify-before-trusting.md) | Accepted | 2026-11-01 |
| 0004 | [Choose the technology stack](0004-choose-the-technology-stack.md) | Accepted | 2026-11-01 |
| 0005 | [Use ports and adapters behind a BFF](0005-use-ports-and-adapters-behind-a-bff.md) | Accepted | 2026-11-01 |
| 0006 | [Abstract only where a swap is real](0006-abstract-only-where-a-swap-is-real.md) | Accepted | 2026-11-01 |
| 0007 | [Run each use case in one transaction (unit of work)](0007-run-each-use-case-in-one-transaction.md) | Accepted | 2026-11-01 |

## Reliability and data

| # | Title | Status | Date |
| --- | --- | --- | --- |
| 0008 | [Resolve concurrency in three layers](0008-resolve-concurrency-in-three-layers.md) | Accepted | 2026-11-01 |
| 0009 | [Send every outside call through a transactional outbox](0009-send-every-outside-call-through-a-transactional-outbox.md) | Accepted | 2026-11-01 |
| 0010 | [Run time-based rules as durable jobs in Postgres](0010-run-time-based-rules-as-durable-jobs-in-postgres.md) | Accepted | 2026-11-01 |
| 0011 | [Make every mutating request idempotent](0011-make-every-mutating-request-idempotent.md) | Accepted | 2026-11-01 |
| 0012 | [Use Postgres as the backbone, and Redis only for delivery](0012-use-postgres-as-the-backbone-and-redis-only-for-delivery.md) | Accepted | 2026-11-01 |
| 0013 | [Protect seller privacy by design](0013-protect-seller-privacy-by-design.md) | Accepted | 2026-11-01 |
| 0014 | [Make every request traceable, and keep personal details out of logs](0014-make-every-request-traceable-and-keep-personal-details-out-of-logs.md) | Accepted | 2026-11-01 |

## Constraints and product

| # | Title | Status | Date |
| --- | --- | --- | --- |
| 0015 | [Design for the reviewer's 2 GB machine](0015-design-for-the-reviewers-2-gb-machine.md) | Accepted | 2026-11-01 |
| 0016 | [Build one matching engine from a criterion registry, and make every decision explainable](0016-one-matching-engine-from-a-criterion-registry.md) | Accepted | 2026-11-01 |
| 0017 | [Set the offer deadline policy](0017-set-the-offer-deadline-policy.md) | Accepted | 2026-11-01 |
| 0018 | [Block an inactive investor from signing in and from having offers accepted](0018-block-an-inactive-investor-from-sign-in-and-acceptance.md) | Superseded by 0019 | 2026-11-01 |
| 0019 | [Lock out only a banned login; leave an inactive investor out of matching only](0019-lock-out-only-a-banned-login.md) | Accepted (supersedes 0018) | 2026-11-01 |

## Delivery

| # | Title | Status | Date |
| --- | --- | --- | --- |
| 0020 | [Hold quality with gates and invest in the developer workflow](0020-hold-quality-with-gates-and-invest-in-the-developer-workflow.md) | Accepted | 2026-11-01 |
