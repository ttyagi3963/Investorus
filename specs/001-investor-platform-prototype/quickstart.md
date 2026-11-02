# Quickstart & Validation Guide: Investor Platform Prototype

How to prove the prototype meets [spec.md](./spec.md). API shapes are in
[contracts/api.md](./contracts/api.md), event behavior in
[contracts/events.md](./contracts/events.md), and entities in
[data-model.md](./data-model.md).

## Prerequisites

- **Reviewer path**: Docker Engine with Compose v2 on x86_64 Linux. Nothing else.
- **Developer path**: Node.js 24+, pnpm 10+ (`npm i -g pnpm`), and Docker (for the integration
  tier).

## Start (reviewer path, FR-001 to FR-004)

```bash
unzip investor-platform.zip -d ip && cd ip
docker compose up --build
```

Then open:

| URL | What |
| --- | --- |
| http://localhost:3000 | Home page: what the demo shows, demo accounts, where to start |
| http://localhost:4000/api/v1/health | API health (`{ status: "ok", db: "ok" }`; the api does not use Redis, only the worker does) |
| http://localhost:4100 | Sandbox: the stand-in CRM records, captured emails and SMS, outage switches |

Demo accounts (also listed in the README):

| Role | Email | Password |
| --- | --- | --- |
| Agent | `avery@example.com` | `demo1234` |
| Agent | `blake@example.com` | `demo1234` |
| Investor | `summit@example.com` | `demo1234` |
| Investor | `harbor@example.com` | `demo1234` |
| Investor | `ridge@example.com` (buy box deliberately narrow) | `demo1234` |
| Operations | `morgan@example.com` | `demo1234` |

## Validation scenarios

### V1 — Startup within the reviewer's limits (Story 1, SC-001)

```bash
docker compose down -v && docker builder prune -af
time docker compose build                     # expect < 20 min
docker compose up -d && time ./scripts/wait-for-home.sh   # expect < 5 min; polls / until 200
docker stats --no-stream                      # total RSS expected around 0.8 GB (research R19)
```

Run the build at least once on a 2 GB x86_64 VM, or with `docker run --memory=2g`, before
submitting. Restart with `docker compose restart` and confirm the sample data counts are
unchanged (FR-003).

### V2 — Publish → match → privacy (Story 2, SC-003, SC-006)

1. Log in as `avery@example.com` → **New package**. Use the sample address shown in the form hint
   (Austin 78704, single-family, Fair condition), upload one photo, and publish.
2. Expected: status "Accepting offers". The match count shown is the seeded number
   (`seed/expected-matches.json`), and the sandbox shows one email per matched investor within
   1 minute. `summit@example.com` has two buy boxes that both fit; it gets **one** email that names
   both boxes (FR-022).
3. Log in as `ridge@example.com` (excluded). The package is not listed, and opening its URL
   returns "not found".
4. As `morgan@example.com` → package → **Why not matched?** for `ridge@example.com`. Each of its buy boxes
   is listed with its failing criteria and expected and actual values. The answer is replayed
   from the package and buy box versions live at publish time, not read from a stored failure
   row (FR-074).
5. Log in as `summit@example.com`, open the package, and confirm no seller name, phone, email, or
   street line appears in the page or in the BFF JSON response (browser dev tools).

### V3 — Offers, duplicates, deadline (Story 3, SC-004, SC-009)

1. As `summit@example.com`, submit an offer, then revise it. The agent sees one offer at the
   latest revision (every revision is stored; a history view is not built, T150).
2. Send the same POST twice with the same `Idempotency-Key` (curl recipe in the README). The
   second response has `Idempotent-Replay: true`, and only one offer exists.
3. No seeded package is past its deadline: extend a package's deadline to a few minutes ahead,
   let it pass, then submit. Submitting is refused with an explanation.

### V4 — Compare, accept, track to close, backup (Story 4, SC-005, SC-010, SC-011)

1. As `blake@example.com`, open the seeded package at 48 Maple Ave, which has 4 offers →
   **Compare**. Sort by net
   proceeds; each row's breakdown matches the formula in data-model.md.
2. Accept the top offer. The winner sees the seller contact details (an audit entry is written),
   and the others see "Backup offer".
3. Move the deal Under contract → Inspection, then try "Closed" directly. It is refused, and the
   allowed next steps are listed.
4. Mark it fell through (reason: "Inspection: foundation"). Promote the best backup, log in as
   that investor, and reconfirm. The deal is back at "Offer accepted".
5. Race test: `pnpm test:integration -- accept-race` runs two simultaneous accepts, and exactly
   one succeeds.

### V5 — Buy box and legacy import (Story 5)

1. As `harbor@example.com`, set Min Price above Max Price. The save is refused, and the field is
   named. Clear every property type: the save is refused ("leave it blank for any").
2. As `ridge@example.com`, add a second buy box with ZIP code 78745, which covers Blake's seeded
   package (still accepting offers) that ridge's narrow first box does not fit. Within 1 minute
   the package appears on ridge's dashboard and in the in-app inbox, with no email or SMS in the
   sandbox. The daily digest email (FR-023) arrives with the outbox in Story 6 (see plan.md
   Complexity Tracking).
3. Pause that second box, then publish a package only it would fit. Ridge is not matched.
4. As `morgan@example.com` → **Investor imports** → upload `seed/legacy-investors.csv`. The summary
   shows 26 imported and 4 rejected, each with a row reason. Each imported investor has one
   buy box named "Legacy Import", marked default. Import the file again: 0 imported, 26
   updated, 4 rejected, and still one default buy box per investor (FR-061).

### V6 — Outage, recovery, CRM sync (Story 6, SC-007, SC-008, SC-012)

1. As `morgan@example.com` → **Simulations** → set CRM to `down` and Messaging to `garbage`.
2. As an agent, publish a package and accept an offer on another package. Both actions succeed.
3. Ops → **Failed jobs** shows them as Retrying. Wait until they reach **Needs attention**
   (about 5 minutes with the default retry budget, `ConfigEntry["deliveryRetry"]`, which the
   worker reads at startup).
4. Set both services back to `up`. Press **Retry all** for the needs-attention items; pending
   ones retry on their own.
   Within 5 minutes, **CRM comparison** shows every package in sync, and the sandbox shows no
   duplicate messages (each idempotency key appears once).
5. Restart test: during step 3, run `docker compose restart worker`. No delivery is lost or
   duplicated afterwards.
6. Ops → **Packages** → the package. Its trace shows who matched and whether their notice
   arrived, why another investor was not matched, and a timeline of every status change, offer,
   and delivery with its outcome.

### V7 — Design system and white-label switch (FR-090 to FR-097, SC-013 to SC-015)

1. Open http://localhost:3000/design-system. Every semantic token, component, and template
   renders for the `clever` brand.
2. Put the page next to cleveroffers.com. Colors, type, and spacing match (SC-013).
3. Use the brand switcher to choose `larkspur` (or open http://partner.localhost:3000). Every screen, including logged-in agent,
   investor, and ops pages, changes palette, radius, logo, and footer, with no restart or code
   change (FR-092, FR-093).
4. As `morgan@example.com`, submit a token set whose muted text fails contrast against the card
   surface. It is rejected, and the failing pair and ratio are named (FR-095).
5. Run `pnpm lint`. No raw hex values, arbitrary Tailwind values, or default palette classes
   are found (SC-014). `pnpm test` includes the per-brand contrast test (SC-015).
6. Keyboard-only pass: tab through the package wizard. Focus is visible on every control, and a
   screen reader announces each step change (FR-096).

## Developer test commands (XV, XVII.2)

```bash
pnpm install
pnpm test               # unit tier: offline, no Docker
pnpm test:integration   # integration tier: Testcontainers PostgreSQL + Redis (Docker required)
pnpm lint               # boundary rules: no Prisma in apps/web, no cross-app imports,
                        # @clever/core/adapters and @prisma/client only in container.ts / *Impl.ts,
                        # no deep imports past package barrels
pnpm typecheck
```

Expected: all green. The integration tier covers the checklist in research R18, including the
fast-check property test proving the SQL pre-filter never drops a buy box the evaluator would
match (constitution XIX.4).
