# 0006. Abstract only where a swap is real

## Status
Accepted, 2026-11-01. Deciders: Tarun (owner), Claude.

## Context
- ADR 0005 puts adapters behind ports. That invites a second question: which ports should promise
  that the thing behind them can really be replaced, and which are only seams for testing?
- In the prototype every outside service is a sandbox stand-in, because no outside accounts are
  allowed. In production the CRM, email and SMS, and storage will be vendors (HubSpot,
  SendGrid or Twilio, S3). Those swaps are certain.
- The database is different. The design relies on PostgreSQL features the constitution requires:
  `SKIP LOCKED` job claims, partial unique indexes (one active deal per package, one active job
  per key), the outbox in the same transaction, CHECK constraints, and the immutable audit
  trigger.
- An early draft claimed "swap PostgreSQL for MongoDB by changing one line", and a study note
  claimed a one-line MySQL swap. Both overclaim.
- CLAUDE.md: build only what the current task uses.

## Decision
We will put a port where a swap is planned or needed for tests, and claim only the swap we can
show.
- **Storage:** `IStorageProvider` with two working adapters: the sandbox (the default, used by the
  demo) and `S3StorageProviderImpl` (T274–T275), chosen by `STORAGE_PROVIDER` in the api and
  worker containers. The S3 adapter is unused by the demo and goes against "build only what the
  task uses"; the owner approved it as a deviation (2026-11-01) to show a real second adapter.
- **CRM and messaging:** `ICrmProvider` and `IMessagingProvider` with sandbox implementations
  only. A vendor swap is one new adapter class plus an env change; the HubSpot adapter is not
  built, and the docs say so.
- **Database:** `IDatabase` (T276) claims only an ORM or driver swap (Prisma to Drizzle or raw
  `pg`): new `*Impl` files, mappers, and one line in each container. Leaving PostgreSQL is a
  non-goal; T403 corrected the port's comments to say exactly that.
- **Single-implementation service interfaces** (`IListingPackageService` and others) are kept for
  the constitution's naming (V) and consistent test doubles. We treat them as convention, not as
  a swap point; keeping them was decided with the owner on the architecture review (T403).
- **Seams for tests and time:** `IClock` (a fake clock in tests), `IGeoProvider` (a static ZIP list
  today), `IErrorReporter` (logs today, Sentry later).

## Alternatives considered
- **Abstract everything, including a "swappable database":** promises a portability the design
  deliberately gives up, and leads readers to underestimate a migration.
- **Abstract nothing:** vendor SDKs and errors leak into services; every vendor change touches
  business rules, and the unit tier needs a network.
- **Describe the storage swap in docs only:** shows the port but not that a second adapter fits it
  (rejected by the owner, plan.md Complexity Tracking).

## Consequences
- **Positive:** the storage swap is demonstrated, not asserted: a presigned S3 `PUT` signs the
  exact `Content-Type` and `Content-Length`, tested with a mocked S3 client, no AWS in CI.
- **Positive:** the claims in code comments, research.md, and the README match what the code does.
- **Negative:** the S3 adapter is code the reviewer never runs; it must be maintained, and its CSP
  and env wiring touched other files (T389, T397).
- **Negative:** single-implementation interfaces add files that buy no swap.
- **Negative:** a database migration is still large work (schema rules, data), whatever the port
  says.
- **Revisit when:** a vendor adapter is built for production (add contract tests per adapter); or
  a service interface gains a second implementation, or is shown to cost more than it helps.

## Evidence
- [research.md](../../specs/001-investor-platform-prototype/research.md) R9, R10, R22 (the
  "Corrected" table: the MongoDB and "zero code changes" HubSpot rows), R23 (anti-corruption layer)
- [plan.md](../../specs/001-investor-platform-prototype/plan.md) Complexity Tracking (the S3 row)
- tasks.md T274–T276, T389, T397, T403
- [packages/core/src/unit-of-work/IDatabase.ts](../../packages/core/src/unit-of-work/IDatabase.ts),
  [packages/core/src/providers/storage/](../../packages/core/src/providers/storage/)
- Study notes 21 (storage swappability), 38 (S3 presigned uploads), 39 (database behind one port;
  its MySQL claim predates the T403 correction)
