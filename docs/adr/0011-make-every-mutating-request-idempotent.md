# 0011. Make every mutating request idempotent

## Status
Accepted, 2026-11-01. Deciders: Tarun (owner), Claude.

## Context
- A double-click or a network retry must not publish a package twice, submit two offers, or accept
  twice. Business rules catch some repeats (a unique address hash, a version check), but a retried
  offer or decision after a lost answer needs the first answer back, not a 409.
- Constitution XX.2: every POST, PUT, and PATCH carries an `Idempotency-Key`, enforced by
  middleware before the routes; keys and answers are kept 24 hours in Redis; a store outage fails
  closed with 503 and `Retry-After: 5`. Postgres is allowed only as a fallback.
- In Sprint 2 Redis did not exist yet (ADR 0012): adding it for keys alone would add a service to
  the 2 GB machine.
- A stored answer can hold seller details (a package view), so it is PII at rest (ADR 0013).

## Decision
We will put an `idempotency` middleware in front of every mutating api route, with the keys in a
Postgres `IdempotencyKey` table, an owner-approved deviation from XX.2 recorded in plan.md:
1. **Claim in one statement.** `INSERT … ON CONFLICT (userId, key) DO UPDATE … WHERE` the old key
   is past 24 h, or its lease ran out with nothing committed. Two requests can never both hold it.
2. **The claim is a lease.** 30 s, with its own token, on the database clock. The request's first
   write marks the claim committed in that write's own transaction (the unit of work, ADR 0007),
   only while the lease holds, so a request that outlives its lease is rolled back (T367). The
   claim counts as committed only if the transaction inserted, updated, or deleted rows; a row
   lock alone does not (T405).
3. **Answers.** Same key and body → the stored status and body with `Idempotent-Replay: true`.
   Still running → 409 `IDEMPOTENCY_IN_PROGRESS`, `Retry-After: 1`. Committed but the answer lost
   (a crash, or a 5xx after the commit) → 409 `IDEMPOTENCY_ALREADY_APPLIED`; it never runs twice.
   Another body → 422 `IDEMPOTENCY_KEY_REUSED`. A 5xx with nothing committed frees the key. A
   store error → 503, `Retry-After: 5`.
4. **Storage.** Answers are encrypted with the PII cipher. Keys are kept 24 h; each job-loop tick
   purges up to 1,000 older ones (T390, ADR 0010). Sessions are pinned to UTC so leases hold
   (T390).
5. **The client owns the key per action.** The typed client keeps each request's key until the
   api settles it: a lost answer, a 5xx, or either 409 reuses it; success, another refusal, or a
   changed body starts a new one. The BFF passes back `Retry-After` and `Idempotent-Replay`
   (T381).
6. **Sign-in is exempt:** it has no user to key on, and a replay would store a session token.

## Alternatives considered
- **Redis as the store (what XX.2 names):** fast with native TTL, but in Sprint 2 it meant a new
  service for this alone, and a Redis key cannot commit in the same transaction as the change,
  which is what makes "already applied" knowable after a crash. Kept as the production path.
- **No idempotency; rely on unique constraints and versions:** what Sprint 1 shipped (a recorded
  deviation). It refuses some repeats with a 409 instead of returning the first answer, and cannot
  protect a decision or a counter that has no natural key.
- **A fresh key per call (the first client, T285):** any call not handed a key got a new one, so
  its retry after a lost answer could run again; the two forms that kept their own keys cleared
  them on any error, 5xx and 409 in progress included. T381 moved the key into the client, which
  covers every mutating call with no call-site change.

## Consequences
- **Positive:** the recovery test kills a request before and after its commit: a retry runs the
  change once, or is told it was applied; a request past its lease cannot commit.
- **Negative:** every mutating request adds a claim, a commit mark, and a stored answer to the
  primary database.
- **Negative:** the design took three fixes after it shipped: the lease (T367; the first version
  relied on the 24 h expiry), the time zone (T390), and "locked is not wrote" (T405). Subtle code
  that needs its integration tests kept.
- **Negative:** the client remembers keys for the page only; a full reload forgets them.
- **Revisit when:** request volume makes the key table a hot spot, or Redis gains persistence and
  the team accepts losing the same-transaction commit marker.

## Evidence
- [idempotency.ts](../../apps/api/src/middleware/idempotency.ts),
  [PrismaIdempotencyStoreImpl.ts](../../packages/core/src/repositories/idempotency/PrismaIdempotencyStoreImpl.ts),
  [http.ts](../../packages/contracts/src/client/http.ts)
- [idempotency.int.test.ts](../../apps/api/test/idempotency.int.test.ts),
  [idempotency-recovery.int.test.ts](../../packages/core/test/idempotency-recovery.int.test.ts)
- [README.md "Try the api with curl"](../../README.md#try-the-api-with-curl) (a replay and a
  reused key)
- Spec documents (available on request): plan.md Complexity Tracking (the XX.2 row, the
  owner-approved deviation to a Postgres store); contracts/api.md; constitution XX.2; tasks T284,
  T285, T367, T381, T390, T405. Research R13 describes the original Redis design, which that
  deviation replaced; this ADR follows the code.
