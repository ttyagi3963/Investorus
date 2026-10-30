# Contract: Platform REST API (`apps/api`)

Base URL: `http://localhost:4000/api/v1`. All shapes are Zod schemas exported from
`@clever/contracts`, and the web BFF calls them through the typed client in that package.
Entity fields are defined in [../data-model.md](../data-model.md).

## Cross-cutting rules

- **Auth**: `Authorization: Bearer <session JWT>` on every route except `POST /sessions` and
  `GET /health`. The role is checked in the service (III), not the route.
- **Idempotency (XX.2)**: every POST, PUT, and PATCH requires an `Idempotency-Key` header.
  - Missing key → `400`.
  - Same key and same body → the stored response, with the header `Idempotent-Replay: true`.
  - Same key while the first request is still running → `409` with `Retry-After: 1`.
  - Same key with a different body → `422`.
  - Redis unavailable → `503` with `Retry-After: 5`.
- **Status codes (II)**: GET 200, create POST 201, async POST 202 with
  `{ jobId, statusUrl }`, PATCH and PUT 200, DELETE 204.
- **Errors (VII)**: `{ "error": "message", "code": "BUSINESS_RULE", "details"?: {...} }`.
  - 400: validation (with `details.fields[]` naming each failing field, FR-012).
  - 401: missing, invalid, or expired session token.
  - 403: forbidden. 404: not found (also returned for investors asking about packages they are
    not matched to, so existence is not leaked).
  - 409: business rule or concurrency conflict. 503: idempotency store down.
  - 500: unexpected, with a generic message.
- **Pagination**: `?cursor=&limit=` (default 25, max 100) on list routes. Responses use
  `{ items, nextCursor }`.

## Sessions

| Method | Path | Role | Body / Response | Notes |
| --- | --- | --- | --- | --- |
| POST | `/sessions` | public | `{ username, password }` → 201 `{ token, user }` | The BFF stores the token in an HTTP-only cookie |
| GET | `/me` | any | → `{ user, role, agentId?, investorId? }` | |
| GET | `/health` | public | → `{ status, db, redis }` | Used by compose healthchecks |
| GET | `/brands/:brandId/theme` | public | → `{ brandId, tokenVersion, cssVariables: Record<string,string>, content }` (cacheable, `ETag` = tokenVersion) | FR-092; the web root layout renders the variables |
| GET | `/brands` | public | → `[{ brandId, displayName }]` | Brand switcher (FR-093) |

## Listing packages (agent)

| Method | Path | Role | Body / Response | Spec |
| --- | --- | --- | --- | --- |
| GET | `/listing-packages` | AGENT (own), OPS (all) | `?status=` → `AgentPackageSummary[]` | Story 2 |
| POST | `/listing-packages` | AGENT | `CreatePackageInput` (seller, property, expectations) → 201 `AgentPackageView` (DRAFT); includes `duplicateWarning?` | FR-010, FR-013 |
| GET | `/listing-packages/:id` | AGENT (own), OPS | → `AgentPackageView` (full, with PII) | |
| PATCH | `/listing-packages/:id` | AGENT (own) | `UpdatePackageInput` (partial; `undefined` = unchanged) + `version` → 200 | 202 with a re-match job if a material field changed after publish |
| POST | `/listing-packages/:id/publication` | AGENT (own) | `{ offerDeadline?, version }` → 202 `{ jobId }` (MATCH_PACKAGE) | 400 lists invalid fields (FR-012) |
| POST | `/listing-packages/:id/withdrawal` | AGENT (own) | `{ reason?, version }` → 200 | |
| POST | `/listing-packages/:id/reopening` | AGENT (own) | `{ offerDeadline, version }` → 202 | Round + 1 |
| PATCH | `/listing-packages/:id/offer-deadline` | AGENT (own) | `{ offerDeadline, version }` → 200 | Extend the deadline |
| POST | `/listing-packages/:id/photo-uploads` | AGENT (own) | `{ contentType, sizeBytes }` → 201 `{ storageKey, upload: UploadInstruction }` | Vendor-neutral `{ url, method, headers, expiresAt }` ([providers.md](./providers.md)); the browser uploads directly (XIV) |
| POST | `/listing-packages/:id/photos` | AGENT (own) | `{ storageKey, position }` → 201 `Photo` | Verifies the object exists |
| DELETE | `/listing-packages/:id/photos/:photoId` | AGENT (own) | → 204 | |
| GET | `/package-form` | AGENT | → `packageFormSteps` config (ordered steps, field keys, required flags) | IX: the package form is config-driven |
| GET | `/listing-packages/:id/matches` | AGENT (own): counts only; OPS: full | → `{ matchedCount, topExclusionReasons[] }` (from the latest `ListingVersion`) or `MatchView[]` (positive matches with `matchedBuyBoxes[]` and their `clauseResults`) | FR-020; edge case "no matches" |

## Investor views

| Method | Path | Role | Body / Response | Spec |
| --- | --- | --- | --- | --- |
| GET | `/investor/packages` | INVESTOR | → `InvestorPackageSummary[]` (matched only, newest first, `offerDeadline`, `myOfferStatus?`) | FR-040 |
| GET | `/investor/packages/:id` | INVESTOR | → `InvestorPackageView` — **no PII fields in the schema**; after acceptance by this investor, → `InvestorPackageView & { sellerContact, streetLine }` | FR-030, FR-031 |
| GET | `/investor/buy-boxes` | INVESTOR | → `BuyBoxView[]` (own boxes, default first) | FR-060 |
| POST | `/investor/buy-boxes` | INVESTOR | `CreateBuyBoxInput` (name, strategy?, criteria) → 201 `BuyBoxView` (version 1); enqueues MATCH_BUY_BOX | FR-060, FR-023 |
| GET | `/investor/buy-boxes/:id` | INVESTOR (owner) | → `BuyBoxView` | FR-060 |
| PUT | `/investor/buy-boxes/:id` | INVESTOR (owner) | `UpdateBuyBoxInput` (full criteria, status, name, strategy?) + `version` → 200 `BuyBoxView` (new version); enqueues MATCH_BUY_BOX if criteria or status changed | FR-060, FR-023; pause and resume are a `status` change |
| GET | `/investor/buy-boxes/:id/near-misses` | INVESTOR (owner) | → `NearMissSummary` (`[{ criterionKey, label, count }]`, only groups with `count` ≥ 5; no package IDs or addresses) | FR-062 |

## Offers

| Method | Path | Role | Body / Response | Spec |
| --- | --- | --- | --- | --- |
| POST | `/listing-packages/:id/offers` | INVESTOR (matched) | `CreateOfferInput` → 201 `OfferView` | FR-041, FR-044, FR-045 |
| GET | `/listing-packages/:id/offers` | AGENT (own), OPS | → `OfferView[]` (latest revision per investor; `investorActive` flag) | Story 3, scenario 2; edge case "investor deactivated" |
| PATCH | `/offers/:offerId` | INVESTOR (owner) | `ReviseOfferInput` + `version` → 200 (new revision). For a BACKUP offer, only `expiresAt` may change, and that is allowed after the deadline | FR-042; edge case "backup offer expires" |
| POST | `/offers/:offerId/withdrawal` | INVESTOR (owner) | → 200 | FR-043 |
| POST | `/offers/:offerId/counter-response` | INVESTOR (owner) | `{ action: "ACCEPT" \| "DECLINE" }` or a revision → 200 | Story 4, scenario 3 |
| POST | `/offers/:offerId/reconfirmation` | INVESTOR (owner) | `{ action: "CONFIRM" \| "DECLINE" }` → 200 | FR-057 |
| GET | `/offers/:offerId/revisions` | INVESTOR (owner), AGENT (package owner), OPS | → `OfferRevision[]` | |

## Comparison, decisions, deals (agent)

| Method | Path | Role | Body / Response | Spec |
| --- | --- | --- | --- | --- |
| GET | `/listing-packages/:id/offer-comparison` | AGENT (own), OPS | `?sort=netProceeds\|closingDate\|certainty` → `{ rows: OfferComparisonRow[], assumptions }` (each row includes the net-proceeds breakdown) | FR-050, FR-051 |
| POST | `/listing-packages/:id/decisions` | AGENT (own) | `{ type: "ACCEPT"\|"COUNTER"\|"DECLINE_ALL", offerId?, counterTerms?, note?, version }` → 201 `Decision` | FR-052, FR-053 (409 if an offer is already accepted) |
| GET | `/listing-packages/:id/deal` | AGENT (own), INVESTOR (buyer), OPS | → `DealView` with `allowedNextMilestones[]` and `backups[]` (agent/ops only) | FR-055 |
| POST | `/deals/:dealId/milestones` | AGENT (own), OPS | `{ milestone, version }` → 200 | 409 with `allowedNext` if out of order |
| POST | `/deals/:dealId/fall-through` | AGENT (own), OPS | `{ reason, version }` → 200 | FR-056 |
| POST | `/listing-packages/:id/backup-promotions` | AGENT (own) | `{ offerId, version }` → 201 `DealView` (PENDING_RECONFIRMATION) | FR-057 |

## Operations

| Method | Path | Role | Body / Response | Spec |
| --- | --- | --- | --- | --- |
| GET | `/ops/listing-packages/:id/timeline` | OPS | → `TimelineEntry[]` (audit, matches, deliveries merged by time) | FR-073 |
| GET | `/ops/listing-packages/:id/matches/:investorId` | OPS | → `MatchExplanationView`: `{ matched, listingVersion, buyBoxes: [{ buyBoxId, name, buyBoxVersion, matched, clauseResults[], source: "STORED" \| "REPLAYED" }], replayedWithNewerRules }` | FR-074; non-matches are replayed against the versions live at the time |
| GET | `/ops/deliveries` | OPS | `?status=NEEDS_ATTENTION` → `Delivery[]` | FR-071 |
| POST | `/ops/deliveries/:id/retry` | OPS | → 202 | FR-071 |
| POST | `/ops/deliveries/retry-all` | OPS | `{ target? }` → 202 `{ count }` (every NEEDS_ATTENTION delivery back to PENDING) | FR-071, SC-007 |
| POST | `/ops/match-digests` | OPS | → 202 `{ jobId }` (enqueues `SEND_MATCH_DIGESTS` now; demo aid, the daily run is unchanged) | FR-023 |
| GET | `/ops/crm-comparison` | OPS | → `[{ packageId, platformStatus, crmStatus, inSync, pendingDeliveryId? }]` | FR-078 |
| GET | `/ops/simulations` | OPS | → `{ crm, messaging, storage }` modes | FR-075 |
| PUT | `/ops/simulations/:service` | OPS | `{ mode: "up"\|"down"\|"slow"\|"garbage" }` → 200 | FR-075 |
| POST | `/ops/investor-imports` | OPS | `{ storageKey, fileName }` (CSV uploaded by the browser with the `UploadInstruction`) → 202 `{ jobId, batchId }` | FR-061 |
| POST | `/ops/investor-imports/uploads` | OPS | `{ sizeBytes }` → 201 `{ storageKey, upload: UploadInstruction }` | Same instruction shape as photo uploads |
| GET | `/ops/investor-imports/:batchId` | OPS | → `ImportBatch & { rows: ImportRowResult[] }` | |
| GET | `/ops/config` / PUT `/ops/config/:key` | OPS | `ConfigEntry` (value validated by the per-key schema) | FR-051, IX |
| PUT | `/ops/brands/:brandId/theme` | OPS | `BrandTokenSet` → 200, or 400 naming the missing tokens and failing contrast pairs | FR-095 |
| GET | `/jobs/:jobId` | owner, OPS | → `{ status, progress, error? }` | II.7 handle |

## Notifications

| Method | Path | Role | Body / Response |
| --- | --- | --- | --- |
| GET | `/notifications` | any | → `Notification[]` (own) |
| POST | `/notifications/:id/read` | owner | → 200 |
