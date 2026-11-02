# 0004. Choose the technology stack

## Status
Accepted, 2026-11-01. Deciders: Tarun (owner), Claude.

## Context
- The reviewer runs one `docker compose up --build` on a 2 GB x86_64 machine: build within 20
  minutes, home page within 5, no secrets or outside accounts.
- The constitution assumes TypeScript, Zod, Prisma, Next.js, Tailwind, and React Aria, and
  requires a separate worker (VIII), PostgreSQL guarantees (`SKIP LOCKED`, partial unique
  indexes, same-transaction outbox), and Redis + BullMQ for outbound delivery (XVIII).
- About 48 hours of build time, with AI agents writing most code: mainstream, well-documented
  tools beat novel ones.

## Decision
We will use one language end to end and the tools below, with major versions pinned.

| Layer | Choice | Main reason | Rejected |
| --- | --- | --- | --- |
| Language, runtime | TypeScript (strict) on Node 24 LTS | Contracts shared at compile time and run time | Bun: less proven with Prisma and Next.js under a 2 GB build |
| Monorepo | pnpm 10 workspaces + Turborepo | The api / worker / web / contracts split (XXI) | Nx: heavier; a single Next.js app: no separate worker |
| API | Express 5 | Team standard; async errors reach the error middleware, so routes need no try/catch | Fastify 5: not the team standard, gain negligible here; tRPC: couples web to api |
| Web | Next.js 16 App Router, React 19, TanStack Query 5 | UI and BFF in one app; `standalone` output keeps the image small | A Vite SPA: loses the BFF cookie boundary |
| Database | PostgreSQL 17 + Prisma 7 | The guarantees VIII, XVIII, and XIX rely on; Prisma named by the constitution | Drizzle: lighter, but not what the constitution names |
| Auth | `jose` JWT + `bcryptjs`, issued by the api | The api is the authority; pure JavaScript, no native build | NextAuth: a second session system in web; argon2: native module risk |
| UI | React Aria Components + Tailwind 4 with CSS-variable tokens | Accessible behaviour (XI); brand values as data (X, XVI) | shadcn/ui: Radix, not React Aria |
| Queue | BullMQ 5 on Redis 7, worker only | Retries, backoff, dead-letter queue for outbound delivery (XVIII) | Polling deliveries from Postgres: contradicts XVIII.2; Debezium: too heavy for 2 GB |
| Tests | Vitest + Testcontainers (Postgres 17, Redis) | Offline unit tier and a real-database tier (XV) | Mocked database only: cannot prove constraints or locks |

- **Pins:** TypeScript 5.9, not 7, because typescript-eslint (which runs the boundary rules) does
  not support 7; Prisma 7 (driver adapters, generated client); pnpm 10
  (`packageManager: pnpm@10.34.9`); Node `>=24`.
- **Redis came late on purpose:** removed in Sprint 0 by the owner ("we don't need redis at this
  point"), returned in Sprint 6 when outbound delivery needed it (T339). Idempotency keys and
  durable jobs stay in Postgres; the api never touches Redis.

## Alternatives considered
- **Per-layer alternatives:** listed in the table, from research.md R1–R7, R12, and R21.
- **A polyglot stack (for example a Go or Python api):** loses shared Zod contracts between web
  and api, and doubles the tooling an agent must get right.

## Consequences
- **Positive:** fits the limits with room. On a real 2 GB EC2 t3.small, cold: build 4.0 min,
  home page 29 s from start, peak 1,695 MiB for the whole machine, no out-of-memory kills. In the
  CI 2 GB simulation: build 3.6 min, peak 1,454 MB.
- **Positive:** integration tests run on real Postgres; one shared template database cut the core
  suite from 170 s to 32–34 s (T401).
- **Negative:** memory is the thin margin (about 210 MiB spare at peak, the Next.js build). The
  Dockerfile must keep `PNPM_MAX_WORKERS=2`, and each Node service needs a heap cap (T391).
- **Negative:** Prisma 7 and Next.js 16 are recent majors; their APIs changed under us (client
  construction, `proxy.ts` replacing middleware).
- **Revisit when:** typescript-eslint supports TypeScript 7; or the build no longer fits 2 GB; or
  load needs a faster HTTP layer, where Fastify is the first swap.

## Evidence
- [research.md](../../specs/001-investor-platform-prototype/research.md) R1–R7, R12, R18, R19, R21
- [package.json](../../package.json), [CLAUDE.md](../../CLAUDE.md) ("Pinned versions"),
  [Dockerfile](../../Dockerfile), [compose.yaml](../../compose.yaml)
- tasks.md T339 (Redis returns), T391 (heap caps from measurements), T401 (template database)
- Study notes 09 (JWT without NextAuth), 15 (generated Prisma client), 24 (no Redis yet), 57 (2 GB
  measurements)
