# Data Model: Investor Platform Prototype

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

## Conventions (Constitution IV and V)

- **IDs**: CUID primary keys.
- **Timestamps**: `createdAt` and `updatedAt` on every mutable entity. Append-only entities have
  `createdAt` only.
- **Relationships**: parent → child relationships use `onDelete: Cascade`, unless the child is
  audit or history data, which is never deleted. Many-to-many relationships use explicit join
  tables.
- **Concurrency**: `version Int` for optimistic concurrency on entities with contended updates.
- **Encryption**: 🔒 marks fields encrypted at rest (AES-256-GCM, stored as text with a key
  version prefix). They are decrypted only in repository mappers, and never in an investor-facing
  view before acceptance.
- **Validation**: all enums are `as const` arrays in `@clever/contracts`, with TypeScript unions
  derived from them. Every rule listed below is enforced by a Zod schema in the service (VI). DB
  constraints are noted where the database also enforces it.
- **Criterion Registry (XIX)**: buy box criteria are typed columns, not stored rules. Each
  criterion key is declared once in `CRITERION_KEYS` and implemented in every layer as a record
  over that key list (see [Criterion Registry](#criterion-registry-xix) below).
- **Versions for audit**: `BuyBoxVersion` and `ListingVersion` are append-only snapshots. A
  snapshot is written from the typed row in the same transaction as the change and is parsed
  with the registry's Zod schema on read. It is an audit record, never a source of truth.
  `BuyBoxVersion`, `ListingVersion`, and `MatchEvaluation` reject UPDATE and DELETE with a DB
  trigger, like `AuditLog` (except `ListingVersion.matchedCount` and `topExclusionReasons`,
  which are set once when matching completes).

---

## Identity and roles

### User
| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | |
| username | string | unique, 3–40 chars, lowercase |
| passwordHash | string | bcrypt |
| role | `AGENT` \| `INVESTOR` \| `OPS` | |
| displayName | string | 1–80 chars |
| agentId | cuid? | set if role = AGENT (1:1 → Agent) |
| investorId | cuid? | set if role = INVESTOR (1:1 → Investor) |
| active | boolean | default true |

DB CHECK: an AGENT has `agentId` set; an INVESTOR has `investorId` set; OPS has neither.

### Agent
| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | |
| name | string | |
| email | string | valid email |
| brokerage | string | |
| brandId | string | references Brand |

### Brand (Constitution X and XVI)
| Field | Type | Rules |
| --- | --- | --- |
| id | string | seeded: `clever`, `brand-beta`; synthetic `brand-alpha` / `brand-gamma` in tests |
| name | string | display name from the content layer |
| themeTokens | JSONB | `{ primitives, semantic }` per [contracts/design-tokens.md](./contracts/design-tokens.md); rejected unless every required semantic token is mapped and all contrast pairs meet WCAG AA (FR-091, FR-095) |
| content | JSONB | display name, logo path, legal footer, copy |
| tokenVersion | int | +1 on each token change; used for cache-busting the rendered CSS variables |

---

## Sellers, properties, packages

### Seller
| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | |
| agentId | cuid → Agent | the representing agent |
| fullName 🔒 | string | required |
| email 🔒 | string? | valid email if present |
| phone 🔒 | string? | E.164 if present; email or phone is required |

### Property
| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | |
| streetLine 🔒 | string | required |
| addressHash | string | HMAC of the normalized full address; used for the duplicate-listing warning (FR-013) without decrypting |
| city | string | |
| state | string | 2-letter |
| zip | string | 5 digits; must exist in the geo reference set (`IGeoProvider`) |
| neighborhood | string? | |
| lat / lng | decimal? | the ZIP centroid from `IGeoProvider.lookup`, set when the ZIP is saved; agents never type it |
| propertyType | `SINGLE_FAMILY` \| `CONDO` \| `TOWNHOME` \| `MULTI_FAMILY` \| `MANUFACTURED` \| `LAND` | |
| beds | int? | 0–20; required at publish unless LAND |
| baths | decimal(3,1)? | 0–20, in 0.5 steps; required at publish unless LAND |
| sqft | int? | living area, 100–20,000 (0 is rejected); required at publish unless LAND |
| lotSqft | int? | > 0; required at publish for LAND |
| units | int? | 2–500; required at publish for MULTI_FAMILY, null otherwise |
| yearBuilt | int? | 1800 to the current year; required at publish unless LAND |
| condition | `EXCELLENT` \| `GOOD` \| `FAIR` \| `POOR` \| `DISTRESSED` (nullable) | required at publish unless LAND |
| repairEstimate | int (USD)? | ≥ 0 |

Fields are nullable so a DRAFT can be saved incomplete. Range rules are DB CHECKs; the
type-dependent "required at publish" rules are enforced by the publish schema (FR-012).

Index: `(zip)`, `(addressHash)`.

### ListingPackage
| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | |
| agentId | cuid → Agent | owner; agents see only their own |
| sellerId | cuid → Seller | |
| propertyId | cuid → Property | |
| brandId | string → Brand | metadata only, never a branch condition (XVI) |
| status | PackageStatus | see the state machine below |
| round | int | starts at 1; +1 each time the package is reopened |
| priceExpectationMin / Max | int (USD) | min ≤ max, both > 0; shown to matched investors (the price buy boxes match on) |
| closingWindowStart / End | date | start ≤ end; start ≥ today at publish |
| currentlyListed | boolean? | required at publish; matched against `BuyBox.acceptsListed` |
| eligiblePrograms | `OFFER_PROGRAMS` (array) | at least one at publish: `CASH_OFFER`, `CASH_WITH_UPSIDE`, `SEVEN_DAY_SOLD` |
| specialCircumstances | string? | ≤ 2,000 chars |
| offerDeadline | timestamptz | at publish: > now and ≤ now + 30 days; default now + 72 h (config) |
| publishedAt | timestamptz? | |
| listingVersion | int | 0 while DRAFT; 1 at publish; +1 on each material edit and on reopen. Each value has a `ListingVersion` snapshot |
| version | int | optimistic concurrency (unrelated to `listingVersion`) |

Material fields are every listing field a criterion reads (`MATERIAL_FIELDS`, derived from the
registry's `listingFields`). Editing one after publish creates a new `listingVersion` and
re-runs matching.

Indexes:
- `(agentId, status)`
- `(status, offerDeadline)`
- Partial unique on `(propertyId)` where status in active statuses (prevents two active
  packages for one property). A different property record with the same `addressHash` only
  produces a warning (FR-013).

### Photo
| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | |
| packageId | cuid → ListingPackage | cascade |
| storageKey | string | key in the storage provider |
| contentType | `image/jpeg` \| `image/png` \| `image/webp` | |
| sizeBytes | int | ≤ 10 MB |
| position | int | 0–19; unique `(packageId, position)` |

At least 1 photo is required to publish (FR-012); at most 20.

---

## Investors and matching

### Investor
| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | |
| externalRef | string? | ID from the legacy spreadsheet; unique; the import upsert key (FR-061) |
| companyName | string | |
| contactName | string | |
| email | string | valid email; unique; fallback upsert key |
| phone | string? | E.164 |
| investorType | `DIRECT_BUYER` \| `WHOLESALER` \| `IBUYER` | |
| status | `ACTIVE` \| `INACTIVE` | only ACTIVE investors are matched |
| proofOfFundsExpiresAt | timestamptz? | null = not verified. Matching considers the investor only while this is in the future (FR-024) |

### BuyBox
One investor has one or more buy boxes (FR-060). Every criterion is a typed column. A null
criterion means "any" (FR-025).

| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | |
| investorId | cuid → Investor | cascade; **not** unique (1:N) |
| name | string | 1–60 chars; unique per investor |
| status | `ACTIVE` \| `PAUSED` | only ACTIVE boxes are matched |
| isDefault | boolean | true for the box the legacy import creates and updates; at most one per investor (partial unique) |
| strategy | `FIX_FLIP` \| `BUY_HOLD` \| `WHOLESALE` \| `NOVATION` \| `SELLER_FINANCE` (nullable) | a label for organizing, reports, and near-miss grouping; **not** a criterion |
| geographyMode | `NATIONWIDE` \| `STATES` \| `ZIPS` | rows in `BuyBoxGeography` only for STATES and ZIPS |
| propertyTypes | `PROPERTY_TYPES` (array, nullable) | null = any; an empty array is rejected (CHECK `cardinality > 0`) |
| priceMin / priceMax | int (USD)? | ≥ 0; CHECK `priceMin ≤ priceMax` when both are set |
| yearBuiltMin / yearBuiltMax | int? | 1800 to the current year + 1; CHECK min ≤ max |
| bedsMin / bedsMax | int? | 0–20; CHECK min ≤ max |
| bathsMin / bathsMax | decimal(3,1)? | 0–20; CHECK min ≤ max |
| sqftMin / sqftMax | int? | > 0; CHECK min ≤ max |
| unitsMin / unitsMax | int? | 2–500; CHECK min ≤ max |
| conditionsAccepted | `CONDITIONS` (array, nullable) | null = any; empty array rejected |
| repairMax | int (USD)? | ≥ 0 |
| closeWithinDays | int? | 7–120 |
| acceptsListed | boolean | default true; false = only homes not already listed |
| programsAccepted | `OFFER_PROGRAMS` (array, nullable) | null = any; empty array rejected |
| version | int | +1 on each save; each value has a `BuyBoxVersion` snapshot |

Indexes: `(investorId)`, `(status)`; partial unique `(investorId)` where `isDefault`.

Validation (FR-060) names the failing field: every min ≤ max; no empty arrays; STATES needs at
least one valid 2-letter state; ZIPS needs at least one ZIP known to `IGeoProvider`.

### BuyBoxGeography
| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | |
| buyBoxId | cuid → BuyBox | cascade |
| kind | `STATE` \| `ZIP` | |
| value | string | `TX` or `78704` |

Unique `(buyBoxId, kind, value)`; index `(kind, value)` for the stage 1 pre-filter.
Mode and rows must agree. A deferred constraint trigger on BuyBox and BuyBoxGeography rejects:
NATIONWIDE with any rows; STATES with no STATE rows or with any ZIP row; ZIPS with no ZIP rows or
with any STATE row.

### BuyBoxVersion (append-only)
`id, buyBoxId, version, snapshot JSONB (every criterion plus the geography rows), createdBy,
createdAt`. Unique `(buyBoxId, version)`. Written in the same transaction as each save.

### ListingVersion (append-only)
| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | |
| packageId | cuid → ListingPackage | |
| listingVersion | int | unique `(packageId, listingVersion)` |
| round | int | |
| snapshot | JSONB | the listing facts every criterion reads; no PII |
| evaluatorVersion | int | `EVALUATOR_VERSION` used for this version's matching run |
| matchedCount | int? | set when matching completes |
| topExclusionReasons | JSONB? | `[{ criterionKey, label, count }]`, only when `matchedCount = 0` |
| createdAt | timestamptz | |

### Criterion Registry (XIX)

One key list, `CRITERION_KEYS` (as const): `geography`, `propertyType`, `price`, `yearBuilt`,
`beds`, `baths`, `sqft`, `units`, `condition`, `repair`, `closingSpeed`, `listedStatus`,
`programs`. Every layer is a record over that list, so a missing criterion fails the build:

| Layer | Lives in | Holds |
| --- | --- | --- |
| Definition | `packages/contracts/src/buy-box/criteria.ts` | label, Zod field schema, form metadata, `listingFields` (the listing fields it reads) |
| Evaluator | `packages/core/src/registry/evaluators.ts` | `evaluate(box, listing)` → `{ passed, expected, actual }`; pure, no I/O |
| Pre-filter | `packages/core/src/repositories/buy-box/prefilter-fragments.ts` | the SQL fragment for stage 1 (adapter only, IV) |

Rules every criterion follows:
- A null criterion passes, in both the SQL fragment and the evaluator, e.g.
  `(price_max IS NULL OR price_max >= :priceExpectationMax)`.
- A listing value the criterion needs that is null fails the criterion (fail closed), with
  `actual: null` in the result (FR-025).
- `price`: `priceMin ≤ priceExpectationMax ≤ priceMax`. `closingSpeed`: the investor's
  `closeWithinDays` must cover the seller's closing window. `listedStatus`: fails only when the
  listing is listed and `acceptsListed` is false. `programs`: at least one shared program.
- `EVALUATOR_VERSION` (an int in the evaluator file) is raised whenever any predicate changes.

**Two-stage matching** (FR-020, FR-024):
1. Stage 1, SQL pre-filter: investor `ACTIVE`, `proofOfFundsExpiresAt > now`, box `ACTIVE`, plus
   every registry fragment. NATIONWIDE skips the geography clause.
2. Stage 2, evaluator: every criterion on each candidate; a box matches only if every criterion
   passes.
3. Invariant (XIX.4): stage 1 may return extra boxes but never drops one stage 2 would match.
   A fast-check property test against real PostgreSQL proves it, with generators that include
   null criteria and null listing fields.

### Match
One row per investor per package per round, created when at least one of the investor's boxes
matches (FR-022). It is the investor's access grant (FR-040) and the notification record.

| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | |
| packageId | cuid → ListingPackage | cascade |
| investorId | cuid → Investor | cascade |
| round | int | |
| matchedBuyBoxIds | cuid[] | every box that matched, across listing versions of this round |
| trigger | `PUBLISH` \| `PACKAGE_EDIT` \| `BUY_BOX_CHANGE` | what first created the match |
| firstMatchedAt | timestamptz | |
| notifiedAt | timestamptz? | set when the `package.matched` event is written |
| lastNotifiedListingVersion | int? | the listing version the investor was last told about |
| digestedAt | timestamptz? | set when a BUY_BOX_CHANGE match is sent in the daily digest |

Unique `(packageId, investorId, round)`, so a re-run never sends a second notification.
Index `(investorId)` for the dashboard.
- A later edit that stops a box matching does not delete the row: shared packages stay visible
  (spec Story 5, scenario 1).
- After a material edit, `package.changed` goes to investors with `notifiedAt` set, only if a
  changed field is in the `listingFields` of a non-null criterion of one of their matched
  boxes.

### MatchEvaluation (append-only; positive matches only)
| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | |
| packageId | cuid → ListingPackage | |
| round / listingVersion | int / int | |
| investorId / buyBoxId | cuid / cuid | |
| buyBoxVersion | int | |
| evaluatorVersion | int | |
| clauseResults | JSONB | `[{ key, label, passed, expected, actual }]` |
| createdAt | timestamptz | |

Unique `(packageId, listingVersion, buyBoxId, buyBoxVersion)`, so a re-run inserts nothing new.

**"Why not matched?"** (FR-074) is answered by replay, not by stored non-match rows:
1. Take the latest `ListingVersion` of the round and, for each of the investor's boxes, the
   `BuyBoxVersion` that was live at that version's `createdAt`.
2. A stored `MatchEvaluation` for that pair is returned exactly.
3. Otherwise the current evaluator runs on the two snapshots. If the current `EVALUATOR_VERSION`
   differs from `ListingVersion.evaluatorVersion`, the answer is flagged
   `replayedWithNewerRules` (prototype shortcut: older evaluator versions are not kept
   runnable).

---

## Offers, decisions, deals

### Offer
| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | |
| packageId | cuid → ListingPackage | |
| investorId | cuid → Investor | must have a `Match` row for this package and round |
| round | int | |
| status | OfferStatus | see below |
| currentRevision | int | |
| price | int (USD) | > 0 |
| paymentType | `CASH` \| `FINANCED` | |
| closingDate | date | ≥ today |
| earnestMoney | int (USD) | ≥ 0 |
| contingencies | `INSPECTION` \| `FINANCING` \| `APPRAISAL` \| `TITLE` \| `SALE_OF_HOME` (array) | `FINANCING` is required if `paymentType = FINANCED` |
| feesAndConcessions | int (USD) | ≥ 0 |
| expiresAt | timestamptz | > now |
| version | int | |

Constraints:
- Partial unique `(packageId, investorId, round)` where status in
  (`ACTIVE`, `COUNTERED`, `BACKUP`, `ACCEPTED`) — at most one active offer per investor per
  package (FR-042, FR-045).
- New offers and revisions are refused when `now > package.offerDeadline` (FR-044).

Derived (not stored): `estimatedNetProceeds = price − feesAndConcessions − round(price ×
closingCostPct) − flatFees`, using `ConfigEntry["netProceeds"]` (FR-050, FR-051). The breakdown is
returned with every comparison row. `certaintyRank` = number of contingencies, with cash ahead of
financed on ties.

### OfferRevision (append-only)
| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | |
| offerId | cuid → Offer | |
| revision | int | unique `(offerId, revision)` |
| author | `INVESTOR` \| `AGENT` | AGENT for counters |
| terms | JSONB | snapshot of all term fields |
| createdAt | timestamptz | |

A counter-offer (FR-052) is an AGENT revision. It sets `Offer.status = COUNTERED`, and it is
visible only to that investor.

### Decision (append-only)
| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | |
| packageId | cuid | |
| type | `ACCEPT` \| `COUNTER` \| `DECLINE_ALL` | |
| offerId | cuid? | required for ACCEPT and COUNTER |
| actorUserId | cuid | the agent or ops user |
| note | string? | |

### Deal
| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | |
| packageId | cuid → ListingPackage | |
| offerId | cuid → Offer | unique |
| status | DealStatus | see below |
| fellThroughReason | string? | required when FELL_THROUGH |
| promotedFromBackup | boolean | |
| reconfirmBy | timestamptz? | set while PENDING_RECONFIRMATION (now + 48 h, config) |
| version | int | |

Partial unique: `(packageId)` where status not in (`FELL_THROUGH`, `CLOSED`, `RECONFIRM_DECLINED`)
— at most one active deal per package (FR-053).

---

## Reliability, history, configuration

### Job (Constitution VIII envelope)
| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | |
| type | `MATCH_PACKAGE` \| `MATCH_BUY_BOX` \| `SEND_MATCH_DIGESTS` \| `IMPORT_INVESTORS` \| `CLOSE_OFFER_ROUND` \| `EXPIRE_OFFER` \| `EXPIRE_RECONFIRMATION` | |
| status | `QUEUED` \| `PROCESSING` \| `COMPLETED` \| `FAILED` | |
| dedupeKey | string | e.g., `MATCH_PACKAGE:{packageId}:{round}:{listingVersion}`, `MATCH_BUY_BOX:{buyBoxId}:{version}`, `SEND_MATCH_DIGESTS:{date}`, `CLOSE_OFFER_ROUND:{packageId}:{round}:{deadline}`, `EXPIRE_OFFER:{offerId}:{revision}`, `EXPIRE_RECONFIRMATION:{dealId}`, `IMPORT_INVESTORS:{batchId}` |
| runAt | timestamptz | default now; future for scheduled jobs |
| progress | int | 0–100 |
| payload / result | JSONB | validated per type with Zod on read (VI) |
| error | string? | redacted |
| retryCount / maxRetries | int | default 0 / 3 |
| lockedAt / lockedBy | timestamptz? / string? | reclaimed when older than 60 s |

Partial unique `(type, dedupeKey)` where status in (`QUEUED`, `PROCESSING`) (VIII).
Index: `(status, runAt)`.

### OutboxEvent (append-only, written in the same transaction as the state change, XVIII.1)
| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | also used as the event ID downstream |
| type | see [contracts/events.md](./contracts/events.md) | |
| aggregateType / aggregateId | string / cuid | e.g., `ListingPackage` / id |
| payload | JSONB | PII-free except `crm` fields as allowed by FR-032 |
| createdAt | timestamptz | |
| relayedAt | timestamptz? | set by the relay after Delivery rows exist |

Index: `(relayedAt)` partial where null.

### Delivery
| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | the idempotency key sent to the provider |
| outboxEventId | cuid → OutboxEvent | |
| target | `CRM` \| `EMAIL` \| `SMS` \| `IN_APP` | |
| recipientRef | string? | investor or user ID (never raw contact data) |
| status | `PENDING` \| `SENDING` \| `SENT` \| `RETRYING` \| `NEEDS_ATTENTION` | |
| attempts | int | |
| lastError | string? | redacted |
| nextAttemptAt / sentAt | timestamptz? | |

Unique `(outboxEventId, target, recipientRef)` — the relay cannot create duplicates.
Index: `(status)`.

### Notification (in-app inbox)
`id, userId, type, packageId?, title, body, readAt?, createdAt`. Written by the `IN_APP`
delivery handler.

### AuditLog (append-only, immutable; Constitution XII)
| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | |
| occurredAt | timestamptz | |
| actorType / actorId | `USER` \| `SYSTEM` / string | |
| action | e.g., `PACKAGE_PUBLISHED`, `MATCH_EVALUATED`, `OFFER_SUBMITTED`, `OFFER_REVISED`, `DECISION_RECORDED`, `DEAL_MILESTONE`, `DEAL_FELL_THROUGH`, `BACKUP_PROMOTED`, `PII_ACCESSED`, `CONFIG_CHANGED`, `IMPORT_COMPLETED` | |
| entityType / entityId | string / cuid | |
| outcome | `SUCCESS` \| `REJECTED` | rejections are audited too (VII) |
| details | JSONB | PII-redacted |

A DB trigger rejects UPDATE and DELETE on this table. Index: `(entityType, entityId,
occurredAt)` for the operations timeline (FR-073).

### ImportBatch / ImportRowResult
- `ImportBatch`: `id, jobId, fileName, totalRows, imported, updated, rejected, createdBy`.
- `ImportRowResult`: `id, batchId, rowNumber, outcome (IMPORTED | UPDATED | REJECTED),
  reason?, investorId?`.
- Rows are processed one transaction each, so an invalid row never leaves a partial investor
  (FR-061).

### ConfigEntry (Constitution IX)
`key, brandId?, value JSONB, updatedBy, updatedAt`. Unique `(key, brandId)`. Each key has a Zod
schema in contracts. Seeded keys: `netProceeds`, `offerWindowHours`, `reconfirmHours`,
`deliveryRetry`, `packageFormSteps`, `matchDigest` (`{ hourUtc }`, default 14, the daily digest
time), `nearMiss` (`{ windowDays, minCount }`, defaults 30 and 5; `minCount` may not go below 5).

---

## State machines (`as const` transition maps in `@clever/contracts`)

### PackageStatus (FR-014)

| From | Event | To |
| --- | --- | --- |
| DRAFT | publish (valid) | ACCEPTING_OFFERS |
| DRAFT, ACCEPTING_OFFERS, NO_OFFERS_RECEIVED | withdraw | WITHDRAWN ■ |
| ACCEPTING_OFFERS | deadline passes with 0 offers | NO_OFFERS_RECEIVED |
| ACCEPTING_OFFERS | seller accepts an offer | OFFER_ACCEPTED |
| NO_OFFERS_RECEIVED | reopen / extend deadline | ACCEPTING_OFFERS (round + 1 on reopen) |
| OFFER_ACCEPTED | milestone | UNDER_CONTRACT |
| UNDER_CONTRACT | milestone | INSPECTION |
| INSPECTION | milestone | CLOSING |
| CLOSING | milestone | CLOSED ■ |
| OFFER_ACCEPTED … CLOSING | fell through (reason required) | FELL_THROUGH |
| FELL_THROUGH | promoted backup reconfirms | OFFER_ACCEPTED |
| FELL_THROUGH | reopen (no usable backups) | ACCEPTING_OFFERS (round + 1) |
| FELL_THROUGH | withdraw | WITHDRAWN ■ |

- `■` marks final states: CLOSED and WITHDRAWN.
- Out-of-order milestones are refused, and the response lists the allowed next states (spec
  edge case).
- If the deadline passes with ≥ 1 offer, the package stays ACCEPTING_OFFERS with
  `offersClosed = true` (derived from the deadline). New offers are refused, and the agent can
  still decide.

### OfferStatus

```text
ACTIVE ─revise─▶ ACTIVE (new revision)
ACTIVE ─agent counter─▶ COUNTERED ─investor accepts counter / revises─▶ ACTIVE
COUNTERED ─investor declines counter─▶ ACTIVE (at the investor's last own revision; agent notified)
ACTIVE|COUNTERED ─withdraw─▶ WITHDRAWN ■
ACTIVE|COUNTERED ─expiresAt passes─▶ EXPIRED ■
ACTIVE ─seller accepts─▶ ACCEPTED ─deal falls through─▶ FELL_THROUGH ■
ACTIVE|COUNTERED ─another offer accepted─▶ BACKUP ─promoted─▶ ACCEPTED (after reconfirm)
BACKUP ─no reconfirm in 48 h / investor declines─▶ DECLINED_TO_RECONFIRM ■
BACKUP ─investor withdraws─▶ WITHDRAWN ■   (FR-054)
BACKUP ─investor extends expiresAt─▶ BACKUP (only `expiresAt` may change; allowed after the deadline)
BACKUP|ACTIVE ─package closed/withdrawn or decline all─▶ DECLINED ■
```

### DealStatus

```text
OFFER_ACCEPTED ─▶ UNDER_CONTRACT ─▶ INSPECTION ─▶ CLOSING ─▶ CLOSED ■
any non-final ─fell through (reason)─▶ FELL_THROUGH ■
PENDING_RECONFIRMATION ─investor reconfirms─▶ OFFER_ACCEPTED
PENDING_RECONFIRMATION ─declines or 48 h─▶ RECONFIRM_DECLINED ■
```

- Promoting a backup creates a new Deal in `PENDING_RECONFIRMATION`.
- The package status mirrors the active deal's status. While a deal is
  `PENDING_RECONFIRMATION`, the package stays `FELL_THROUGH`.

### Job and Delivery
- Job: `QUEUED → PROCESSING → COMPLETED | FAILED`; FAILED → QUEUED while
  `retryCount < maxRetries`.
- Delivery: `PENDING → SENDING → SENT`; SENDING → RETRYING → SENDING (backoff);
  RETRYING → NEEDS_ATTENTION after max attempts; NEEDS_ATTENTION → PENDING on manual retry.

---

## Privacy matrix (FR-030, FR-031, FR-032)

| Data | Agent (owner) | Investor before acceptance | Winning investor | Ops | CRM | Email/SMS | Logs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Seller name, email, phone | ✅ | ❌ | ✅ (audited) | ✅ (audited) | ✅ | ❌ | ❌ redacted |
| Street line | ✅ | ❌ | ✅ (audited) | ✅ (audited) | ✅ | ❌ | ❌ redacted |
| City, ZIP, neighborhood | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Seller's expected price range | ✅ | ✅ (matched only) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Why-not-matched explanations | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | IDs only |
| Near-miss summary (FR-062) | ❌ | own boxes, counts only (≥ 5) | own boxes | ✅ | ❌ | ❌ | ❌ |
| Other investors' offers | ✅ | ❌ | ❌ | ✅ | status only | ❌ | IDs only |
