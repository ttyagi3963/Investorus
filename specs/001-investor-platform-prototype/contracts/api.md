# Contract: Platform REST API (`apps/api`)

Base URL: `http://localhost:4000/api/v1`. All shapes are Zod schemas exported from
`@clever/contracts`, and the web BFF calls them through the typed client in that package.
Entity fields are defined in [../data-model.md](../data-model.md).

## Cross-cutting rules

- **Auth**: `Authorization: Bearer <session JWT>` on every route except `POST /sessions`,
  `GET /health`, `GET /brands`, and `GET /brands/:brandId/theme` (the sign-in page renders a brand). A token is accepted only while its user is active and, for
  an investor, the investor is ACTIVE, checked on every request; otherwise 401 (T370). The role is
  checked in the service (III), not the route.
- **Idempotency (XX.2)**: every POST, PUT, and PATCH from a signed-in user requires an
  `Idempotency-Key` header (up to 255 characters). Keys are per user,
  stored in Postgres (plan.md Complexity Tracking), and expire after 24 hours. Sign-in
  (`POST /sessions`) has no user yet and is exempt, so a session token is never stored. The
  typed client sends a fresh key with each call unless it is given one, and the BFF forwards it.
  - Missing key → `400`.
  - Same key and same body → the stored response, with the header `Idempotent-Replay: true`.
  - Same key while the first request is still running (its 30-second lease) → `409` with
    `Retry-After: 1`.
  - Same key after the first request's process died: if nothing committed, the request runs;
    if its change committed but the answer was lost → `409` (`IDEMPOTENCY_ALREADY_APPLIED`);
    the change never runs twice (T367).
  - Same key with a different body → `422` (`IDEMPOTENCY_KEY_REUSED`).
  - A `5xx` answer is not stored, so a retry runs the change again.
  - Key store unavailable → `503` with `Retry-After: 5`.
- **Status codes (II)**: GET 200, create POST 201, async POST 202 with
  `{ jobId, statusUrl }`, PATCH and PUT 200, DELETE 204.
- **Tracing (XII)**: a caller may send a W3C `traceparent` header; the api keeps its trace ID,
  or creates one when the header is missing or malformed. Every response carries the trace ID as
  `X-Request-Id`, and every error body as `requestId`, so support can find the request in the
  logs (`trace_id`).
- **Errors (VII)**: `{ "error": "message", "code": "BUSINESS_RULE", "details"?: {...}, "requestId": "<trace ID>" }`.
  - 400: validation (with `details.fields[]` naming each failing field, FR-012).
  - 401: missing, invalid, or expired session token.
  - 403: forbidden. 404: not found (also returned for investors asking about packages they are
    not matched to, so existence is not leaked).
  - 409: business rule or concurrency conflict. 422: an Idempotency-Key reused for another
    request. 503: idempotency store down.
  - 500: unexpected, with a generic message.
- **Pagination**: `?cursor=&limit=` (default 25, max 100) on list routes. Responses use
  `{ items, nextCursor }`.

## Sessions

| Method | Path | Role | Body / Response | Notes |
| --- | --- | --- | --- | --- |
| POST | `/sessions` | public | `{ email, password }` → 201 `{ token, user }` | Called only by the BFF's `/bff/session`, which stores the token in an HTTP-only cookie; the `/bff/<path>` proxy refuses it (T374) |
| GET | `/me` | any | → `{ user, role, agentId?, investorId? }` | |
| GET | `/health` | public | → `{ status, db, redis }` | Used by compose healthchecks |
| GET | `/brands/:brandId/theme` | public | → `BrandThemeView { brandId, tokenVersion, cssVariables: Record<string,string>, fontFamily: string[], content }`; `ETag: "<brandId>-v<tokenVersion>"`, `Cache-Control: public, max-age=60`, 304 for a matching `If-None-Match`; 404 for an unknown brand | FR-092; the web root layout renders the variables |
| GET | `/brands` | public | → `BrandSummary[] { brandId, displayName, hosts }` | Brand switcher and host mapping (FR-092, FR-093) |

## Listing packages (agent)

| Method | Path | Role | Body / Response | Spec |
| --- | --- | --- | --- | --- |
| GET | `/listing-packages` | AGENT (own), OPS (all) | `?status=` → `AgentPackageSummary[]` (each with `matchedCount`) | Story 2 |
| POST | `/listing-packages` | AGENT | `CreatePackageInput` (seller, property, expectations) → 201 `AgentPackageView` (DRAFT); an address with an active package (any agent) → 409 `DUPLICATE_ACTIVE_LISTING`, with `details.existingPackageId` only if the caller owns it (the same check runs when an edit changes the address) | FR-010, FR-013 |
| GET | `/listing-packages/:id` | AGENT (own), OPS | → `AgentPackageView` (full, with PII, and `matchedCount`: investors matched in the current round) | |
| PATCH | `/listing-packages/:id` | AGENT (own) | `UpdatePackageInput` (partial; `undefined` = unchanged) + `version` → 200 | 202 with a re-match job if a material field changed after publish. Only in DRAFT, ACCEPTING_OFFERS, or NO_OFFERS_RECEIVED, else 409 `PACKAGE_LOCKED`; after publish, 400 names each field publishing needs that the edit would empty (T375) |
| POST | `/listing-packages/:id/publication` | AGENT (own) | `{ offerDeadline?, version }` → 200 `AgentPackageView` (now ACCEPTING_OFFERS; the MATCH_PACKAGE job is queued in the same change and runs in the worker) | 400 lists invalid fields (FR-012) |
| POST | `/listing-packages/:id/withdrawal` | AGENT (own) | `{ version }` → 200 `AgentPackageView` | |
| GET | `/listing-packages/:id/timeline` | AGENT (own) | → `TimelineEntryView[]` (the package's audit entries, newest first, without per-investor match decisions) | Sprint 2 (T297) |
| POST | `/listing-packages/:id/reopening` | AGENT (own) | `{ offerDeadline, version }` → 200 `AgentPackageView` (round + 1, ACCEPTING_OFFERS; the MATCH_PACKAGE job is queued in the same change, as for publication) | FR-058; from NO_OFFERS_RECEIVED or FELL_THROUGH (Sprint 3, T307). Offers the old round left open (backups after a fall-through) are declined and their investors told; 409 `BACKUP_PENDING` while a promoted backup decides (T377) |
| PATCH | `/listing-packages/:id/offer-deadline` | AGENT (own) | `{ offerDeadline, version }` → 200 `AgentPackageView` | Extend the deadline, from ACCEPTING_OFFERS or NO_OFFERS_RECEIVED (Sprint 3, T307); a material edit made while NO_OFFERS_RECEIVED is matched now as the next listing version (T375) |
| POST | `/listing-packages/:id/photo-uploads` | AGENT (own) | `{ contentType, sizeBytes }` → 201 `{ storageKey, upload: UploadInstruction }` | Vendor-neutral `{ url, method, headers, expiresAt }` ([providers.md](./providers.md)); the browser uploads directly (XIV) |
| POST | `/listing-packages/:id/photos` | AGENT (own) | `{ storageKey, position }` → 201 `Photo` | Verifies the object exists. Photo uploads and changes only while the package is editable, else 409 `PACKAGE_LOCKED` (T375) |
| DELETE | `/listing-packages/:id/photos/:photoId` | AGENT (own) | → 204 | 409 `PHOTO_REQUIRED` for a published package's last photo (T375) |
| GET | `/package-form` | AGENT | → `packageFormSteps` config (ordered steps, field keys, required flags) | IX: the package form is config-driven |
| GET | `/listing-packages/:id/matches` | AGENT (own): counts only; OPS: full | → `{ matchedCount, topExclusionReasons[] }` (from the latest `ListingVersion`) or `MatchView[]` (positive matches with `matchedBuyBoxes[]` and their `clauseResults`) | FR-020; edge case "no matches" |

## Investor views

| Method | Path | Role | Body / Response | Spec |
| --- | --- | --- | --- | --- |
| GET | `/investor/packages` | INVESTOR | → `InvestorPackageSummary[]` (matched only, newest first, `offerDeadline`, `myOfferStatus?`) | FR-040 |
| GET | `/investor/packages/:id` | INVESTOR | → `InvestorPackageView` — **no PII fields in the schema**, with `myDeal` (`{ status, reconfirmBy }` of the investor's own deal, or null) and `myOwnTerms` (the investor's own last terms while the agent's counter stands, else null; T377); for the investor whose offer is ACCEPTED on the active or closed deal, → `InvestorPackageView & { sellerContact, streetLine }`, audited PII_ACCESSED | FR-030, FR-031, FR-055 |
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
| PATCH | `/offers/:offerId` | INVESTOR (owner) | `ReviseOfferInput` + `version` → 200 (new revision). For a BACKUP offer, only `expiresAt` may change, and that is allowed after the deadline | FR-042, FR-044; edge case "backup offer expires". After the deadline only a COUNTERED offer may be revised (while the package is ACCEPTING_OFFERS, T377); any other revision is refused `OFFER_DEADLINE_PASSED` |
| POST | `/offers/:offerId/withdrawal` | INVESTOR (owner) | `{ version }` → 200 `OfferView` (ACTIVE, COUNTERED, or BACKUP; allowed after the deadline) | FR-043, FR-054 |
| POST | `/offers/:offerId/counter-response` | INVESTOR (owner) | `{ action: "ACCEPT" \| "DECLINE", version }` → 200 `OfferView`; a revision goes through `PATCH /offers/:offerId` | Story 4, scenario 3 |
| POST | `/offers/:offerId/reconfirmation` | INVESTOR (owner) | `{ action: "CONFIRM" \| "DECLINE" }` → 200 `OfferView` | FR-057 |
| GET | `/offers/:offerId/revisions` | INVESTOR (owner), AGENT (package owner), OPS | → `OfferRevision[]` | |

## Comparison, decisions, deals (agent)

| Method | Path | Role | Body / Response | Spec |
| --- | --- | --- | --- | --- |
| GET | `/listing-packages/:id/offer-comparison` | AGENT (own) | `?sort=netProceeds\|closingDate\|certainty` → `{ rows: OfferComparisonRow[], assumptions }` (each row includes the net-proceeds breakdown) | FR-050, FR-051 |
| POST | `/listing-packages/:id/decisions` | AGENT (own) | `{ type: "ACCEPT"\|"COUNTER"\|"DECLINE_ALL", offerId?, counterTerms?, note?, version }` → 201 `Decision` | FR-052, FR-053 (409 if an offer is already accepted; 409 `INVESTOR_INACTIVE` for the offer of a deactivated investor, T370). `counterTerms` may change any term. DECLINE_ALL after the deadline moves the package to NO_OFFERS_RECEIVED (T377) |
| GET | `/listing-packages/:id/deal` | AGENT (own) | → `DealView` (the package's latest deal) with `allowedNextMilestones[]` and `backups[]`; 404 before any acceptance. The buyer reads their deal's status in `InvestorPackageView.myDeal`; the ops view comes with US6 | FR-055 |
| POST | `/deals/:dealId/milestones` | AGENT (own) | `{ milestone, version }` → 200 `DealView` | 409 with `details.allowedNext` if out of order |
| POST | `/deals/:dealId/fall-through` | AGENT (own) | `{ reason, version }` → 200 `DealView` (with the ranked backups) | FR-056 |
| POST | `/listing-packages/:id/backup-promotions` | AGENT (own) | `{ offerId, version }` → 201 `DealView` (PENDING_RECONFIRMATION); 409 `INVESTOR_INACTIVE` for a deactivated investor's backup (T370) | FR-057 |

## Operations

| Method | Path | Role | Body / Response | Spec |
| --- | --- | --- | --- | --- |
| GET | `/ops/listing-packages` | OPS | → `OpsPackageRow[]`: each package with its round's matched and offer counts and its deliveries pending, retrying, and needing attention | FR-071, FR-073 |
| GET | `/ops/listing-packages/:id/trace` | OPS | → `PackageTrace`: the package, counts (buy boxes evaluated, matched, delivered, needing attention, offers), each matched investor (boxes with versions, the match notice's delivery, their offer), the active investors not matched, and the timeline (audit entries and deliveries, newest first) | FR-073 |
| GET | `/ops/listing-packages/:id/matches/:investorId` | OPS | → `MatchExplanation`: `{ matched, listingVersion, source: "STORED" \| "REPLAYED", replayedWithNewerRules, buyBoxes: [{ buyBoxId, name, version, active, matched, criteria: [{ key, label, passed, expected, actual }] }] }` | FR-074; a match returns the stored decision; a non-match is replayed against the listing version and each box as it was then |
| GET | `/ops/deliveries` | OPS | `?status=` (optional) → `DeliveryView[]`, newest 200 (recipient: the investor's company or "CRM") | FR-071 |
| POST | `/ops/deliveries/:id/retry` | OPS | → 202; 409 unless the delivery needs attention; audited | FR-071 |
| POST | `/ops/deliveries/retry-all` | OPS | `{ target? }` → 202 `{ count }` (every NEEDS_ATTENTION delivery back to PENDING) | FR-071, SC-007 |
| POST | `/ops/match-digests` | OPS | → 202 `{ jobId }` (enqueues `SEND_MATCH_DIGESTS` now; demo aid, the daily run is unchanged) | FR-023 |
| GET | `/ops/crm-comparison` | OPS | → `[{ packageId, streetLine, platformStatus, crmStatus, inSync, pendingDelivery: { id, status } \| null }]` (published packages) | FR-078 |
| GET | `/ops/simulations` | OPS | → `{ crm, messaging, storage }` modes | FR-075 |
| PUT | `/ops/simulations/:service` | OPS | `{ mode: "up"\|"down"\|"slow"\|"garbage" }` → 200 with every mode; audited | FR-075 |
| POST | `/ops/investor-imports` | OPS | `{ storageKey, fileName }` (CSV uploaded by the browser with the `UploadInstruction`) → 202 `{ jobId, batchId }` | FR-061 |
| POST | `/ops/investor-imports/uploads` | OPS | `{ sizeBytes }` → 201 `{ storageKey, upload: UploadInstruction }` | Same instruction shape as photo uploads |
| GET | `/ops/investor-imports/:batchId` | OPS | → `ImportBatch & { rows: ImportRowResult[] }` | |
| GET | `/ops/config` / PUT `/ops/config/:key` | OPS | `ConfigEntry` (value validated by the per-key schema) | FR-051, IX |
| GET | `/ops/brands/:brandId/tokens` | OPS | → `{ brandId, tokenVersion, tokens }` (the DTCG file the editor shows) | FR-093 |
| PUT | `/ops/brands/:brandId/theme` | OPS | `{ tokens, tokenVersion }` (the version the editor loaded) → 200 `BrandThemeView` at `tokenVersion + 1`, audited `BRAND_THEME_UPDATED`; 400 with each failure in `details.fields` (`{ field, message }`: the missing variable, `tokens` for an unsafe value or broken alias, or the pair such as `text-muted on background-surface` with its ratio); 409 if the brand changed since that version | FR-093, FR-095 |
| GET | `/jobs/:jobId` | owner, OPS | → `{ status, progress, error? }` | II.7 handle |

## Notifications

| Method | Path | Role | Body / Response |
| --- | --- | --- | --- |
| GET | `/notifications` | any | → `Notification[]` (own) |
| POST | `/notifications/:id/read` | owner | → 204 |
