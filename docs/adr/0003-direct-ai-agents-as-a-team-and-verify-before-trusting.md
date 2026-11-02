# 0003. Direct AI agents as an engineering team, and verify before trusting

## Status
Accepted, 2026-11-01. Deciders: Tarun (owner), Claude.

## Context
- Sprint 9 had to fix the findings of several reviews in one batch: an independent review (F1–F5),
  a code review (SMELL-01 to 08), a test review (TEST-01 to 04), an architecture review
  (OVERKILL-01 to 03), a design review, and findings graded MED and LOW. The owner's instruction:
  "combine them in 1 pr and merge if passed".
- Many of those findings were themselves AI-generated. A confident finding can be wrong, and
  fixing a false finding adds code and risk for nothing.
- One agent working through 44 tasks in sequence is slow, and parallel agents editing the same
  files produce conflicts and silent overwrites.
- Business rules (who may be locked out, what an agent may accept) belong to the business, not to
  whichever agent happens to be fixing the code.

## Decision
We will run AI agents like an engineering team with a lead, and verify every claim before acting.
- **Split by file ownership.** Helper agents work in parallel, each in its own git worktree, and
  each file has one owner per batch. A task that needs another owner's file records it instead of
  editing it ("owned elsewhere this batch", "another change's"). The lead agent reviews each
  helper's commits and cherry-picks them onto the batch branch, one commit per task.
- **Verify before fixing.** Each finding is checked against the code, live behaviour, or Postgres
  first. A false or unnecessary claim is not fixed; it is recorded in the task line as "Not done:"
  with the evidence (T374: the `0.0.0.0` redirect claim was checked live and is false; T380: the
  lock-wait claim was checked on Postgres and is false; T391: the "no Redis integration test"
  claim is false, the tests are named).
- **Tests first.** Every fix comes with a test that fails without it.
- **Record judgement calls for the owner.** Where the agent had to choose, the line says "Decided
  by Claude, for the owner to confirm"; the owner confirms it ("confirmed by the owner", T375,
  T396) or changes it. T370 locked out inactive investors; on review the owner decided only a
  banned login is locked out, and T398 changed it (ADR 0018, ADR 0019).
- **Humans decide business rules.** Agents propose; the owner decides, and the line says so.

## Alternatives considered
- **One agent doing everything in sequence:** no merge conflicts, but too slow for the batch, and
  one long context makes later work worse.
- **Accept review findings as given:** fast, and wrong for every false claim: it adds code, tests,
  and risk that fix nothing.
- **Reject findings silently:** keeps the code small, but the next reviewer raises the same claim,
  and nobody can audit the judgement.

## Consequences
- **Positive:** 44 tasks (T365–T408) landed in one PR (#262) with all checks green. 24 task lines
  record something deliberately not done, with the reason; 14 record a call left for the owner to
  confirm.
- **Positive:** the reasoning is auditable in the repository, not lost in chat history.
- **Positive:** review on the batch's own PR still found real defects (T404–T407), which shows the
  loop of review, verify, and test-first fix working on its own output.
- **Negative:** task lines become long and dense; some read like design notes.
- **Negative:** file ownership blocks some fixes inside a batch; they wait for the next one
  (T390's purge runs in the job loop because the job types were owned elsewhere).
- **Negative:** "for the owner to confirm" items can pile up if the owner does not answer them.
- **Revisit when:** a second human engineer joins, so ownership and confirmation move to code
  owners and PR review; or when unconfirmed calls outlive a sprint.

## Evidence
- Spec documents (available on request): tasks.md Sprint 9 (T365–T408), with "Not done" in T373,
  T374, T376, T379, T380, T386, T391 and owner calls in T375, T396, T398, T403, T408;
  constitution XVII (Spec Kit first, test first, the human judge)
- Commit 349f10d (the Sprint 9 squash, with one entry per task in its message)
