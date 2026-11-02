# 0010. Run time-based rules as durable jobs in Postgres

## Status
Accepted, 2026-11-01. Deciders: Tarun (owner), Claude.

## Context
- Several business rules fire on time, not on a request: an offer round closes at its deadline
  (72 hours by default), each offer expires at its own expiry, a promoted backup must reconfirm
  within `reconfirmHours` (48), and investors get a daily match digest.
- FR-059 and FR-072: deadlines must fire even if the system restarts, and a crash must not lose
  or repeat their effects.
- Constitution VIII: long-running and multi-step work is tracked as durable job records in the
  database, with duplicate in-progress jobs prevented by a unique constraint, not check-then-insert.
  XVIII.3 keeps internal workflow state in Postgres, not in the delivery queue.
- Deadlines move: an agent can extend a round, an investor can revise an offer's expiry.

## Decision
We will store every timer as a `Job` row with a future `runAt`, written in the same transaction as
the change that sets the time, and make every handler safe to run late, twice, or for nothing:
1. **Schedule with the change.** Publish, reopen, and an extended deadline write
   `CLOSE_OFFER_ROUND`; every offer revision writes `EXPIRE_OFFER`; a promotion writes
   `EXPIRE_RECONFIRMATION`; `SEND_MATCH_DIGESTS` runs at `matchDigest.hourUtc` and schedules the
   next day. The dedupe key names the subject and the time (`CLOSE_OFFER_ROUND:{package}:{round}:
   {deadline}`), and a partial unique index on `(type, dedupeKey)` allows one live job per key.
2. **Claim safely.** The worker polls every second and claims due jobs with
   `FOR UPDATE SKIP LOCKED`, by the injected clock. A claim is a 60 s lease renewed every 20 s while
   the handler runs; only the holder can complete or fail the job. An unrenewed lease is
   reclaimed, and the lost run counts as a try, so a job that keeps killing its worker ends FAILED
   (T378).
3. **Check before acting.** Each deadline handler re-reads its rows after the package lock (ADR 0008) and
   does nothing if the deadline changed, the revision is no longer the latest, or the deal is no
   longer pending. Extending a deadline never has to find and cancel the old job.
4. **Claim each effect once.** A one-time effect (the agent's notice and the round's audit entry)
   claims a key in `EffectMarker` in the same transaction, so a re-run after a crash between
   commit and "done" finds it and stops (T368). The digest claims its matches with one
   `UPDATE … RETURNING`, so two runs at once send each match once (T379).
5. **Keep the trace.** A job stores the queuing request's trace ID and runs inside it (ADR 0014).

## Alternatives considered
- **In-process timers (`setTimeout`):** lost on every restart or deploy, which FR-059 forbids, and
  invisible to operations.
- **A cron sweep for due rows:** still needs durable state to know what is due and what already
  ran, and adds a scheduler process; a `runAt` row per rule is that state, already claimable.
- **BullMQ delayed jobs in Redis:** Redis is not the system of record for workflow state (VIII,
  XVIII.3), it runs here without persistence (ADR 0012), and a timer could not be written in the
  same transaction as the deadline it serves (R6).
- **pg-boss or Graphile Worker:** good libraries, but the constitution wants a generic envelope the
  team owns, and the table is small (R6).

## Consequences
- **Positive:** the deal-timer test restarts the client and the 48-hour job still runs once when
  the clock reaches it; the job-replay test kills the worker after the round-close commits and the
  agent is told, and the round audited, exactly once.
- **Positive:** tests move time with the clock instead of sleeping; several worker replicas are
  already safe (`SKIP LOCKED`, renewed lease, unique constraints).
- **Negative:** up to a second of lateness per poll, and a stale job still runs once (cheap).
- **Negative:** leases compare database times. A non-UTC database session broke them: under
  Asia/Tokyo a job queued without `runAt` waited 9 hours. Every Prisma session is now pinned to
  UTC (T390); any new client must keep that pin.
- **Negative:** the idempotency-key purge runs on the job loop's tick, not as a durable recurring
  job (T390).
- **Revisit when:** many deadlines fall due together and drain too slowly (partition the queue or
  batch the closes), or workflows grow multi-step enough to want a workflow engine (Temporal).

## Evidence
- [research.md R6, R24](../../specs/001-investor-platform-prototype/research.md); constitution
  VIII, XVIII.3
- [tasks.md](../../specs/001-investor-platform-prototype/tasks.md) T305–T307, T311, T340, T368,
  T376, T378, T379, T390; study note 43
- [job-runner.ts](../../apps/worker/src/job-runner.ts),
  [PrismaJobRepositoryImpl.ts](../../packages/core/src/repositories/job/PrismaJobRepositoryImpl.ts)
- [jobs.int.test.ts](../../packages/core/test/jobs.int.test.ts),
  [job-replay.int.test.ts](../../packages/core/test/job-replay.int.test.ts),
  [deal-timer.int.test.ts](../../packages/core/test/deal-timer.int.test.ts),
  [match-digest-race.int.test.ts](../../packages/core/test/match-digest-race.int.test.ts)
