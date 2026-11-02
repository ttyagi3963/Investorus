# 0009. Send every outside call through a transactional outbox

## Status
Accepted, 2026-11-01. Deciders: Tarun (owner), Claude.

## Context
- Three outside services must hear about changes: the CRM's copy of each listing's status, and
  email and SMS to investors and agents. In the demo they are the sandbox stand-ins, which can be
  switched to `down`, `slow`, or `garbage` (T338, ADR 0015).
- SC-007: during an outage of any outside service, 0 agent or investor actions may fail. SC-012:
  after the outage, 100% of listings must show the same status in the platform and the CRM.
- Writing the database and calling a vendor separately is a dual write: a crash between them loses
  the message, or sends one for a change that rolled back.
- Constitution XVIII requires the change and its event in one transaction, delivered by Redis +
  BullMQ workers with backoff and a dead-letter queue. In-app notices are internal state and stay
  in the change itself (XVIII.3).

## Decision
We will write every outside call as an `OutboxEvent` row in the same transaction as the change
(the unit of work, ADR 0007), and deliver it from the worker:
1. **Write.** Services write events with `writeEvent`, which checks the event schema and stores
   the trace ID; package status events are written by the repository decorator (ADR 0007), so no
   service can forget one. Event schemas carry no seller PII; the CRM target reads the seller's
   contact at send time and audits the read (ADR 0013).
2. **Relay.** A second after each pass, the worker turns new events into one `Delivery` per target
   and recipient, claims pending deliveries (`FOR UPDATE SKIP LOCKED`), and queues them on BullMQ
   only after that claim commits, with `jobId` = the delivery ID, so a delivery is never queued
   twice (T379). Each pass also re-queues any delivery whose job may be lost, including one stuck
   sending for more than two minutes.
3. **Send.** Every provider call carries `Idempotency-Key: <delivery.id>`, which the receiver
   dedupes, and a 5 s timeout. A delivery's outcome is recorded only while the row is still on
   that attempt, so a superseded run records nothing (T379, ADR 0008).
4. **Retry, then set aside.** Temporary failures back off by the `deliveryRetry` config, seeded as
   2 s doubling, capped at 60 s, ±20% jitter, 10 attempts (about five minutes). After the last
   attempt, or on a refusal (a 4xx other than 408 or 429), the delivery becomes `NEEDS_ATTENTION`
   with a scrubbed error and goes to the `deliveries-dlq` queue. Operations retry one or all from
   the console, audited.
5. **The api never touches Redis.** An operations retry resets the row in Postgres; the relay
   picks it up (ADR 0012).

## Alternatives considered
- **Call the provider inside the request:** a CRM outage would fail the agent's publish, breaking
  SC-007, and a rollback after the call would leave the CRM ahead of the platform.
- **Queue without an outbox (write the row, then enqueue):** the dual write again. A crash or a
  Redis outage between the commit and the enqueue loses the message with no record of it.
- **Change data capture (Debezium):** the same guarantee from the write-ahead log, but far too
  heavy for the 2 GB machine (R7).
- **Poll deliveries straight from Postgres, no BullMQ:** simpler, but contradicts XVIII.2 (R7);
  ADR 0012 sets where the Redis line sits.

## Consequences
- **Positive:** the outage-recovery test publishes and accepts with the CRM down and messaging
  returning garbage; both succeed, deliveries retry and are set aside, and after one retry every
  delivery arrives exactly once and the CRM matches the platform.
- **Positive:** an effectively-once effect on top of at-least-once delivery, and a queryable record
  of every delivery that the operations timeline reads (ADR 0014).
- **Negative:** up to a second of relay delay from polling; LISTEN/NOTIFY or CDC would lower it.
- **Negative:** the receiver must dedupe on the key; a real vendor without idempotency support
  would need a sent-log on our side.
- **Negative:** a sandbox outage switch is still a direct call followed by its audit write, so a
  failed audit commit leaves one unaudited switch; closing that gap needs the outbox too (T381).
- **Revisit when:** delivery volume makes the 1 s poll or a single relay the bottleneck, or a
  vendor offers no idempotency key.

## Evidence
- [write-event.ts](../../packages/core/src/outbox/write-event.ts),
  [OutboxRelay.ts](../../packages/core/src/outbox/OutboxRelay.ts),
  [DeliveryDispatcher.ts](../../packages/core/src/outbox/DeliveryDispatcher.ts),
  [retry-delay.ts](../../packages/core/src/outbox/retry-delay.ts),
  [relay-loop.ts](../../apps/worker/src/relay-loop.ts)
- [outage-recovery.int.test.ts](../../packages/core/test/outage-recovery.int.test.ts),
  [delivery-once.int.test.ts](../../packages/core/test/delivery-once.int.test.ts),
  [events.pii.test.ts](../../packages/contracts/src/events/events.pii.test.ts)
- Spec documents (available on request): research R7; contracts/events.md; spec SC-007, SC-012;
  tasks T336–T341, T379, T380, T381, T382; constitution XVIII and the VIII scope note
