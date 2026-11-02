# 0016. Build one matching engine from a criterion registry, and make every decision explainable

## Status
Accepted, 2026-11-01. Deciders: Tarun (owner), Claude.

## Context
- Matching is the core of the product. A published or materially edited package is checked against
  every active buy box (FR-020); a saved buy box is checked against every open package (FR-023).
  With 72-hour offer windows, a package must reach investors in seconds, not at a nightly batch.
- The criteria are a fixed set of 13 (geography, property type, price, year built, beds, baths,
  square feet, units, condition, repair estimate, closing speed, listed status, programs), with no
  user-written formulas (FR-021, constitution XIX). A blank criterion means "any"; a listing value
  a criterion needs but is missing fails it (FR-025).
- Operations must be able to see why an investor was or was not matched, box by box, against the
  versions that were live when matching ran (FR-074).

## Decision
We will define each criterion once and run every match through one engine that records why.
- **The Criterion Registry (XIX, R8).** One `CRITERION_KEYS` list holds the 13 keys. Each
  criterion's definition (label, Zod schema, form metadata, the listing fields it reads) lives in
  `@clever/contracts`; its evaluator lives in `packages/core/src/registry/`. Each layer is a
  `Record` over the key list, so a criterion missing from any layer fails the build. The buy box
  editor, the api, and the CSV import use the same composed schema; the values are typed columns
  with database CHECKs.
- **Two stages.** Stage 1 is one SQL query that narrows by the hard cuts (the investor is active,
  the proof of funds is unexpired, the box is active) and by geography. Stage 2 runs every
  evaluator and returns `{ key, label, passed, expected, actual }` per criterion. The owner
  approved deferring two parts of XIX on 2026-10-31: per-criterion SQL fragments (T052) and the
  property-based test (T217). Stage 1 is narrower than XIX asks for, so it cannot drop a match:
  every box that passes the hard cuts reaches the full evaluator.
- **Durable jobs, triggered by events (R24, ADR 0010).** `MATCH_PACKAGE` is written in the same
  transaction as a publish, a material edit, a reopen, or a deadline extension after an edit made
  while the package had no offers (T375), with its listing version snapshot. `MATCH_BUY_BOX` is
  written when a box's criteria or status change; its new matches go to the dashboard and the daily
  digest, never to an instant message. A stale version does nothing.
- **Every decision is stored with its reasons.** Each decision is a `MATCH_DECISION` audit entry
  holding every criterion's result, the boxes and versions, the listing version, and
  `EVALUATOR_VERSION`, with no personal details. Every re-evaluation of an investor matched before
  records a decision for the new listing version (T383). "Why?" reads only the decisions for the
  package's current listing version; a non-match is replayed against the versions live at the time,
  and flagged if the rules have changed since (ADR 0014).
- **Notices.** One per investor per round, naming every box that matched (FR-022). After a
  material edit, an investor told before hears again only if a field their boxes check has changed
  since they were last told, including one who no longer fits (T366).

## Alternatives considered
- **Hard-coded matching (`if/else` in services):** XIX.1 forbids it. Without a registry, the form,
  the validation, the pre-filter, and the explanation drift apart.
- **Rules as data (JSON Logic in JSONB):** the design before constitution 6.0.0. Criteria would
  live in three places that can drift, and a new criterion still needs a schema and form change
  (R8).
- **An ML ranking:** investors set hard limits and expect them to be honored. FR-074 needs a
  per-criterion "why", and the prototype has no outcome data to learn from.
- **Everything in SQL:** an explanation with expected and actual values would need a second
  implementation or SQL that is hard to test; the TypeScript evaluator is unit-tested offline.

## Consequences
- **Positive:** a new criterion is added in one place, and the build fails if any layer misses it;
  the editor, the api, and the import cannot disagree; a crash never loses a matching run;
  operations can answer "Why?" box by box, with expected and actual values.
- **Negative:** Stage 1 does not narrow by price or the other criteria, so evaluation cost grows
  linearly with the number of boxes (fine at a few hundred); XIX.4's property test is still owed.
- **Negative:** decisions live in audit entries rather than a queryable table, and a buy box save
  re-matches every open package in one job (recorded prototype shortcuts).
- **Revisit when:** the number of boxes makes full evaluation slow (then write the SQL fragments,
  T052, and the property test, T217, together); operations needs to query non-matches at scale
  (then build the MatchEvaluation table, T121, T126); or non-engineers need computed rules (then
  amend XIX.5).

## Evidence
- [criteria.ts](../../packages/contracts/src/buy-box/criteria.ts),
  [evaluators.ts](../../packages/core/src/registry/evaluators.ts),
  [MatchingWorkflow.ts](../../packages/core/src/workflows/matching/MatchingWorkflow.ts),
  [publish-and-match.int.test.ts](../../packages/core/test/publish-and-match.int.test.ts),
  [buy-box-candidates.int.test.ts](../../packages/core/test/buy-box-candidates.int.test.ts),
  [README.md Prototype Shortcuts](../../README.md#prototype-shortcuts)
- Spec documents (available on request): constitution XIX; research R8, R24; plan.md Complexity
  Tracking (the XIX.3–XIX.4 and FR-074 rows); spec FR-020 to FR-025, FR-074; tasks T293, T320,
  T321, T366, T375, T383, T406
