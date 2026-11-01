# Contract: Outbox Events and Delivery Semantics

Constitution XVIII. Every event is written in the **same database transaction** as the state
change that caused it. Payload schemas are a Zod discriminated union in
`@clever/contracts/events`, keyed on `type`, checked when the event is written and again when the
worker reads it. Built in Sprint 6 (T336–T341).

## Envelope (the `OutboxEvent` table)

```text
{ id: cuid, type, aggregateType: "ListingPackage" | "Investor", aggregateId, payload,
  occurredAt, relayedAt?, correlationId? }
```

`correlationId` is the trace ID of the request or job that wrote the event, so its deliveries can
be followed in the logs. An event is append-only; the relay may only set `relayedAt`, once.

## In-app notices stay in the change (decision, Sprint 6)

In-app notices are internal state, so they are written in the same transaction as the change
(XVIII.3), not delivered through the outbox. Outbox events go only to outside targets: **EMAIL**,
**SMS**, and the **CRM**.

## Event types → delivery targets

| Event type | Written when | Targets | Payload (beyond IDs) |
| --- | --- | --- | --- |
| `package.status_changed` | Any package status change, whichever workflow makes it. Deal milestones move the package status, so they arrive here too. | CRM | `from`, `crm` (the snapshot below) |
| `offer.submitted` / `offer.withdrawn` | An investor makes or withdraws an offer (the CRM's offer count changes). Both lock the package row first, so concurrent offers each count the other | CRM | `offerId, investorId, crm` |
| `investor.notice` | An investor notice that matters outside the app (below) | EMAIL, and SMS when urgent and the investor has a phone | `investorId, noticeType, title, body, channels[]` |
| `investor.match_digest` | The daily SEND_MATCH_DIGESTS run, per investor with buy-box-change matches to packages still taking offers | EMAIL | `investorId, digestDate, matches[]` (`packageId, city, state, zip, propertyType, priceMin, priceMax`) |

**The CRM snapshot** (`crm`) is taken in the change: `{ status, round, offerCount, acceptedPrice }`.
The CRM gets the newest snapshot by event time.

**Which notices leave the app** (`packages/core/src/outbox/notify-investor.ts`):

| Notice | Channels |
| --- | --- |
| A package matched (publish, edit, or reopen) | EMAIL, SMS |
| A backup offer promoted | EMAIL, SMS |
| A matched package changed, withdrawn, or closed to offers; an offer countered, accepted, made a backup, or declined; a deal fell through | EMAIL |
| A buy-box-change match | none at once: it goes in the daily digest (FR-023) |
| Everything else (agents' notices, deadlines, milestones, expiries) | none (in the app only) |

The email or text reuses the notice's in-app title and body, so every channel says the same thing.

### PII rule (FR-032)

- Payloads carry **no** seller name, email, phone, or street line. A contract test checks that no
  event schema has such a field.
- The CRM target alone adds the seller's contact, read at send time; the read is audited
  (`PII_ACCESSED`, actor SYSTEM). Contact data is never stored in the outbox.
- An investor's email and phone are read at send time from `investorId`.

## Delivery semantics

1. **Relay** (worker, a second after each tick): claims unrelayed events with `SKIP LOCKED`,
   creates one `Delivery` per (target, recipient) (no SMS for an investor without a phone), and
   marks the event relayed, in one transaction. Duplicates are blocked by the unique index. An
   event whose payload no longer parses is marked relayed with no deliveries and logged.
2. **Queueing**: the relay also claims every PENDING delivery not yet queued and adds it to the
   BullMQ `deliveries` queue with `jobId = delivery.id`, inside the transaction that holds the rows.
   Redis is reached with a fail-fast connection: if it is down, nothing is marked queued and the
   next tick tries again.
3. **Recovery**: every tick also puts back any delivery whose job may be lost, because Redis keeps
   no data across a restart, or because the worker died mid-send: one queued but never started,
   one overdue for its retry, or one left sending, for longer than a 2-minute lease. Its attempts
   are kept, and the idempotency key makes a resend safe. **The api never
   touches Redis**: an operations retry resets the delivery in PostgreSQL and the relay re-queues
   it. Redis holds no state the platform needs; PostgreSQL does.
4. **Send**: the dispatcher starts an attempt and reads what it needs in one transaction, sends
   outside any transaction with `Idempotency-Key: delivery.id`, and records the outcome in a second:
   - 2xx → `SENT`.
   - `409 STALE` from the CRM → `SENT` (superseded; see Ordering).
   - 5xx, a timeout (5 s), 408, 429, or a malformed answer → `RETRYING`, with the next try's time.
   - Any other 4xx, or an investor who cannot be reached → `NEEDS_ATTENTION` at once (bad data is
     not retried blindly).
   - A duplicate or late job finds the delivery already sent or set aside and does nothing.
5. **Backoff** (`ConfigEntry["deliveryRetry"]`, read at worker startup): base 2 s, factor 2,
   capped at 60 s, jitter ±20%, 10 attempts, about 5 minutes in total. The dispatcher counts
   attempts in PostgreSQL. After the last one, the delivery goes to `NEEDS_ATTENTION` and is also
   recorded on the `deliveries-dlq` queue, which keeps a day of entries (PostgreSQL keeps the record).
6. **Manual retry**: `POST /ops/deliveries/:id/retry`, or `/ops/deliveries/retry-all` with an
   optional target, sets each delivery that needs attention back to `PENDING` with `attempts = 0`,
   off the queue. Each retry is audited (`DELIVERY_RETRIED`).
7. **Ordering**: CRM updates carry the event's `occurredAt`. The CRM refuses an update older than
   the one it stores with `409 STALE`, which counts as sent and is not retried. A delayed retry
   therefore never overwrites a newer status, and the CRM converges on the latest platform status
   (SC-012). This uses open-source BullMQ only; per-group ordering is a BullMQ Pro feature and is
   deliberately avoided. In production, the same "last write wins by event time" check goes in the
   HubSpot adapter, using a stored `lastSyncedAt` property.
8. **Guarantee**: at-least-once sending plus the receiver's deduplication by idempotency key means
   effectively-once delivery (SC-007). Nothing is lost while Redis or a provider is down: events and
   deliveries wait in PostgreSQL until the relay can queue them. The outage-and-recovery integration
   test (`packages/core/test/outage-recovery.int.test.ts`) checks this on a real Postgres and Redis.
