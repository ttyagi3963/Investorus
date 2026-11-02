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

### User (locked 2026-10-30; amended 2026-10-31: sign-in by email)
A login account, signed in to by email. Roles are AGENT, INVESTOR, and OPS. Sellers have no User today (see the spec
assumption "No seller view"); a seller dashboard would add a SELLER role and `sellerId` without
changing Seller data.

| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | |
| email | string | unique, a valid email, stored lowercase (was `username`; changed 2026-10-31) |
| passwordHash | string | bcrypt |
| role | `AGENT` \| `INVESTOR` \| `OPS` | |
| displayName | string | 1–80 chars |
| agentId | cuid? | → Agent; **unique**; set if role = AGENT (1:1) |
| investorId | cuid? | → Investor; **unique**; set if role = INVESTOR (1:1, one login per investor in the prototype) |
| active | boolean | default true |

Plus `createdAt` and `updatedAt` (conventions).

DB constraints: unique `email`, unique `agentId`, unique `investorId` (each allows many NULLs,
which is correct here); CHECK: an AGENT has `agentId` set; an INVESTOR has `investorId` set; OPS
has neither.

### Agent (locked 2026-10-30)
| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | |
| name | string | |
| email | string | valid email; **unique** (how ops, the seed, and the CRM sync identify an agent) |
| brokerage | string | |
| brandId | string | references Brand |

### Brand (Constitution X and XVI; built in Sprint 7, T347)
| Field | Type | Rules |
| --- | --- | --- |
| id | string | the folder name in `seed/brands/`: `clever`, `larkspur` |
| name | string | `content.displayName`; the name emails and texts carry |
| tokens | JSONB | DTCG tokens per [contracts/design-tokens.md](./contracts/design-tokens.md); saved only if `validateBrandTokens` passes: every variable the theme reads, no unsafe value, every text pair at least 4.5:1 (FR-091, FR-095) |
| content | JSONB | display and product names, logo path, sign-in copy (`brandContentSchema`) |
| hosts | text[] | the addresses that open the brand (`partner.localhost`); at least one |
| tokenVersion | int | starts at 1, `CHECK >= 1`; +1 on each token change (seed file change or an operator's save); the theme's `ETag`, and the version a save must name |
| seedHash | string? | sha256 of the seed files last loaded; the seed rewrites the brand only when it differs, so an operator's edit survives a restart |
| createdAt, updatedAt | timestamp | |

---

## Sellers, properties, packages

### Seller (locked 2026-10-30)
A contact record for the homeowner. It stores no agent: the representing agent is
`ListingPackage.agentId` on each package, so relisting with a different agent is a new package,
not an edit here. Access to seller details is checked through package ownership (FR-080).

| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | |
| fullName 🔒 | string | required |
| email 🔒 | string? | valid email if present |
| phone 🔒 | string? | E.164 if present |

Plus `createdAt` and `updatedAt` (conventions). DB CHECK: `email IS NOT NULL OR phone IS NOT NULL`
(an empty encrypted field is still NULL, so the database can enforce it).

### Property (locked 2026-10-30)
One Property per listing package: the home as it was listed for that package. A relist creates a
new package with a new Property, so an earlier package keeps its own facts. Rows for the same
physical home are linked only by `addressHash` (FR-013). Like Seller, a Property has no agent of
its own; it is reached through its package (`ListingPackage.propertyId`, unique).

| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | |
| streetLine 🔒 | string | required |
| addressHash | string | HMAC of the normalized full address; used for the duplicate-listing warning (FR-013) without decrypting |
| zip | string | 5 digits; must exist in the geo reference set (`IGeoProvider`); the only location field the agent enters besides the street line |
| city | string | derived from `zip` via `IGeoProvider.lookup`; never typed |
| state | string | 2-letter; derived from `zip`; never typed (so STATE buy boxes cannot miss on a typo) |
| neighborhood | string? | default from `IGeoProvider.lookup`; the agent may edit it (display only, not matched on) |
| lat / lng | decimal? | the ZIP centroid from `IGeoProvider.lookup`, set when the ZIP is saved; agents never type it |
| propertyType | `SINGLE_FAMILY` \| `CONDO` \| `TOWNHOME` \| `MULTI_FAMILY` \| `MANUFACTURED` \| `LAND` | |
| beds | int? | 0–20; required at publish unless LAND |
| baths | decimal(3,1)? | 0–20, in 0.5 steps; required at publish unless LAND |
| sqft | int? | living area, 100–20,000 (0 is rejected); required at publish unless LAND |
| lotSqft | int? | > 0; allowed for any type; required at publish for LAND |
| units | int? | 2–500; only for MULTI_FAMILY (DB CHECK); required at publish for MULTI_FAMILY |
| yearBuilt | int? | 1800 to the current year; required at publish unless LAND |
| condition | `EXCELLENT` \| `GOOD` \| `FAIR` \| `POOR` \| `DISTRESSED` (nullable) | required at publish unless LAND |
| repairEstimate | int (USD)? | ≥ 0 |

Plus `createdAt` and `updatedAt` (conventions). Fields are nullable so a DRAFT can be saved
incomplete and LAND can omit building facts. Range rules are DB CHECKs, plus
`propertyType = 'MULTI_FAMILY' OR units IS NULL`. The type-dependent "required at publish" rules
are enforced by the publish schema (FR-012).

Index: `(zip)`, `(addressHash)`.

### ListingPackage
| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | |
| agentId | cuid → Agent | owner; agents see only their own |
| sellerId | cuid → Seller | **unique** (one package per Seller) |
| propertyId | cuid → Property | **unique** (one package per Property) |
| addressHash | string | copy of `Property.addressHash`, written in the same unit of work whenever the address is saved; never typed; backs the duplicate-address block (FR-013) |
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
| listingVersion | int | 0 while DRAFT; 1 at publish; +1 on each material edit and on reopen, and on a deadline extension that follows a material edit made while NO_OFFERS_RECEIVED. Each value has a `ListingVersion` snapshot |
| version | int | optimistic concurrency (unrelated to `listingVersion`) |

Material fields are every listing field a criterion reads (`MATERIAL_FIELDS`, derived from the
registry's `listingFields`). Editing one after publish creates a new `listingVersion` and
re-runs matching.

The agent may change a package's details and photos only while it is DRAFT, ACCEPTING_OFFERS, or
NO_OFFERS_RECEIVED (`EDITABLE_STATUSES`, T375); in any other status the change is refused (409
`PACKAGE_LOCKED`), and after a fall-through the agent reopens first. Once published, an edit may
not empty a field publishing needs (FR-012), and an edit made while NO_OFFERS_RECEIVED is matched
when the deadline is extended or the package reopens.

Indexes:
- `(agentId, status)`
- `(status, offerDeadline)`
- Unique `(propertyId)`: one package per Property (Property locked 2026-10-30).
- Unique `(sellerId)`: one package per Seller, so each Seller row belongs to exactly one agent.
  The listing agreement ties a seller to an agent, so the link lives here: each package has one
  agent and one seller, which gives "one agent per sale". A returning homeowner gets a new Seller
  row per package (Maria sells Elm St with Agent A, later Oak St with Agent B: two rows). Without
  this, a shared row would let Agent B's edit to her phone change Agent A's listing, bypassing the
  per-package access check (FR-080). The Seller table itself is unchanged.
- Partial unique `(addressHash)` WHERE status NOT IN (`CLOSED`, `WITHDRAWN`): one active package
  per address, across all agents (FR-013, decided 2026-10-30). FELL_THROUGH counts as active
  because a backup offer can revive it. The service checks first so it can return a clear
  `BusinessRuleError` (409, code `DUPLICATE_ACTIVE_LISTING`); the index catches simultaneous
  creates. `details.existingPackageId` is included only when the caller owns that package.

### Photo
| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | |
| packageId | cuid → ListingPackage | cascade |
| storageKey | string | key in the storage provider |
| contentType | `image/jpeg` \| `image/png` \| `image/webp` | |
| sizeBytes | int | ≤ 10 MB |
| position | int | 0–19; unique `(packageId, position)` |

At least 1 photo is required to publish (FR-012), and a published package keeps at least 1; at
most 20. Photos change only while the package is editable (`EDITABLE_STATUSES`, T375).

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
  `closeWithinDays` must cover the seller's closing window: counting from the day matching runs,
  the investor must be able to close by the window's last day (`today + closeWithinDays ≤
  closingWindowEnd`); they can always wait for its first day (pinned 2026-11-01, T287). `listedStatus`: fails only when the
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
| digestedAt | timestamptz? | set when a BUY_BOX_CHANGE match is sent in the daily digest; the run claims matches by setting it in one `UPDATE … RETURNING`, so two runs at once never send one twice |

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
- New offers and revisions are refused when `now > package.offerDeadline` (FR-044), except a
  revision that answers the agent's counter, which the agent may send after the deadline (T377).

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
| note | string? 🔒 | free text the agent writes, so it may hold seller details; encrypted like the seller columns and shown only to the agent |

### Deal
| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | |
| packageId | cuid → ListingPackage | |
| offerId | cuid → Offer | unique |
| status | DealStatus | see below |
| fellThroughReason | string? 🔒 | required when FELL_THROUGH; free text, so encrypted like the seller columns and shown only to the agent |
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
| lockedAt / lockedBy | timestamptz? / string? | the lease: renewed every 20 s by the running worker, reclaimed when older than 60 s (a used try; FAILED once retries are used); only `lockedBy` can complete or fail the job (T378) |

Partial unique `(type, dedupeKey)` where status in (`QUEUED`, `PROCESSING`) (VIII).
Index: `(status, runAt)`.

### OutboxEvent (append-only, written in the same transaction as the state change, XVIII.1)
| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | also used as the event ID downstream |
| sequence | bigserial, unique | taken when the row is written, while the change holds its package's row, so a package's events number in commit order; the CRM keeps the highest (T380) |
| type | text, checked against the event union in code ([contracts/events.md](./contracts/events.md)) | |
| aggregateType / aggregateId | string / cuid | `ListingPackage` / its id, or `Investor` / its id for the daily digest |
| payload | JSONB | PII-free (FR-032); the CRM target adds the seller's contact at send time |
| occurredAt | timestamptz | when the change was written (the writer's clock, to the millisecond); shown, not used for ordering |
| relayedAt | timestamptz? | set once by the relay after the Delivery rows exist; a trigger refuses any other change and any delete |
| correlationId | string? | the trace ID of the request or job that wrote it |

Index: `(occurredAt)` partial where `relayedAt` is null; `(aggregateType, aggregateId, occurredAt)`
for the operations trace.

### Delivery
| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | the idempotency key sent to the provider |
| outboxEventId | cuid → OutboxEvent | |
| target | `CRM` \| `EMAIL` \| `SMS` | in-app notices stay in the change itself (Sprint 6) |
| recipientRef | string | the investor's ID (EMAIL, SMS) or the package's ID (CRM); never contact data |
| status | `PENDING` \| `SENDING` \| `SENT` \| `RETRYING` \| `NEEDS_ATTENTION` | CHECK: `SENT` exactly when `sentAt` is set |
| attempts | int | CHECK ≥ 0; counted by the dispatcher; an attempt's outcome is written only while the row is still on that attempt |
| lastError | string? | redacted, at most 500 characters |
| nextAttemptAt / sentAt | timestamptz? | |
| queuedAt | timestamptz? | set when the relay puts it on the BullMQ queue; reset by an operations retry |

Unique `(outboxEventId, target, recipientRef)`: the relay cannot create duplicates.
Indexes: `(status)`; `(createdAt)` partial where `PENDING` and not queued.

### Notification (in-app inbox)
`id, userId, type, packageId?, title, body, readAt?, createdAt`. Written in the same transaction
as the change it reports (Sprint 6 kept in-app notices out of the outbox).

### AuditLog (append-only, immutable; Constitution XII)
| Field | Type | Rules |
| --- | --- | --- |
| id | cuid | |
| occurredAt | timestamptz | |
| actorType / actorId | `USER` \| `SYSTEM` / string | |
| action | e.g., `PACKAGE_PUBLISHED`, `MATCH_EVALUATED`, `OFFER_SUBMITTED`, `OFFER_REVISED`, `DECISION_RECORDED`, `DEAL_MILESTONE`, `DEAL_FELL_THROUGH`, `BACKUP_PROMOTED`, `PII_ACCESSED`, `CONFIG_CHANGED`, `IMPORT_COMPLETED` | |
| entityType / entityId | string / cuid | |
| outcome | `SUCCESS` \| `REJECTED` | rejections are audited too (VII); Sprint 2 writes only SUCCESS, so REJECTED arrives with the first audited rejection |
| correlationId | string? | the trace ID of the request or job that wrote the entry (added 2026-11-01, T282) |
| details | JSONB | PII-redacted |

A DB trigger rejects UPDATE and DELETE on this table. Index: `(entityType, entityId,
occurredAt)` for the operations timeline (FR-073).

### IdempotencyKey (added 2026-11-01, T285; Constitution XX.2)
One `Idempotency-Key` a user sent with a POST or PATCH, stored in Postgres instead of Redis
(plan.md Complexity Tracking).

| Field | Type | Rules |
| --- | --- | --- |
| id | string | |
| userId | cuid | → User (cascade delete) |
| key | string | unique with `userId`; up to 255 chars |
| method / path | string | a retry must match them |
| bodyHash | string | SHA-256 of the JSON body; a retry must match it |
| status | `IN_PROGRESS` \| `DONE` | |
| claimToken | string | the claim holding the key; only its holder can complete, release, or commit under it (T367) |
| lockedUntil | timestamp | the claim's 30-second lease; past it, a retry takes the key over if nothing committed |
| committedAt | timestamp? | set in the same transaction as the request's first write, only while the lease holds; a request that outlived its lease is rolled back |
| responseStatus / responseBody | int? / text? | set when DONE; a 5xx is never stored (the row is deleted if nothing committed; if something did, a retry is told it was applied). The body can hold seller details (a package view), so it is the JSON encrypted with the PII cipher (XII). A replay returns it as first sent; the screens re-read the package after a save |
| createdAt | timestamp | a key older than 24 hours is ignored and claimed again |

### EffectMarker (added 2026-11-01, T368; FR-072)
`key` (primary key), `createdAt`. A one-time effect a job has applied, such as
`OFFER_ROUND_CLOSED:<packageId>:<round>:<deadline>`. A job that may run twice (its worker died
after the change committed, before the job was marked done) claims the key in the same
transaction as the effect; a second claim fails and the run does nothing. Append-only.

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
| ACCEPTING_OFFERS | decline all after the deadline (T377) | NO_OFFERS_RECEIVED |
| ACCEPTING_OFFERS | seller accepts an offer | OFFER_ACCEPTED |
| NO_OFFERS_RECEIVED | reopen / extend deadline | ACCEPTING_OFFERS (round + 1 on reopen) |
| OFFER_ACCEPTED | milestone | UNDER_CONTRACT |
| UNDER_CONTRACT | milestone | INSPECTION |
| INSPECTION | milestone | CLOSING |
| CLOSING | milestone | CLOSED ■ |
| OFFER_ACCEPTED … CLOSING | fell through (reason required) | FELL_THROUGH |
| FELL_THROUGH | promoted backup reconfirms | OFFER_ACCEPTED |
| FELL_THROUGH | reopen (backups left are declined and told, T377) | ACCEPTING_OFFERS (round + 1) |
| FELL_THROUGH | withdraw (backups left are declined) | WITHDRAWN ■ |

- `■` marks final states: CLOSED and WITHDRAWN.
- Out-of-order milestones are refused, and the response lists the allowed next states (spec
  edge case).
- If the deadline passes with ≥ 1 offer, the package stays ACCEPTING_OFFERS with
  `offersClosed = true` (derived from the deadline). New offers are refused, and the agent can
  still decide; declining all then moves the package to NO_OFFERS_RECEIVED, since no offer can
  come (T377). Before the deadline a decline all leaves the round open for new offers.
- From FELL_THROUGH, reopen and withdraw are refused (409 `BACKUP_PENDING`) while a promoted
  backup's deal is PENDING_RECONFIRMATION.

### OfferStatus

```text
ACTIVE ─revise─▶ ACTIVE (new revision)
ACTIVE ─agent counter─▶ COUNTERED ─investor accepts counter / revises (even after the deadline)─▶ ACTIVE
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
