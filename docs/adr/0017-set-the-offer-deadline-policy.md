# 0017. Set the offer deadline policy

## Status
Accepted, 2026-11-01. Deciders: Tarun (owner), Claude.

## Context
- Each package has one offer round. It ends at a deadline the agent sets, 72 hours by default. The agent may extend the deadline or close the round early (spec, Key Entities).
- FR-044: the system must refuse new offers and revisions after the deadline.
- FR-052: the agent records the seller's decision, which is to accept one offer, counter one, or decline all.
- FR-057 and FR-058: after a fall-through, the agent promotes a backup, or reopens or withdraws the package.
- Sprint 3 decided that the deadline closes the round, not the package. With offers on the table, the package stays ACCEPTING_OFFERS and the agent can still decide.
- The Sprint 9 review found paths that left people stuck (T377):
  - A decline-all after the deadline left the package with no way forward.
  - An investor could not answer a counter that arrived after the deadline.
  - A seller who wanted none of the backups after a fall-through had no way out.

## Decision
We will treat the deadline as the moment the seller starts reviewing. After it, investors cannot act on their own, and the agent leads any further negotiation.
- **Nothing unsolicited after the deadline.** No new offers, and no revisions the investor starts (FR-044).
- **The agent can counter any offer.** The investor may answer the counter after the deadline while the package is ACCEPTING_OFFERS: accept its terms, return to their own terms, or revise. That answer is part of the seller's decision, not a new bid (T377).
- **The agent can extend the deadline** from ACCEPTING_OFFERS or NO_OFFERS_RECEIVED. This lets every investor improve. An edit made while the package had no offers is matched on the extension (T375).
- **The agent can reopen for a new round** from NO_OFFERS_RECEIVED or FELL_THROUGH. The round number goes up by one, and the package is matched again. Each declined backup investor is told. After a fall-through, the agent can reopen or withdraw whenever no promoted backup is still deciding (T377).
- **Decline-all.** After the deadline, it moves the package to NO_OFFERS_RECEIVED, so the package can be extended, reopened, or withdrawn. Before the deadline, it leaves the round open for new offers (T377).
- **Backups.** A backup investor may still extend their own offer's expiry after the deadline. Only `expiresAt` may change (data-model.md).

**Why (agreed by the owner and Claude, 2026-11-01).** An open rule that lets investors improve at any time turns the round into a waiting game. Investors hold back, wait to see whether they are outbid, and then raise. First offers go down, and the seller loses the pressure the deadline was meant to create. The seller gets the best value when the seller controls the negotiation. The seller then chooses who gets a second chance: one investor (a counter), everyone (an extension), or a fresh market (a reopen).

## Alternatives considered
- **A hard deadline with no negotiation after it:** it meets FR-044 literally, but it strands the deal. The seller cannot counter a near-miss offer, and T377 found the dead ends this leaves (decline-all with no exit, an unanswerable counter).
- **Open bidding after the deadline:** investors could improve until the seller accepts. This needs FR-044 changed. It rewards investors who wait and punishes those who bid well early, which lowers first offers.

## Consequences
- **Positive:**
  - Investors have a reason to put their best offer in before the deadline.
  - Every state after the deadline leads to a decision: accept, counter, extend, reopen, or withdraw. Each fix in T377 has a test that fails without it.
  - The investor's view shows the investor's own last terms next to a counter, so they know what "keep my terms" means.
- **Negative:**
  - A countered investor gets a chance that others do not. That fairness call belongs to the seller, through the agent.
  - An investor who misses the deadline cannot improve unless the agent extends it.
  - Still open (T377): an offer withdrawn or expired after the deadline that leaves no open offers keeps the package ACCEPTING_OFFERS. The agent can still extend or withdraw it.
- **Revisit when:**
  - Real rounds show that agents extend most deadlines (then the 72-hour default is wrong).
  - Clever wants a formal "best and final" call to every investor.
  - The business chooses open bidding. That needs a spec change to FR-044 and a new ADR.

## Evidence
- [spec.md FR-044, FR-052, FR-057, FR-058, edge cases](../../specs/001-investor-platform-prototype/spec.md)
- [tasks.md Sprint 3 decisions; T307, T375, T377](../../specs/001-investor-platform-prototype/tasks.md)
- [data-model.md package and offer state machines](../../specs/001-investor-platform-prototype/data-model.md)
- [contracts/api.md `/reopening` and `/offer-deadline`](../../specs/001-investor-platform-prototype/contracts/api.md)
