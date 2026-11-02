# 0019. Lock out only a banned login; an inactive investor is only left out of matching

## Status
Accepted, 2026-11-01. Supersedes ADR-0018.
Decided by the owner on review of T370 (T398).

## Context
- ADR-0018 (T370) treated two different flags as one:
  - `User.active` is the operations ban on a login.
  - `Investor.status` (`ACTIVE` or `INACTIVE`) decides whether the investor is matched to new packages (FR-024). The legacy spreadsheet import sets it from its `Active` column (`Y` or `N`).
- Under ADR-0018, an investor imported with `Active = N` could not sign in. Any live offer they had could never be accepted, even when it was the seller's best.
- The spec's edge case asks for a deactivated investor's offer to be flagged to the agent, not removed.
- Sessions are 8-hour JWTs, so a ban needs a check on every request to take effect at once.

## Decision
We will keep the ban as the only lockout. An inactive investor is only left out of matching.
- **Sign-in and every request check only `User.active`** in Postgres. A banned login gets 401 on its next request. The check on each request from T370 stays.
- **An INACTIVE investor keeps access.** They are not matched to new packages (FR-024).
- **The agent can accept or promote an inactive investor's offer.** The offer stays flagged (`investorActive: false`, shown as "Investor inactive") on the comparison, the offer list, and the deal's backups. The seller weighs it, through the agent.
- The comparison's `acceptable` no longer looks at the investor (T404). Review of the Sprint 9 PR found that the first change still hid Accept and Counter.

**Why (owner).** "Inactive" is a matching status. It often comes from a spreadsheet, and it does not mean the person is barred. Locking such an investor out strands live offers and takes a possibly better price away from the seller. Barring a person is what the ban is for.

## Alternatives considered
- **Keep ADR-0018:** it locks out investors who did nothing wrong and costs the seller real offers.
- **Allow sign-in but block acceptance:** the investor could make offers that can never win. The seller still loses the offer, and the agent gets a button that always fails.
- **Withdraw the offers of an investor marked INACTIVE:** it silently removes offers, which the spec rules out.

## Consequences
- **Positive:**
  - One lockout tool with one meaning, and it takes effect at once.
  - Re-importing the legacy file cannot break live deals.
  - The seller keeps every choice, and the flag shows the context.
- **Negative:**
  - The platform does not stop the agent from accepting an inactive investor. The flag only informs.
  - The rule lives in several places (sign-in, the request check, the comparison, accept, promote), and T404 shows that one of them can be missed. T404's fix came with a test that fails without it.
- **Revisit when:**
  - Clever defines a real offboarding status, for example for compliance. It would get its own state and explicit handling of open offers, not a reuse of `INACTIVE`.
  - SSO replaces password sign-in.

## Evidence
- [tasks.md T370, T398, T404](../../specs/001-investor-platform-prototype/tasks.md)
- [spec.md FR-024 and the "Investor deactivated" edge case](../../specs/001-investor-platform-prototype/spec.md)
- [contracts/investor-import.md, `Active` column](../../specs/001-investor-platform-prototype/contracts/investor-import.md)
- [plan.md Prototype Shortcuts (auth row)](../../specs/001-investor-platform-prototype/plan.md)
- [ADR-0018](0018-block-an-inactive-investor-from-sign-in-and-acceptance.md)
