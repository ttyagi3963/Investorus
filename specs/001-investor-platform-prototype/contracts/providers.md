# Contract: Provider Ports and the Sandbox Stand-in Service

Constitution XIV. Domain code depends only on these interfaces, which are defined in
`packages/core`. Each app's composition root picks the implementation from environment
variables. The prototype ships the `Sandbox*Impl` implementations, which call `apps/sandbox`
over HTTP. Swapping in a real vendor means writing **one new `*Impl` class** in
`packages/core/src/providers/<port>/` and changing an env value. Services, routes, the outbox,
and retries are untouched (research R22).

Ports are exported from `@clever/core`. Implementations are exported only from
`@clever/core/adapters`, which lint allows only in `container.ts` files.

## Ports (TypeScript signatures, summarized)

| Port | Methods | Prototype implementation | Wired in | Selected by | Production target |
| --- | --- | --- | --- | --- | --- |
| `ICrmProvider` | `upsertListing(record, idempotencyKey)` → `"APPLIED" \| "STALE"` (the record carries the status snapshot, the seller's contact, `occurredAt`, and the event's `sequence`) | `SandboxCrmProviderImpl` | worker | `CRM_PROVIDER=sandbox` | `HubspotCrmProviderImpl` (private-app access token) |
| `IMessagingProvider` | `sendEmail(msg, key)`, `sendSms(msg, key)` | `SandboxMessagingProviderImpl` | worker | `MESSAGING_PROVIDER=sandbox` | SendGrid / Twilio impls |
| `IStorageProvider` | `createUpload(key, contentType, sizeBytes)` → `Promise<UploadInstruction>`, `getPublicUrl(key)` → `string` (a photo's permanent public address, T326), `stat(key)` → `{ contentType, sizeBytes }` or `null` (the api records a photo's type and size from storage, not from the client), `read(key, maxBytes)` (server-side read, used by the CSV import; an object over `maxBytes` is refused without reading past the limit), `readHead(key, bytes)` (a photo's first bytes, checked against its type at attach, T384), `put(key, body, contentType)` (server-side write, used only by the seed) | `SandboxStorageProviderImpl` (HMAC-signed URLs) | api, worker | `STORAGE_PROVIDER=sandbox` | `S3StorageProviderImpl` (presigned PUT, `STORAGE_PROVIDER=s3`) |
| `ICrmMirrorReader` | `listListings()` (read-only) | `SandboxSimulationProviderImpl` (the sandbox's `GET /crm/listings`) | api (ops CRM comparison) | `CRM_PROVIDER=sandbox` | `HubspotCrmMirrorReaderImpl` |
| `IDeliveryQueue` / `IDeliveryConsumer` | `enqueue(deliveryIds)`; `startConsumer(dispatcher, options)` (its `dispatch`, and `giveUp` once a job has thrown on every try), `close()` | `BullMqDeliveryQueueImpl` (BullMQ on Redis; `jobId` = the delivery's ID; dead-letter queue `deliveries-dlq`) | worker | — | same |
| `IGeoProvider` | `lookup(zip)` → `{ city, state, neighborhood }`, or `null` for a ZIP outside the reference set | `StaticGeoProviderImpl` (bundled ZIP list for the seeded markets) | api, worker | — | USPS / Smarty impl |
| `ISimulationControlProvider` | `get()`, `set(service, mode)` | `SandboxSimulationProviderImpl` | api | — | none in production |
| `IErrorReporter` | `report(error, context)` | `LogErrorReporterImpl` | api, worker | `ERROR_REPORTER=log` | `SentryErrorReporterImpl` |
| `IClock` | `now()` | `SystemClockImpl` (`FakeClock` in tests) | all | — | `SystemClockImpl` |
| `IPiiCipher` | `encrypt(text)`, `decrypt(blob)` | `AesGcmPiiCipherImpl` (key from validated env); injected into repository adapters | api, worker | — | KMS-backed impl |
| `IUnitOfWork` | `run(work: (repos) => Promise<T>)` | `PrismaUnitOfWorkImpl` (one interactive transaction) | api, worker | — | same |
| `IDatabase` (T276) | `uow` (the `IUnitOfWork` above), `check()`, `dispose()` | `PostgresDatabaseImpl` (the Prisma client, `PrismaUnitOfWorkImpl`, `SELECT 1`, disconnect); built in one line of each app's `container.ts` | api, worker | — | any database: a new `IDatabase` implementation plus that one line |

The api container never receives `ICrmProvider`, `IMessagingProvider`, or the delivery queue.
Outbound calls happen only in the worker's delivery consumer, after the outbox (XVIII). The api's
only CRM access is the read-only `ICrmMirrorReader`.

The seller's contact for a CRM update is read through the unit of work (the seller repository
decrypts it) by the delivery dispatcher, which audits the read (`PII_ACCESSED`); no separate
seller-contact port was needed (Sprint 6).

### Upload instruction (vendor-neutral, decided 2026-10-30)

`createUpload()` returns a plain instruction, not a vendor URL format or SDK object:

```ts
type UploadInstruction = {
  url: string;                      // absolute URL the browser sends the file to
  method: "PUT" | "POST";
  headers: Record<string, string>;  // e.g. { "Content-Type": "image/jpeg" }; sent as-is
  expiresAt: string;                // ISO time; after it, request a new instruction
};
```

- The **browser** performs the upload with plain `fetch(url, { method, headers, body: file })`.
  The file bytes never pass through `apps/web` (the BFF) or `apps/api` (XIV: no proxying).
- The sandbox implementation returns `PUT {PUBLIC_SANDBOX_URL}/storage/objects/:key?size=&exp=&sig=`,
  where `sig` is the hex HMAC-SHA256, with `STORAGE_SIGNING_KEY`, of
  `<METHOD>\n<key>\n<contentType>\n<sizeBytes>\n<exp>` (`exp` in Unix seconds). Core signs and
  the sandbox checks the same string, so a link cannot be reused for another object, type, size,
  or time.
- **Photos are public** (T326, the owner's decision on 2026-11-01): `getPublicUrl(key)` is the
  object's plain address, with no signature or expiry, so a photo link never breaks. Only keys under
  `packages/` (listing photos) are readable this way: the sandbox refuses any other key, and the S3
  bucket policy grants `s3:GetObject` on `packages/*` only, so import files (`imports/`, which hold
  investors' emails) stay private.
- **The size is exact** (T275), because a presigned S3 `PUT` can pin one `Content-Length` but not a
  maximum. The sandbox behaves the same way: a body larger than the signed size gets 413, and a
  smaller one gets 400. `stat` after the upload remains the real size check.
- `S3StorageProviderImpl` (`STORAGE_PROVIDER=s3`, with `S3_BUCKET` and `S3_REGION`; credentials
  from the AWS environment variables) returns a presigned `PUT` that signs `Content-Type` and
  `Content-Length`. `stat` is `HeadObject`. Signing is async, so `createUpload` returns a Promise.
  MinIO or other storage containers are deliberately not used, because of the 2 GB memory limit.
- `/storage/objects/*` sends CORS headers only for an origin listed in `WEB_ORIGIN`
  (comma-separated, one per brand host; `PUT`, `GET`, `OPTIONS`; `Content-Type`), echoing that
  origin with `Vary: Origin`, because the browser uploads cross-origin from port 3000 to port 4100.
- The api never trusts the upload itself. It calls `stat(key)` before recording a photo or
  starting an import.

Rules for every provider:
- Every call has a 5 s timeout. For storage it covers reading the body too, and S3 calls are
  aborted at 5 s (T384).
- Failures are thrown as `InfrastructureError` (never raw SDK or HTTP errors, IV).
- Responses are validated with Zod, and a malformed response is an `InfrastructureError` (VI).

## Sandbox HTTP API (`apps/sandbox`, port 4100)

| Method | Path | Behavior |
| --- | --- | --- |
| PUT | `/crm/listings/:packageId` | Upsert `{ status, round, offerCount, acceptedPrice: int \| null, sellerContact: { fullName, email \| null, phone \| null }, occurredAt, sequence }` (internal; shared token). Needs `Idempotency-Key` (400 without one); a repeated key replays the stored answer without applying. 200 `{ result: "APPLIED" }`; a stored record with the same or a higher `sequence` → 409 `{ code: "STALE" }`, also stored under the key (T380; `occurredAt` is kept for display). 400 on a bad body. |
| GET | `/crm/listings` | `{ listings: [...] }`, newest update first, seller contact included (the CRM's copy), for the ops CRM comparison (internal; shared token, since it holds seller contacts). The inspection page shows the records without the contact. |
| POST | `/messages/email` `{ to, subject, body }`, `/messages/sms` `{ to (E.164), body }` | Captures the message (internal; shared token). Needs `Idempotency-Key`; a repeated key returns the stored answer and stores nothing. 201 `{ id }`; 400 on a bad body. |
| GET | `/messages?limit=` | `{ messages: [...] }`, newest first; `limit` 1–500, default 100. Open. |
| PUT | `/storage/objects/:key?size=&exp=&sig=` | Accepts an upload only with a valid, unexpired signature for that key, its `Content-Type`, and its exact size (403 otherwise; 413 when larger, 400 when smaller). |
| GET | `/storage/objects/:key` | Serves a photo (a key under `packages/`) to anyone, with no signature, as the S3 bucket policy does (T326); any other key gets 403. Sent with `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'; sandbox`, so a served file is never run as a page (T384). |
| HEAD | `/internal/storage/objects/:key` | The stored object's `Content-Type` and `Content-Length`, or 404 (internal; the `x-sandbox-token` header must carry `SANDBOX_INTERNAL_TOKEN`, else 401). |
| GET / PUT | `/internal/storage/objects/:key` | Server-side `read(key)` / `put(...)` (internal; shared token). The internal HEAD and GET name their object in `x-object-key` (the URL-encoded key); core treats a 200 without it, such as garbage mode's, as a garbled answer: an `InfrastructureError` (502), never the object's metadata or bytes (T384). |
| GET / PUT | `/simulation`, `/simulation/:service` | `GET` (open) → `{ crm, messaging, storage }`. `PUT` `{ mode }` (internal; shared token) sets one service's mode and answers with all of them; 404 for an unknown service. Modes: `up`, `down` (503 `{ error: "Simulated outage" }`), `slow` (10 s delay, then the normal answer), or `garbage` (200 with cut-off JSON; nothing is applied). A mode applies to its service's routes only: CRM writes, message posts, and the storage object routes; the read-outs and `/` are never affected. Persisted in the `sandbox` schema; read at most 1 s stale. |
| GET | `/` | HTML inspection page (open, refreshes every 5 s): current modes, CRM records, and the latest 50 messages, every value HTML-escaped. |

Internal routes need the `x-sandbox-token` header to equal `SANDBOX_INTERNAL_TOKEN` (compared in
constant time; 401 otherwise). Writes are deduplicated on the delivery's ID sent as
`Idempotency-Key`, in the same transaction as the change; a key's answer is kept per route, so the
same key on another route is a new request (T392).

Sandbox persistence lives in its own PostgreSQL schema, `sandbox` (same database as the platform;
the sandbox creates its tables at startup), which platform code never reads directly. Storage
objects are the exception: they are files on the `SANDBOX_STORAGE_DIR` volume, named by a hash of
the key (T252). The sandbox is the "outside world".
