## Task

T___ — <!-- the task ID from specs/001-investor-platform-prototype/tasks.md -->

Closes #___ <!-- the task's board issue; closes it, and moves its card to Done, on merge to main -->

## What changed

<!-- One or two sentences on the outcome, then the main changes. -->

## How it was tested

<!-- The commands you ran and what they showed (for example `pnpm test`, `pnpm test:integration`,
     `docker compose up --build`, scripts/submission/rehearse.sh), and anything checked by hand. -->

## Constitution checklist

- [ ] Tests were written first and fail without the change (XVII.2); no global fake timers (XV)
- [ ] Each test guards a rule that matters; none re-test a library, the type checker, or a
      rule already covered (XV, test selection)
- [ ] Dependencies point inward; `*Impl` classes are imported only in `container.ts` (I, XIV)
- [ ] Routes only translate; services validate input with Zod and own the rules (II, III, VI)
- [ ] No seller PII in events, logs, or investor views; sensitive actions are audited (XII)
- [ ] Outbound calls go through the outbox, in the same transaction (XVIII)
- [ ] No brand names, colors, or copy hard-coded; UI stays accessible (X, XI, XVI)
- [ ] Any deviation is recorded under Complexity Tracking in plan.md, with its approval
- [ ] tasks.md is updated: the task is marked `[X]` when done
