# 0008. Resolve concurrency in three layers

## Status
Accepted, 2026-11-01. Deciders: Tarun (owner), Claude.

## Context
- The marketplace has real races. Two agents can accept different offers on one package at once
  (FR-053: one acceptance wins). An offer can be withdrawn, expire, or be revised while the agent
  accepts another, the round closes, or a backup is promoted. Timers run in the worker while users
  act in the api.
- Some work outlives the process that started it: a job whose worker dies, an HTTP request that
  crashes mid-change, a delivery whose send hangs.
- Outside updates (the CRM's copy of a listing) can arrive out of order. Two changes can share a
  millisecond timestamp, and machines' clocks can disagree.
- Postgres runs at its default isolation, read committed (study note 14). A Sprint 9 review found
  races that the first design (version checks plus unique indexes, R14) let through (T365, T376).

## Decision
We will use three layers, each the cheapest tool that is correct for its kind of race, plus one
ordering rule for what we send outside:
1. **Optimistic version checks for stale screens.** `ListingPackage`, `Deal`, and offer decisions
   name the `version` they were based on; `UPDATE … WHERE id AND version` changes zero rows on a
   mismatch and the service throws `ConflictError` (409), so the user reloads. No lock is held
   while a person types.
2. **A pessimistic lock on the package row where competing actions must take turns.**
   `packages.lock(id)` (`SELECT … FOR UPDATE`) is taken before any write by every change that can
   end or reshape a package's round: accept, counter, and decline-all; offer create, revise,
   withdraw, and answer to a counter; round close and offer expiry; backup promotion,
   reconfirmation, and its timeout; publish and photo removal. The timers and the promotion read
   their rows again after the lock (T376). Every such change locks the same one row before it
   writes anything else, so they share one lock order. Package-level actions without the lock
   (withdraw, reopen, extend) still update that row with a version check, so they queue behind it.
3. **Leases with fencing for work that outlives its owner.** Jobs hold a 60 s lease renewed every
   20 s and only the holder can complete or fail them (T378); idempotency claims hold a 30 s lease
   with a token and commit only while it holds (T367, ADR 0011); deliveries are fenced by their
   attempt number, so a run the 2-minute sweep superseded records nothing (T379).
4. **A database sequence, not timestamps, orders outside updates.** Each `OutboxEvent` gets a
   `sequence` assigned while the change holds its package row; the CRM keeps an update only if
   its number is higher (409 STALE otherwise) (T380).

Unique indexes stay as the last line: one active deal per package (study note 44), one live offer
per investor and round, one package per address hash (T383 maps a lost race to a clean 409).

## Alternatives considered
- **Optimistic checks only (the R14 design):** a version check cannot order two different rows. A
  withdrawn backup could still be promoted, and an investor's revision failed a concurrent accept
  with 409 (T365, T376, T390). Retrying conflicts would not fix a decision made on a stale read.
- **SERIALIZABLE isolation everywhere:** every transaction would need a retry loop for
  serialization failures, including timers and the import, and the failures would surface far
  from the rule they protect. One explicit lock on the row that owns the rule is easier to read.
- **A distributed lock service (Redis Redlock, ZooKeeper):** a second system on a 2 GB machine,
  and its lock is not part of the database transaction, so it still needs fencing tokens. The row
  we need to lock is already in Postgres.

## Consequences
- **Positive:** every race found in review has a test that forces the interleaving on every run: a
  third connection holds the package lock while two changes queue behind it in a fixed order.
- **Positive:** a job hit by a version conflict is retried instead of failing for good (T376).
- **Negative:** all writes on one package are serialized. Fine for a listing with a handful of
  investors; a hot listing would queue offers behind each other.
- **Negative:** four mechanisms to learn. A new workflow must remember to take the package lock
  first; nothing but review and the race tests enforce it.
- **Negative:** no test measures deadlocks; the single-lock-first rule is the only guard.
- **Revisit when:** one package draws enough concurrent offers that lock waits show up in request
  latency, or a change needs to lock two packages at once.

## Evidence
- [research.md R14](../../specs/001-investor-platform-prototype/research.md), R6 (job lease)
- [tasks.md](../../specs/001-investor-platform-prototype/tasks.md) T365, T367, T376, T378, T379,
  T380, T383, T390
- Constitution VIII (unique constraint, not check-then-insert)
- Study notes 13 (version), 14 (read committed), 44 (one acceptance wins), 45
- [package-lock-races.int.test.ts](../../packages/core/test/package-lock-races.int.test.ts),
  [promoted-backup-race.int.test.ts](../../packages/core/test/promoted-backup-race.int.test.ts),
  [unique-races.int.test.ts](../../packages/core/test/unique-races.int.test.ts),
  [decisions.int.test.ts](../../packages/core/test/decisions.int.test.ts),
  [IListingPackageRepository.ts](../../packages/core/src/repositories/listing-package/IListingPackageRepository.ts)
