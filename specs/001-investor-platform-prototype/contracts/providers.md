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
| `IStorageProvider` | `createUpload(key, contentType, sizeBytes)` → `Promise<UploadInstruction>`, `getPublicUrl(key)` → `string` (a photo's permanent public address, T326), `stat(key)` → `{ contentType, sizeBytes }` or `null` (the api records a photo's type and size from storage, not from the client), `read(key)` (server-side read, used by the CSV import), `put(key, body, contentType)` (server-side write, used only by the seed) | `SandboxStorageProviderImpl` (HMAC-signed URLs) | api, worker | `STORAGE_PROVIDER=sandbox` | `S3StorageProviderImpl` (presigned PUT, `STORAGE_PROVIDER=s3`) |
| `ICrmMirrorReader` | `listListings()` (read-only) | `SandboxCrmMirrorReaderImpl` | api (ops CRM comparison) | `CRM_PROVIDER=sandbox` | `HubspotCrmMirrorReaderImpl` |
| `ISellerContactReader` | `getForPackage(packageId)` | `PrismaSellerContactReaderImpl` (decrypts; caller audits `PII_ACCESSED`) | worker (CRM delivery only) | — | same |
| `IGeoProvider` | `lookup(zip)` → `{ city, state, neighborhood }`, or `null` for a ZIP outside the reference set | `StaticGeoProviderImpl` (bundled ZIP list for the seeded markets) | api, worker | — | USPS / Smarty impl |
| `ISimulationControlProvider` | `get()`, `set(service, mode)` | `SandboxSimulationProviderImpl` | api | — | none in production |
| `IErrorReporter` | `report(error, context)` | `LogErrorReporterImpl` | api, worker | `ERROR_REPORTER=log` | `SentryErrorReporterImpl` |
| `IClock` | `now()` | `SystemClockImpl` (`FakeClock` in tests) | all | — | `SystemClockImpl` |
| `IPiiCipher` | `encrypt(text)`, `decrypt(blob)` | `AesGcmPiiCipherImpl` (key from validated env); injected into repository adapters | api, worker | — | KMS-backed impl |
| `IUnitOfWork` | `run(work: (repos) => Promise<T>)` | `PrismaUnitOfWorkImpl` (one interactive transaction) | api, worker | — | same |
| `IDatabase` (T276) | `uow` (the `IUnitOfWork` above), `check()`, `dispose()` | `PostgresDatabaseImpl` (the Prisma client, `PrismaUnitOfWorkImpl`, `SELECT 1`, disconnect); built in one line of each app's `container.ts` | api, worker | — | any database: a new `IDatabase` implementation plus that one line |

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
- `/storage/objects/*` sends CORS headers for `WEB_ORIGIN` only (`PUT`, `GET`, `OPTIONS`;
  `Content-Type`), because the browser uploads cross-origin from port 3000 to port 4100.
- The api never trusts the upload itself. It calls `stat(key)` before recording a photo or
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
| PUT | `/storage/objects/:key?size=&exp=&sig=` | Accepts an upload only with a valid, unexpired signature for that key, its `Content-Type`, and its exact size (403 otherwise; 413 when larger, 400 when smaller). |
| GET | `/storage/objects/:key` | Serves a photo (a key under `packages/`) to anyone, with no signature, as the S3 bucket policy does (T326); any other key gets 403. |
| HEAD | `/internal/storage/objects/:key` | The stored object's `Content-Type` and `Content-Length`, or 404 (internal; the `x-sandbox-token` header must carry `SANDBOX_INTERNAL_TOKEN`, else 401). |
| GET / PUT | `/internal/storage/objects/:key` | Server-side `read(key)` / `put(...)` (internal; shared token). |
| GET / PUT | `/simulation`, `/simulation/:service` | Mode per service: `up`, `down` (503), `slow` (10 s delay), or `garbage` (200 with malformed JSON). Persisted in the `sandbox` schema. |
| GET | `/` | HTML inspection page: CRM records, messages, current modes. |

Sandbox persistence lives in its own PostgreSQL schema, `sandbox`, which platform code never
reads directly. Storage objects are the exception: they are files on the `SANDBOX_STORAGE_DIR`
volume, named by a hash of the key (T252). The sandbox is the "outside world".
