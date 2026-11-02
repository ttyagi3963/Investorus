# 0021. Migrate by strangling the legacy workflow, one workflow and one cohort at a time

## Status
Accepted, 2026-11-02. Deciders: Tarun (owner), Claude.

## Context
- Clever Offers runs today on Zapier, Google Sheets, HubSpot, Lovable apps, and manual operations.
  It drives revenue, but business logic is spread across those tools, data is duplicated, much of
  it is tribal knowledge, and failures are hard to diagnose. It is a brownfield, not a greenfield.
- Revenue must keep flowing while the platform takes over. Five engineers also run every existing
  service, so the migration cannot need a second team or a freeze.
- Rules hidden in a Zap step, a sheet formula, or someone's habit are invisible until a deal
  breaks. A rewrite that replaces everything at once loses them silently.
- Rolling back the application is not rolling back the data: once the platform accepts an offer,
  switching users back to the old tools loses that offer unless the recovery carries it back.
- Before any of this, the concierge pilot keeps a shadow record of every state change. That work
  should become the first step of the migration, not be thrown away.

## Decision
We will replace today's tools one workflow at a time, and move each workflow one cohort at a time,
while the old tools keep running (the strangler fig pattern):
1. **A facade routes each opportunity.** At lead intake, every opportunity gets a canonical ID and
   a route, legacy or platform, that never changes mid-deal; every Zap checks the route first. The
   facade holds no rules and translates nothing. Shifting traffic means changing who gets the
   platform route: Los Angeles first, then more markets, then everyone.
2. **An adapter layer translates.** Legacy formats (HubSpot fields, sheet columns, webhooks) are
   translated into the platform's model at the edge, so they never reach the business rules
   (ADR 0005). The legacy investor CSV import already works this way: old column names and values
   are mapped, every rejected row is reported with its reason, and a retried import skips the rows
   already done (T322).
3. **Six steps, each ending on an exit check:**
   - map the records, Zaps, formulas, and apps with the people who run them;
   - shadow, with the platform deciding but sending nothing while a daily report explains every
     difference;
   - backfill and reconcile fields and relationships, not row counts;
   - move write ownership;
   - cut over by cohort;
   - retire the old path.
4. **One writer per field.** For a moved workflow the platform is the only writer, and HubSpot
   receives one-way updates through the outbox (ADR 0009). The CRM keeps only the newest update,
   so a late retry never overwrites newer data (T339, T380). The operations console compares the
   platform with the CRM's copy.
5. **Schemas change by expand, migrate, contract.** Migrations are forward-only and checked for
   drift, and the api is versioned (`/api/v1`), so old and new code can run against one database
   during a rollout.
6. **Old and new run in parallel, in three stages per workflow.** Legacy acts while the platform
   shadows; then the platform acts while HubSpot mirrors; then the platform runs alone. Each stage
   ends on its exit check, not a date. A time cap agreed up front forces a decision to fix,
   narrow, or stop.
7. **Every cutover has a rehearsed recovery** for offers already accepted. Failure is rehearsed
   with the sandbox's outage switches (T338), and nothing is lost or sent twice meanwhile (the
   outbox, ADR 0009; idempotent requests, ADR 0011).

## Alternatives considered
- **Big-bang rewrite and cutover:** one date when everything moves. It loses the rules nobody
  wrote down, and a failure has no fallback but the old tools, which no longer hold the new data.
- **Keep the tools and automate further inside them (more Zaps, more sheets):** the cheapest step
  now, but it deepens the problems of spread-out logic and hard-to-diagnose failures.
- **Two-way sync between HubSpot and the platform:** two writers for the same fields, which brings
  conflicts, loops, and no answer to which value is true.
- **Move a whole market at once, every workflow together:** a larger blast radius, and a failure
  in one workflow forces a rollback of all of them.

## Consequences
- **Positive:** the business keeps running throughout, and every step can be undone until the
  retire step.
- **Positive:** hidden rules surface in the shadow comparison before anyone depends on the platform.
- **Positive:** the pilot's shadow record and the no-regret investments (canonical IDs, milestone
  logging, a reconciliation check) become the first steps instead of being thrown away.
- **Negative:** running two systems costs Operations time and needs reconciliation tooling. The
  daily comparison report and the inbound adapters for Zapier and HubSpot webhooks are not built
  yet.
- **Negative:** the route check must be added to every Zap that touches an opportunity. That needs
  discipline, and a Zap that skips it is a second writer.
- **Revisit when:** mapping shows the tools hold little logic, so a faster cutover is safe; or the
  cost of parallel running outgrows its benefit; or a workflow cannot be routed per opportunity.

## Evidence
- [InvestorImportWorkflow.ts](../../packages/core/src/workflows/investor-import/InvestorImportWorkflow.ts),
  [parse-legacy-csv.ts](../../packages/core/src/workflows/investor-import/parse-legacy-csv.ts),
  [investor-import.int.test.ts](../../packages/core/test/investor-import.int.test.ts),
  [legacy-investors.csv](../../seed/legacy-investors.csv)
- [ICrmProvider.ts](../../packages/core/src/providers/crm/ICrmProvider.ts),
  [OutsideServicesService.ts](../../packages/core/src/services/ops/OutsideServicesService.ts)
- [prisma-check.mjs](../../packages/core/scripts/prisma-check.mjs),
  [simulation.ts](../../apps/sandbox/src/simulation.ts),
  [outage-recovery.int.test.ts](../../packages/core/test/outage-recovery.int.test.ts)
- Architecture view 6 (the migration path) and section R 6.7 of the proposal's reasoning
- Spec documents (available on request): tasks T322, T338, T339, T380
