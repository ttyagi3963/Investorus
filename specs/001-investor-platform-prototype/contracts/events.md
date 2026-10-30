# Contract: Outbox Events and Delivery Semantics

Constitution XVIII. Every event is written in the **same database transaction** as the state
change that caused it. Payload schemas are Zod discriminated unions in
`@clever/contracts/events`, keyed on `type`.

## Envelope

```text
{ id: cuid, type: EventType, aggregateType, aggregateId, occurredAt, version: 1, payload }
```

## Event types → delivery targets

| Event type | Emitted when | Targets | Payload (beyond IDs) |
| --- | --- | --- | --- |
| `package.published` | DRAFT → ACCEPTING_OFFERS | CRM | `status, round, offerDeadline, city, zip` |
| `package.matched` | a `Match` row is created (once per investor per package per round, however many boxes match) | trigger `PUBLISH` or `PACKAGE_EDIT`: EMAIL, SMS (if the investor has a phone), IN_APP. Trigger `BUY_BOX_CHANGE`: IN_APP only (the email goes in the daily digest) | `investorId, round, trigger, buyBoxNames[], city, zip, propertyType, priceMax` |
| `package.changed` | material edit after publish | EMAIL, IN_APP (investors already notified, and only if a changed field is checked by one of their matched boxes) | `changedFields[]` |
| `investor.match_digest` | `SEND_MATCH_DIGESTS` daily job, per investor with undigested BUY_BOX_CHANGE matches | EMAIL | `investorId, matches[]` (`packageId, city, zip, propertyType, priceMax, buyBoxNames[]`) |
| `package.status_changed` | any PackageStatus transition | CRM | `from, to, round` |
| `offer.submitted` / `offer.revised` | offer created or revised | IN_APP (agent), CRM | `offerId, investorId, price, paymentType` |
| `offer.countered` | agent counter | EMAIL, IN_APP (that investor only) | `offerId` |
| `decision.accepted` | an offer is accepted | EMAIL + IN_APP (winner), EMAIL + IN_APP (each backup: "you are now a backup"), CRM | `offerId, backupOfferIds[]` |
| `decision.declined_all` | decline all | EMAIL, IN_APP (every offering investor), CRM | |
| `deal.milestone` | deal milestone change | IN_APP (buyer), CRM | `dealId, milestone` |
| `deal.fell_through` | fall-through | EMAIL + IN_APP (former buyer), CRM | `dealId, reason` |
| `deal.backup_promoted` | backup promoted | EMAIL + SMS + IN_APP (that investor), CRM | `dealId, reconfirmBy` |
| `package.withdrawn` / `package.closed_to_offers` | withdrawal, or acceptance with others declined | EMAIL, IN_APP (matched investors with no offer) | |

### PII rule (FR-032)
- Payloads carry **no** seller name, email, phone, or street line.
- The CRM provider alone enriches its request with seller contact details. It loads them through
  `ISellerContactReader` at send time, and the access is audited. Contact data is never stored in
  the outbox.
- Email and SMS recipients are resolved from `investorId` at send time.
- A contract test asserts that the event schemas contain no PII keys.

## Delivery semantics

1. **Relay** (worker, every 1 s): claims unrelayed events with `SKIP LOCKED` and inserts one
   `Delivery` per (target, recipient). Duplicates are blocked by the unique index, and the
   event is then marked relayed. Each delivery is enqueued in BullMQ with `jobId = delivery.id`.
2. **Send**: a provider call with `Idempotency-Key: delivery.id`.
   - 2xx → `SENT`.
   - 5xx, timeout (5 s), or a malformed response → `RETRYING`.
   - `409 STALE` from the CRM → `SENT` (superseded; see Ordering).
   - Other 4xx (except 408 and 429) → `NEEDS_ATTENTION` immediately (bad data is not retried
     blindly).
3. **Backoff**: base 2 s, factor 2, capped at 60 s, jitter ±20%, 10 attempts, about 5 minutes in total
   (from `ConfigEntry["deliveryRetry"]`).
   After the last attempt, the job moves to the DLQ and the delivery to `NEEDS_ATTENTION`, and
   the worker error translator logs and reports it (VII).
4. **Manual retry**: `POST /ops/deliveries/:id/retry` (or `/ops/deliveries/retry-all` for every
   needs-attention delivery) sets the delivery back to `PENDING` with
   `attempts = 0` and re-enqueues it.
5. **Ordering**: CRM updates carry `occurredAt`. The CRM rejects any update older than the one
   it stores with `409 STALE`, and the provider records that delivery as `SENT` (superseded) and
   does not retry it. A delayed retry therefore never overwrites a newer status, and the CRM
   always converges on the latest platform status (SC-012). This uses open-source BullMQ only;
   per-group ordering is a BullMQ Pro feature and is deliberately avoided. In production, the
   same "last write wins by event time" check goes in the HubSpot adapter, using a stored
   `lastSyncedAt` property.
6. **Guarantee**: at-least-once sending plus receiver deduplication by idempotency key means
   effectively-once (SC-007). Nothing is lost while Redis or a provider is down: events wait in
   PostgreSQL until the relay can enqueue them.
