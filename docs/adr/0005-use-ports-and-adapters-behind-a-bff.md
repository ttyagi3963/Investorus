# 0005. Use ports and adapters behind a BFF

## Status
Accepted, 2026-11-01. Deciders: Tarun (owner), Claude.

## Context
- Two server processes, the api and the worker, must run the same business rules: a deadline job
  in the worker and an agent's request in the api change the same offers and deals.
- Every outside service (CRM, email and SMS, storage) is a sandbox stand-in in the prototype and a
  vendor in production. Business rules must not care which.
- Business rules must be testable offline (constitution XV): no database, network, or containers
  in the unit tier.
- The browser must never hold the session token: a token readable by JavaScript can be stolen by
  any injected script (XII).
- With AI agents writing most code, a shortcut import (Prisma in a route, an adapter in a service)
  is easy to make and hard to spot in review.

## Decision
We will use a hexagonal core (constitution I) and put the Next.js app in front as a BFF.
- **Layers:** contracts → services → repository and provider ports → adapters. Routes only
  translate: read the request, call one service method, send the status code. Services take
  `(actor, input: unknown)`, validate with Zod, check role and ownership, and own every rule.
- **Ports in `packages/core`:** one repository port per entity, plus provider ports
  (`IStorageProvider`, `ICrmProvider`, `IMessagingProvider`, `IClock`, `IPiiCipher`, ...). Prisma
  types appear only in `*Impl` files and mappers.
- **One composition root per server app:** `apps/api/src/container.ts` and
  `apps/worker/src/container.ts` are the only files that import `@clever/core/adapters`. They build
  the adapters and services by manual constructor injection (no DI framework, no decorators), and
  routers are factories that receive services. Inside the core, an adapter may build its own parts
  (the Prisma unit of work builds its repositories), and the seed script builds the few it needs.
  The sandbox and web apps use no core adapters, so they have no container.
- **Outbound calls only through the outbox.** The api container builds no CRM or messaging sender;
  only the worker does (ADR 0009). The api holds just the sandbox's outage switch and CRM read-out
  for the operations console.
- **Lint enforces it:** `boundaries.js` restricts `@clever/core/adapters` to `container.ts`, Prisma
  to `*Impl.ts`, `infra/`, and the schema folder (mappers may import its types only), keeps apps
  from importing each other, and keeps `apps/web` and `packages/ui` away from server-only code.
- **BFF:** the browser calls `/bff/*` on the Next.js server, which keeps the api's JWT in an
  HttpOnly, SameSite=Lax cookie (Secure over HTTPS) and forwards it as a bearer token. State
  changes require a same-origin `Origin`. The catch-all proxy refuses `/bff/sessions`, whose answer
  carries the token, in any letter case, and empty, `.`, and `..` segments (T374).

## Alternatives considered
- **Layered MVC with Prisma in routes or controllers:** fewer files, but rules end up in two apps,
  unit tests need a database, and a vendor change touches business code.
- **A DI container (NestJS, InversifyJS):** less wiring code, but hides wiring behind decorators
  and reflection, which the constitution forbids.
- **The browser calls the api directly with the token in JavaScript storage:** removes the BFF
  hop, but any XSS can read and exfiltrate the token.

## Consequences
- **Positive:** api and worker share every service and repository through `packages/core`. Unit
  tests run on in-memory repositories (167 core unit tests at T391, all offline). A shortcut import
  fails CI.
- **Positive:** an XSS cannot take the session token away; the api remains the single auth
  authority for web, worker, and curl.
- **Negative:** more files and indirection than calling Prisma directly: a port, an `*Impl`, a
  mapper, and an in-memory double per entity.
- **Negative:** the in-memory fakes can drift from Postgres. Locking, constraints, and SQL are
  tested only on Postgres, with no shared contract suite yet (T403, ADR 0020).
- **Negative:** every browser call takes an extra hop through the web server.
- **Revisit when:** the in-memory fakes and Prisma repositories disagree in a bug (add the shared
  contract suite); or the api must serve third-party clients directly (then it needs its own token
  handling, not the BFF's).

## Evidence
- [boundaries.js](../../packages/config/eslint/boundaries.js),
  [apps/api/src/container.ts](../../apps/api/src/container.ts),
  [apps/worker/src/container.ts](../../apps/worker/src/container.ts),
  [apps/web/src/bff/proxy.ts](../../apps/web/src/bff/proxy.ts),
  [apps/web/src/bff/shared.ts](../../apps/web/src/bff/shared.ts) (cookie and origin check)
- Spec documents (available on request): constitution I, II, III, IV, XII, XXI; research R12
  (sessions) and R22 (ports, barrels, composition roots, and the corrected blueprint); tasks T004
  (boundary lint), T374 (BFF proxy), T389 (full-origin CSRF check), T403
