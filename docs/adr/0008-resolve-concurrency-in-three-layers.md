# 0008. Resolve concurrency in three layers

## Status
Accepted, 2026-11-01. Deciders: Tarun (owner), Claude.

## Context
- The marketplace has real races. Two agents can accept different offers on one package at once
  (FR-053: one acceptance wins). An offer can be withdrawn, expire, or be revised while the agent
  accepts another, the round closes, or a backup is promoted; timers in the worker race users in
  the api.
- Some work outlives its process: a job whose worker dies, a request that crashes mid-change, a
  delivery whose send hangs. Outside updates (the CRM's copy of a listing) can arrive out of order,
  and timestamps can tie or disagree between machines.
- Postgres runs at its default isolation, READ COMMITTED. A Sprint 9 review found races that the
  first design (version checks plus unique indexes, R14) let through (T365, T376).

## Decision
We will use three layers, each the cheapest tool that is correct for its kind of race, plus one
ordering rule for what we send outside:
1. **Optimistic version checks for stale screens.** `ListingPackage`, `Deal`, and offer decisions
   name the `version` they were based on; `UPDATE … WHERE id AND version` changes zero rows on a
   mismatch and the service throws `ConflictError` (409), so the user reloads. No lock is held
   while a person types.
2. **A package lock where competing actions must take turns.** `packages.lock(id)`
   (`SELECT … FOR UPDATE` on the package row) is taken before any other write by accept, counter,
   and decline-all; offer create, revise, withdraw, and the answer to a counter; round close and
   offer expiry; backup promotion, reconfirmation, and its timeout; publish; and photo changes
   (upload request, attach, remove). The timers and the promotion read their rows again after the
   lock (T376). All of them lock the same one row first, so they share one lock order.
   Package withdraw, reopen, and extend-deadline take no explicit lock and are still safe: their
   package UPDATE waits for any change holding the row, and the statement that declines open
   offers runs after it under READ COMMITTED, so it sees an offer committed meanwhile. A
   concurrent backup promotion bumps the package version, so a stale withdraw or reopen fails its
   version check. The agent's package edit and the deal's milestone and fall-through steps also
   rely on the version check alone.
3. **Leases with fencing for work that outlives its owner.** Jobs hold a 60 s lease renewed every
   20 s, and only the holder can complete or fail them (T378, ADR 0010); idempotency claims hold a
   30 s lease with a token and commit only while it holds (T367, ADR 0011); a delivery's outcome is
   recorded only while the row is still on that attempt, so a run the relay re-queued after two
   minutes records nothing (T379, ADR 0009).
4. **A database sequence, not timestamps, orders outside updates.** Each `OutboxEvent` gets a
   `sequence` assigned while the change holds its package row; the sandbox CRM keeps an update
   only if its number is higher (409 `STALE` otherwise) (T380).

Unique indexes stay as the last line: one active deal per package, one live offer per investor and
round, one package per address hash (T383 maps a lost race to a clean 409).

## Alternatives considered
- **Optimistic checks only (the R14 design):** a version check cannot order two different rows. A
  withdrawn backup could still be promoted, and an investor's revision failed a concurrent accept
  with 409 (T365, T376, T390). Retrying conflicts would not fix a decision made on a stale read.
- **SERIALIZABLE isolation everywhere:** every transaction, timers and the import included, would
  need a retry loop, and failures would surface far from the rule they protect.
- **A distributed lock service (Redis Redlock, ZooKeeper):** a second system on a 2 GB machine,
  whose lock is outside the database transaction and still needs fencing tokens; the row to lock
  is already in Postgres.

## Consequences
- **Positive:** the races found in review have Postgres tests. The lock tests force the
  interleaving on every run: a third connection holds the package lock while two changes queue
  behind it in a fixed order.
- **Positive:** a job hit by a version conflict is retried instead of failing for good (T376).
- **Negative:** all locked writes on one package are serialized. Fine for a listing with a handful
  of investors; a hot listing would queue offers behind each other.
- **Negative:** four mechanisms to learn. A new workflow must remember to take the package lock
  first; only review and the race tests enforce it, and no test measures deadlocks.
- **Revisit when:** one package draws enough concurrent offers that lock waits show up in request
  latency, or a change needs to lock two packages at once.

## Evidence
- [IListingPackageRepository.ts](../../packages/core/src/repositories/listing-package/IListingPackageRepository.ts)
  (the lock's contract),
  [package-lock-races.int.test.ts](../../packages/core/test/package-lock-races.int.test.ts),
  [promoted-backup-race.int.test.ts](../../packages/core/test/promoted-backup-race.int.test.ts),
  [unique-races.int.test.ts](../../packages/core/test/unique-races.int.test.ts),
  [decisions.int.test.ts](../../packages/core/test/decisions.int.test.ts)
- Spec documents (available on request): research R14, R6 (job lease); tasks T365, T367, T376,
  T378, T379, T380, T383, T390; constitution VIII (unique constraint, not check-then-insert)
