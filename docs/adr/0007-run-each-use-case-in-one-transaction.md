# 0007. Run each use case in one transaction (unit of work)

## Status
Accepted, 2026-11-01. Deciders: Tarun (owner), Claude.

## Context
- A use case writes several rows that only make sense together: a package, its seller and
  property; an accepted offer and its new deal, with the audit entry and the CRM event.
- Constitution XVIII.1: a state change and its outbox event commit in the same transaction, so an
  event is sent if and only if the change committed. XII: every status transition writes an audit
  entry.
- Services must not see Prisma (constitution I, IV), so they cannot hold a transaction client.
- Agents write many workflows. A rule that each call site must remember ("also write the CRM
  event") will be forgotten somewhere.

## Decision
We will run every use case inside one unit of work, `uow.run(async (repos) => { ... })`.
- `PrismaUnitOfWorkImpl` opens one interactive Prisma transaction per `run` and hands the callback
  every repository bound to it. Services get repositories only there, never from their
  constructors, so a write outside the transaction cannot be expressed.
- The change, its `AuditLog` entry, and its `OutboxEvent` rows are written in the same `run`.
- A package's status change writes `package.status_changed` with the CRM snapshot inside the
  package repository itself (the `withOutboxEvents` decorator, T337), applied by both units of
  work, so no workflow can forget it. Kept on review, confirmed by the owner (T396).
- Rules learned in Sprint 9:
  - **No outside call inside a transaction.** Call the outside service first, then record the
    result (T381: the simulation switch moved out of its audit transaction). Queue on Redis only
    after the claiming transaction commits (T379).
  - **Answer from the writing transaction.** Build a response from the same transaction that saved
    it, not from a later read (T381: the theme save).
  - **No parallel queries in one transaction.** A transaction holds one connection; `Promise.all`
    inside `run` overlaps queries on it, which pg deprecates (T399).
  - **Lock before you read.** Changes that race on a package take its row lock first, then read
    (T376, T390).
  - **One-time effects claim a marker in the same transaction** (`EffectMarker`, T368), so a
    re-run job does nothing twice.

## Alternatives considered
- **A transaction per repository call:** a crash halfway leaves orphan rows, and the outbox rule
  becomes impossible.
- **Pass a `tx` into every repository call, or track it implicitly (`AsyncLocalStorage`,
  `@Transactional`):** the first leaks the Prisma type into every port and fails silently when one
  call forgets it; the second hides which writes are grouped and needs decorators, which the
  constitution forbids.
- **Sagas or event sourcing:** built for work across services or databases; here every write is in
  one Postgres, where a local transaction is simpler and stronger.
- **An explicit event call in every workflow:** works until one workflow forgets it; the decorator
  makes the CRM event structural.

## Consequences
- **Positive:** a change and its audit and outbox rows commit or roll back together; Sprint 9's
  recovery fixes (idempotency claims marked in the writing transaction, T367 and T405; effect
  markers, T368) were possible because every write already had one transaction boundary.
- **Positive:** the in-memory unit of work now rolls back every store when its work throws (T391),
  so unit tests see the same all-or-nothing behaviour.
- **Negative:** transactions must stay short. Prisma's limits (5 s, 2 s to get a connection) ended
  a row-by-row "retry all" on 20,000 rows (P2028); it became one bulk UPDATE (T386).
- **Negative:** the status-event decorator is less visible than an explicit call; the repository
  port's comment now says it is there.
- **Negative:** the investor import commits each CSV row in its own transaction, which is slow for
  large files (plan.md Prototype Shortcuts).
- **Revisit when:** a use case must span a second service or database (then the outbox plus a saga
  for that step); or a transaction regularly approaches the 5 s limit.

## Evidence
- Constitution IV and XVIII.1: [constitution.md](../../.specify/memory/constitution.md)
- [research.md](../../specs/001-investor-platform-prototype/research.md) R7 (outbox), R14
  (concurrency), R22 (the `IUnitOfWork` correction)
- [IUnitOfWork.ts](../../packages/core/src/unit-of-work/IUnitOfWork.ts),
  [PrismaUnitOfWorkImpl.ts](../../packages/core/src/unit-of-work/PrismaUnitOfWorkImpl.ts),
  [with-outbox-events.ts](../../packages/core/src/outbox/with-outbox-events.ts)
- tasks.md T043, T337, T367, T368, T376, T379, T381, T386, T390, T391, T396, T399, T405
- Study notes 14 (unit of work), 52 (the outbox), 58 (review anti-patterns)
