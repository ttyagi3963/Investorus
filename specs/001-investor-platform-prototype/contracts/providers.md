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
| `ICrmProvider` | `upsertListingStatus(record, idempotencyKey)` | `SandboxCrmProviderImpl` | worker | `CRM_PROVIDER=sandbox` | `HubspotCrmProviderImpl` (private-app access token) |
| `IMessagingProvider` | `sendEmail(msg, key)`, `sendSms(msg, key)` | `SandboxMessagingProviderImpl` | worker | `MESSAGING_PROVIDER=sandbox` | SendGrid / Twilio impls |
| `IStorageProvider` | `createUpload(key, contentType, maxBytes)` → `UploadInstruction`, `getReadUrl(key)`, `exists(key)`, `read(key)` (server-side read, used by the CSV import), `put(key, body, contentType)` (server-side write, used only by the seed) | `SandboxStorageProviderImpl` (HMAC-signed URLs) | api, worker | `STORAGE_PROVIDER=sandbox` | `S3StorageProviderImpl` (presigned PUT) |
| `ICrmMirrorReader` | `listListings()` (read-only) | `SandboxCrmMirrorReaderImpl` | api (ops CRM comparison) | `CRM_PROVIDER=sandbox` | `HubspotCrmMirrorReaderImpl` |
| `ISellerContactReader` | `getForPackage(packageId)` | `PrismaSellerContactReaderImpl` (decrypts; caller audits `PII_ACCESSED`) | worker (CRM delivery only) | — | same |
| `IGeoProvider` | `isValidZip(zip)`, `lookup(zip)` | `StaticGeoProviderImpl` (bundled ZIP list for the seeded markets) | api, worker | — | USPS / Smarty impl |
| `ISimulationControlProvider` | `get()`, `set(service, mode)` | `SandboxSimulationProviderImpl` | api | — | none in production |
| `IErrorReporter` | `report(error, context)` | `LogErrorReporterImpl` | api, worker | `ERROR_REPORTER=log` | `SentryErrorReporterImpl` |
| `IClock` | `now()` | `SystemClockImpl` (`FakeClock` in tests) | all | — | `SystemClockImpl` |
| `IPiiCipher` | `encrypt(text)`, `decrypt(blob)` | `AesGcmPiiCipherImpl` (key from validated env); injected into repository adapters | api, worker | — | KMS-backed impl |
| `IUnitOfWork` | `run(work: (repos) => Promise<T>)` | `PrismaUnitOfWorkImpl` (one interactive transaction) | api, worker | — | same |

The api container never receives `ICrmProvider` or `IMessagingProvider`. Outbound calls happen
only in the worker's delivery consumers, after the outbox (XVIII). The api's only CRM access is
the read-only `ICrmMirrorReader`.

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
- The sandbox implementation returns `PUT {PUBLIC_SANDBOX_URL}/storage/objects/:key?sig=&exp=`.
  An S3 implementation would return a presigned `PUT` with its required headers. MinIO or other
  storage containers are deliberately not used, because of the 2 GB memory limit.
- `/storage/objects/*` sends CORS headers for `WEB_ORIGIN` only (`PUT`, `GET`, `OPTIONS`;
  `Content-Type`), because the browser uploads cross-origin from port 3000 to port 4100.
- The api never trusts the upload itself. It calls `exists(key)` before recording a photo or
  starting an import.

Rules for every provider:
- Every call has a 5 s timeout.
- Failures are thrown as `InfrastructureError` (never raw SDK or HTTP errors, IV).
- Responses are validated with Zod, and a malformed response is an `InfrastructureError` (VI).

## Sandbox HTTP API (`apps/sandbox`, port 4100)

| Method | Path | Behavior |
| --- | --- | --- |
| PUT | `/crm/listings/:packageId` | Upsert `{ status, round, offerCount, acceptedPrice?, sellerContact, occurredAt }`. Deduplicated by `Idempotency-Key`. Stale `occurredAt` → 409. |
| GET | `/crm/listings` | All CRM records (for ops comparison and the inspection page). |
| POST | `/messages/email`, `/messages/sms` | Captures the message; deduplicated by `Idempotency-Key`. |
| GET | `/messages` | Captured messages, newest first. |
| PUT | `/storage/objects/:key?sig=&exp=` | Accepts an upload only with a valid, unexpired HMAC signature and an allowed content type and size. |
| GET | `/storage/objects/:key?sig=&exp=` | Serves the object. |
| HEAD | `/storage/objects/:key` | Existence check (internal; shared token). |
| GET / PUT | `/internal/storage/objects/:key` | Server-side `read(key)` / `put(...)` (internal; shared token). |
| GET / PUT | `/simulation`, `/simulation/:service` | Mode per service: `up`, `down` (503), `slow` (10 s delay), or `garbage` (200 with malformed JSON). Persisted in the `sandbox` schema. |
| GET | `/` | HTML inspection page: CRM records, messages, current modes. |

Sandbox persistence lives in its own PostgreSQL schema, `sandbox`, which platform code never
reads directly. The sandbox is the "outside world".
