# 0016. Build one matching engine from a criterion registry, and make every decision explainable

## Status
Accepted, 2026-11-01. Deciders: Tarun (owner), Claude.

## Context
- Matching is the core of the product. A published or materially edited package is checked against every active buy box (FR-020). A saved buy box is checked against every open package (FR-023).
- The criteria are a fixed set of 13: geography, property type, price, year built, beds, baths, square feet, units, condition, repair estimate, closing speed, listed status, and programs. They come from Clever's investor application and seller intake, with no user-written formulas (FR-021, constitution XIX).
- A blank criterion means "any". A listing value that a criterion needs but is missing fails that criterion (FR-025).
- Operations must be able to see why an investor was or was not matched, box by box, against the versions that were live when matching ran (FR-074).
- Offer windows default to 72 hours. A package must reach investors in seconds, not at the next batch run.
- The prototype had a 48-hour budget.

## Decision
We will define each criterion once and run every match through one engine. That engine records its reasons.
- **The Criterion Registry (XIX, R8).** One `CRITERION_KEYS` list holds 13 keys.
  - The definition of each criterion lives in `@clever/contracts`: its label, Zod schema, form metadata, and the listing fields it reads.
  - Its evaluator lives in `packages/core/src/registry/`.
  - Each layer is a `Record` over the key list, so a criterion missing from any layer fails the build.
  - The buy box editor, the api, and the CSV import all use the same composed schema.
  - The values are typed columns with database CHECKs.
- **Two stages.**
  - Stage 1 is one SQL query. It narrows by the hard cuts (the investor is active, the proof of funds is unexpired, the box is active) and by geography.
  - Stage 2 runs every evaluator and returns `{ key, label, passed, expected, actual }` for each criterion.
  - The owner approved deferring two pieces of XIX on 2026-10-31: the per-criterion SQL fragments (T052) and the fast-check property test (T217). Stage 1 is narrower than XIX asks for, so it cannot drop a match: every box that passes the hard cuts goes to the full evaluator (plan.md, Complexity Tracking).
- **Durable jobs, triggered by events (R24).**
  - `MATCH_PACKAGE` is written in the same transaction as one of these changes, together with its listing version snapshot: a publish, a material edit, a reopen, or a deadline extension after an edit made while the package had no offers (T375).
  - `MATCH_BUY_BOX` is written when a box's criteria or status change. Its new matches go to the dashboard and the daily digest, never to an instant message.
  - Workers claim jobs with `FOR UPDATE SKIP LOCKED`. A stale version does nothing.
- **Every decision is stored with its reasons.**
  - Each decision is a `MATCH_DECISION` audit entry. It holds every criterion's result, the boxes and versions, the listing version, and `EVALUATOR_VERSION`, with no personal details.
  - Every re-evaluation of an investor matched before records a decision for the new listing version (T383).
  - "Why?" reads only the decisions for the package's current listing version.
  - A non-match is replayed against the versions that were live at the time. If the rules have changed since then, the answer is flagged.
- **Notices.** Each investor gets one notice per round, naming every box that matched (FR-022). After a material edit, an investor who was told before hears again only if a field their boxes check has changed since the version they were last told about. That includes an investor who no longer fits (T366).

## Alternatives considered
- **Hard-coded matching (`if/else` in services):** XIX.1 forbids it. Without a registry, the form, the validation, the pre-filter, and the explanation drift apart.
- **Rules as data (JSON Logic in JSONB):** this was the v5.0.0 design. Criteria would live in three places that can drift, and a new criterion still needs a schema and form change (R8; XIX.5 reserves it for computed rules).
- **An ML ranking:** investors set hard limits and expect them to be honored. FR-074 needs a per-criterion "why", and the prototype has no outcome data to learn from.
- **Everything in SQL:** an explanation with expected and actual values would need either a second implementation or SQL that is hard to test. The TypeScript evaluator is unit-tested offline, and SQL stays an optimization that the safety property must constrain.

## Consequences
- **Positive:**
  - A new criterion is added in one place, and the build fails if any layer misses it.
  - The editor, the api, and the import cannot disagree.
  - A crash never loses a matching run.
  - Operations can answer "Why?" for the current version, box by box, with expected and actual values.
- **Negative:**
  - Stage 1 does not narrow by price or the other criteria, so the evaluation cost grows linearly with the number of boxes. That is fine at a few hundred boxes.
  - XIX.4's property test is still owed.
  - Decisions live in audit entries rather than a queryable table.
  - A buy box save re-matches every open package in one job (plan.md, Prototype Shortcuts).
- **Revisit when:**
  - The number of boxes makes full evaluation slow. Then write the SQL fragments (T052) and the property test (T217) together.
  - Operations needs to query non-matches at scale. Then build the MatchEvaluation table (T121, T126).
  - Non-engineers need computed rules. Then amend XIX.5.

## Evidence
- [Constitution XIX](../../.specify/memory/constitution.md)
- [research.md R8, R24](../../specs/001-investor-platform-prototype/research.md)
- [plan.md Complexity Tracking (XIX.3–XIX.4, FR-074 rows)](../../specs/001-investor-platform-prototype/plan.md)
- [tasks.md T293, T320, T321, T366, T375, T383, T406](../../specs/001-investor-platform-prototype/tasks.md)
- [spec.md FR-020 to FR-025, FR-074](../../specs/001-investor-platform-prototype/spec.md)
- [criteria.ts](../../packages/contracts/src/buy-box/criteria.ts)
- Study notes 42, 47, 48 (local, git-excluded)
