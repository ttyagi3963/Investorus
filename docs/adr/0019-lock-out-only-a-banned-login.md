# 0019. Lock out only a banned login; leave an inactive investor out of matching only

## Status
Accepted, 2026-11-01. Deciders: Tarun (owner), Claude.
Supersedes [ADR 0018](0018-block-an-inactive-investor-from-sign-in-and-acceptance.md). Decided by
the owner on review of T370 (T398).

## Context
- ADR 0018 (T370) treated two different flags as one: `User.active` is the operations ban on a
  login; `Investor.status` (`ACTIVE` or `INACTIVE`) decides whether the investor is matched to new
  packages (FR-024), and the legacy spreadsheet import sets it from its `Active` column (`Y` or
  `N`).
- Under ADR 0018, an investor imported with `Active = N` could not sign in, and any live offer they
  had could never be accepted, even when it was the seller's best.
- The spec's edge case asks for a deactivated investor's offer to be flagged to the agent, not
  removed.
- Sessions are 8-hour JWTs, so a ban needs a check on every request to take effect at once.

## Decision
We will keep the ban as the only lockout. An inactive investor is only left out of matching.
- **Sign-in and every request check only `User.active`** in Postgres. A banned login gets 401 on
  its next request. The check on each request from T370 stays.
- **An INACTIVE investor keeps access.** They are not matched to new packages (FR-024).
- **The agent can accept or promote an inactive investor's offer.** The offer stays flagged
  (`investorActive: false`, shown as "Investor inactive") on the comparison, the offer list, and
  the deal's backups. The seller weighs it, through the agent.
- The comparison's `acceptable` no longer looks at the investor (T404): review of the Sprint 9 PR
  found that the first change still hid Accept and Counter.

**Why (owner).** "Inactive" is a matching status. It often comes from a spreadsheet, and it does
not mean the person is barred. Locking such an investor out strands live offers and takes a
possibly better price away from the seller. Barring a person is what the ban is for.

## Alternatives considered
- **Keep ADR 0018:** locks out investors who did nothing wrong and costs the seller real offers.
- **Allow sign-in but block acceptance:** the investor could make offers that can never win. The
  seller still loses the offer, and the agent gets a button that always fails.
- **Withdraw the offers of an investor marked INACTIVE:** silently removes offers, which the spec
  rules out.

## Consequences
- **Positive:** one lockout tool with one meaning, and it takes effect at once.
- **Positive:** re-importing the legacy file cannot break live deals; the seller keeps every
  choice, and the flag shows the context.
- **Negative:** the platform does not stop the agent from accepting an inactive investor; the flag
  only informs.
- **Negative:** the rule lives in several places (sign-in, the request check, the comparison,
  accept, promote), and T404 shows that one of them can be missed. T404's fix came with a test
  that fails without it.
- **Revisit when:** Clever defines a real offboarding status, for example for compliance (it would
  get its own state and explicit handling of open offers, not a reuse of `INACTIVE`); or SSO
  replaces password sign-in.

## Evidence
- [AuthService.ts](../../packages/core/src/services/auth/AuthService.ts),
  [authenticate.ts](../../apps/api/src/middleware/authenticate.ts),
  [OfferComparisonService.ts](../../packages/core/src/services/offer-comparison/OfferComparisonService.ts)
- [deactivation.int.test.ts](../../packages/core/test/deactivation.int.test.ts),
  [OfferComparisonService.test.ts](../../packages/core/src/services/offer-comparison/OfferComparisonService.test.ts)
- [README.md Prototype Shortcuts](../../README.md#prototype-shortcuts) (the auth row)
- Spec documents (available on request): tasks T370, T398, T404; spec FR-024 and the "Investor
  deactivated" edge case; contracts/investor-import.md (the `Active` column)
