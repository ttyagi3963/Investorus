# 0013. Protect seller privacy by design

## Status
Accepted, 2026-11-01. Deciders: Tarun (owner), Claude.

## Context
- Agents enter the seller's name, email, phone, and street address. Investors must not see any of
  it before acceptance (SC-006: 0 instances); the winning investor sees the seller's contact,
  audited (FR-031). Operations may need the street to support a listing.
- Constitution XII and XX.1: seller PII encrypted at rest, masked at the outbound serializer,
  redacted from logs and error reports, and every access to unmasked data audited.
- Seller details travel further than the database: logs, error reports, stored delivery failures,
  the audit log (which can never be changed), outbox payloads, and idempotency's stored answers.
- The street must stay unique per active listing (FR-013) even though it is encrypted.

## Decision
We will make leaks hard to write rather than rely on care at each call site:
- **Encrypt at rest in the repository layer.** AES-256-GCM, a random 12-byte IV per value, and a
  key-version prefix (`v1:` with the demo key), for the seller's name, email, and phone and the
  property's street line. Only the repository layer (mappers and `*Impl` repositories) encrypts
  and decrypts; services and views never see ciphertext. Free text an agent writes (a
  fall-through reason, a decision note) and idempotency's stored answers use the same cipher.
- **Find duplicates with a keyed hash.** HMAC-SHA256 of the normalized street and ZIP, with a
  partial unique index that frees the address once a package is withdrawn or closed. The
  repository query and its test double share one list of address-freeing statuses that matches
  the index (T369); a lost race maps to the same 409 (T383).
- **Views by allow-list, PII-free by type.** `InvestorPackageView` has no seller or street field at
  all; `WinningInvestorPackageView` adds them only for the investor whose offer was accepted, from
  acceptance through closing. Every response view names its fields. Contract tests check that no
  investor view and no outbox event schema has a PII key (T295, T336).
- **Audit every read of unmasked data.** `PII_ACCESSED` for the winner's read, the CRM send's read
  of the seller contact (at send time, never in the event; ADR 0009), and operations reading
  addresses.
- **Keep tokens out of the browser.** The BFF holds the session token in an HttpOnly cookie
  (ADR 0005).
- **Redact where text leaves.** `redactPii` on error-report context, on worker job payloads in
  error logs, and on every audit entry's `details`; `scrubPiiText` on error text and on
  `Delivery.lastError`; pino redacts auth headers and cookies (T382, ADR 0014). Ordinary log lines
  are not scrubbed: code logs IDs, not values, and a test checks that.

## Alternatives considered
- **Database or disk encryption only (TDE):** protects a stolen disk, not a database dump or a
  compromised application reading rows. `pgcrypto` puts key handling in SQL (R11).
- **A Prisma client extension for encryption:** hides it from the repository code, the one place
  that sees both the ORM type and the domain type (R11).
- **Generic serializers that strip known fields:** a field added to a domain type would reach the
  browser by default. A separate view type makes forgetting impossible.
- **Trust log hygiene:** a Postgres unique violation quotes the value
  (`Key (email)=(…) already exists`), so error text must be scrubbed, not trusted.

## Consequences
- **Positive:** the PII-at-rest test reads raw rows and finds only ciphertext; the end-to-end test
  runs publish to close with a failed delivery and finds no seeded seller name, email, phone, or
  street in any log line (T361, T382).
- **Negative:** encrypted columns cannot be searched or sorted; every lookup needs its own hash,
  and the hash treats "St" and "Street" as different until an address service canonicalizes them.
- **Negative:** text scrubbing is best effort (emails and phone formats the app accepts, not a
  street inside free prose); the real defense is that the database only holds ciphertext.
- **Negative:** the demo key is in the committed `.env` (no secrets allowed), and there is no TLS
  on localhost or the Compose network (a recorded deviation from XII).
- **Revisit when:** going to production: keys move to a KMS with envelope encryption and rotation
  through the version prefix, and TLS terminates at the load balancer.

## Evidence
- [AesGcmPiiCipherImpl.ts](../../packages/core/src/providers/pii-cipher/AesGcmPiiCipherImpl.ts),
  [address-hasher.ts](../../packages/core/src/providers/pii-cipher/address-hasher.ts),
  [investor-views.ts](../../packages/contracts/src/listing-package/investor-views.ts),
  [redact-pii.ts](../../packages/core/src/errors/redact-pii.ts)
- [pii-at-rest.int.test.ts](../../packages/core/test/pii-at-rest.int.test.ts),
  [investor-views.test.ts](../../packages/contracts/src/listing-package/investor-views.test.ts),
  [events.pii.test.ts](../../packages/contracts/src/events/events.pii.test.ts),
  [full-loop.int.test.ts](../../packages/core/test/full-loop.int.test.ts)
- [README.md Prototype Shortcuts](../../README.md#prototype-shortcuts) (keys in `.env`, plain
  HTTP)
- Spec documents (available on request): research R11, R12; constitution XII, XX.1; spec SC-006,
  FR-013, FR-031; plan.md Complexity Tracking (TLS); tasks T295, T298, T336, T341, T361, T369,
  T374, T382, T383
