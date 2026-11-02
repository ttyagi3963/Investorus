# 0012. Use Postgres as the backbone, and Redis only for delivery

## Status
Accepted, 2026-11-01. Deciders: Tarun (owner), Claude.
Reverses the earlier "no Redis yet" decision (study note 24, 2026-10-31) for outbound delivery.

## Context
- The whole stack runs from one `docker compose up --build` on a 2 GB machine. Measured on a cold
  2 GB EC2 t3.small: 1,695 MiB peak for the whole machine, about 210 MiB spare (study note 57).
  Every container counts.
- The constitution names Redis twice: as the store for idempotency keys (XX.2) and, with BullMQ,
  as the bus for outbound delivery (XVIII.2). It keeps internal workflow state, entity
  transitions, and audit in Postgres (VIII, XVIII.3).
- Sprint 0 scaffolded Redis everywhere ahead of need. On 2026-10-31 the owner removed it ("we
  don't need redis at this point, we're not there"): the service, the libraries, `REDIS_URL`, and
  the CI image. Sprint 2 kept it out: the Postgres job table was enough at that size.
- Sprint 6 brought CRM, email, and SMS delivery, the first work that talks to outside services
  under retries and outages.

## Decision
We will keep every piece of state that must be correct in Postgres, transactional with the change
that causes it, and use Redis only as the worker's delivery queue:
- **In Postgres:** jobs and timers (ADR 0010), the outbox and every delivery's status (ADR 0009),
  idempotency keys (ADR 0011), the append-only audit log, effect markers, and config.
- **In Redis + BullMQ (owner, Sprint 6, "as the constitution says"):** the queue of delivery
  jobs, their backoff timers, and the dead-letter queue. Redis 7 with `--maxmemory 64mb`,
  `noeviction`, and no persistence.
- **Only the worker connects to Redis.** The api writes rows; an operations retry resets a
  delivery in Postgres and the relay queues it.
- **Redis is disposable.** Each BullMQ job is keyed by its delivery ID, and the relay re-queues
  any delivery whose job may be lost, so a Redis restart without its data loses nothing.

## Alternatives considered
- **Redis for jobs and idempotency too (the constitution's literal reading):** a timer or a key in
  Redis cannot commit in the same transaction as the change it belongs to, and without
  persistence it would not survive a restart; XX.2's Postgres fallback became the primary, a
  recorded deviation (plan.md).
- **Kafka or another log broker:** replayable streams at a scale this prototype does not have,
  for a broker that the 2 GB machine cannot spare memory for. CDC on the same idea was rejected
  as too heavy (R7).
- **No Redis at all; poll deliveries from Postgres:** fewer services, and it would work at demo
  volume, but it contradicts XVIII.2 and keeps vendor retry load on the primary database, which
  XVIII exists to avoid (R7).

## Consequences
- **Positive:** one source of truth. Every question an operator asks (what was sent, what failed,
  why) is answered from Postgres, so losing Redis costs a delay, not data.
- **Positive:** Redis came in when a feature needed it, in one PR with its tests, health check,
  and memory settings, instead of idling from Sprint 0.
- **Negative:** two stores to run and to test: the delivery integration tests start a Redis
  container as well as Postgres.
- **Negative:** the primary database carries the job, outbox, and idempotency traffic as well as
  the domain writes; there is no read replica (a Prototype Shortcut).
- **Negative:** Redis has no persistence or HA here; production would use managed Redis with AOF.
- **Revisit when:** job or delivery volume makes Postgres polling the bottleneck, or several
  services need to consume the same events (then a log broker earns its cost).

## Evidence
- Constitution VIII, XVIII.2–3, XX.2;
  [research.md R6, R7, R19](../../specs/001-investor-platform-prototype/research.md)
- [plan.md](../../specs/001-investor-platform-prototype/plan.md) Technical Context (Redis 7),
  Complexity Tracking (XX.2), Prototype Shortcuts (Redis without persistence or HA)
- [tasks.md](../../specs/001-investor-platform-prototype/tasks.md) Sprint 2 and Sprint 6
  decisions, T082, T339, T379
- Study notes 24 (no Redis yet), 52 (outbox), 57 (2 GB measurements)
- [compose.yaml](../../compose.yaml),
  [BullMqDeliveryQueueImpl.ts](../../packages/core/src/providers/delivery-queue/BullMqDeliveryQueueImpl.ts)
