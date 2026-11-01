// What the agent sees of a recorded decision (T309) and of the deal (T311). The note and the
// fall-through reason are the agent's own words, so they are returned to the agent only; they never
// reach an investor, a notice, or the audit log.
import type { Offer } from "../offer/offer.js";
import type { NetProceedsLine } from "../offer/comparison.js";
import type { Deal, Decision, DecisionType } from "./deal.js";
import type { DealMilestone } from "./inputs.js";

export type DecisionView = {
  id: string;
  type: DecisionType;
  offerId: string | null;
  note: string | null;
  createdAt: string;
};

export function toDecisionView(decision: Decision): DecisionView {
  return {
    id: decision.id,
    type: decision.type,
    offerId: decision.offerId,
    note: decision.note,
    createdAt: decision.createdAt.toISOString(),
  };
}

/** What the deal workflow returns: the deal, its offer, and the ranked backups (T311). */
export type DealParts = {
  deal: Deal;
  offer: Offer;
  investorName: string;
  allowedNextMilestones: DealMilestone[];
  backups: {
    offer: Offer;
    investorName: string;
    netProceeds: number;
    breakdown: NetProceedsLine[];
    expired: boolean;
  }[];
};
