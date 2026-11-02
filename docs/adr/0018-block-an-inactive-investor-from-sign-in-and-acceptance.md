# 0018. Block an inactive investor from signing in and from having offers accepted

## Status
Superseded by [ADR 0019](0019-lock-out-only-a-banned-login.md), 2026-11-01. Deciders: Tarun
(owner), Claude.
Decided by Claude in T370 and recorded for the owner to confirm; the owner changed it on review
(T398).

## Context
- Sessions are 8-hour JWTs. Before T370, a deactivated login kept working until its token expired.
- The spec's edge case "Investor deactivated while holding an active offer" says the offer is
  flagged to the agent rather than silently removed.
- FR-024: only active investors are matched.
- Two flags exist: `User.active`, the operations ban on a login; and `Investor.status` (`ACTIVE`
  or `INACTIVE`), which the legacy import sets from its `Active` column.

## Decision
We will treat an INACTIVE investor as offboarded (T370).
- Sign-in, every request, and `/me` check in Postgres that the user is active. For an investor's
  login, they also check that the investor is ACTIVE. Either failure gets 401 at once, instead of
  up to 8 more hours of access.
- A deactivated investor's offer stays visible to the agent, flagged `investorActive: false` on the
  comparison, the offer list, and the deal's backups.
- That offer cannot be accepted or promoted (409 `INVESTOR_INACTIVE`).

Reasoning at the time: an investor the business has stopped working with should not be able to
sign in or close a deal, and "deactivated" should take effect at once (XII).

## Alternatives considered
- **Wait for the token to expire:** a deactivated investor keeps up to 8 hours of access.
- **A token revocation list:** more moving parts than one indexed read per request.
- **Withdraw the offer automatically:** the spec says to flag the offer, not silently remove it.

## Consequences
- **Positive:** deactivation takes effect on the next request, and the agent sees the flag.
- **Negative:** it merges two meanings: a banned person and an investor who is not currently
  matched.
- **Negative:** an investor imported with `Active = N` was locked out, and their live offers could
  never be accepted. The seller lost those offers.
- **Revisit when:** the owner reviews it. He did, the same day, and replaced it with ADR 0019.

## Evidence
- [deactivation.int.test.ts](../../packages/core/test/deactivation.int.test.ts) (now tests the
  ADR 0019 rule)
- Spec documents (available on request): tasks T370 and T398; spec FR-024 and edge cases;
  contracts/investor-import.md (the `Active` column)
