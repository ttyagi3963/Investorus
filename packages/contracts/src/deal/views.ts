// What the agent sees of a recorded decision (T309) and of the deal (T311). The note and the
// fall-through reason are the agent's own words, so they are returned to the agent only; they never
// reach an investor, a notice, or the audit log.
import { toOfferView, type Offer, type OfferView } from "../offer/offer.js";
import type { NetProceedsLine } from "../offer/comparison.js";
import type { Deal, DealStatus, Decision, DecisionType } from "./deal.js";
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

/** A backup offer as the deal page ranks it: by estimated net proceeds (FR-056, FR-057). */
export type BackupView = {
  offer: OfferView;
  investorName: string;
  netProceeds: number;
  breakdown: NetProceedsLine[];
  expired: boolean;
};

/** GET /listing-packages/:id/deal and the deal routes (T313): the agent's view of the deal. */
export type DealView = {
  id: string;
  status: DealStatus;
  version: number;
  offer: OfferView;
  investorName: string;
  promotedFromBackup: boolean;
  reconfirmBy: string | null;
  /** The agent's words; never shown to an investor. */
  fellThroughReason: string | null;
  allowedNextMilestones: DealMilestone[];
  backups: BackupView[];
};

export function toDealView({ deal, offer, backups, ...rest }: DealParts): DealView {
  return {
    id: deal.id,
    status: deal.status,
    version: deal.version,
    offer: toOfferView(offer),
    investorName: rest.investorName,
    promotedFromBackup: deal.promotedFromBackup,
    reconfirmBy: deal.reconfirmBy?.toISOString() ?? null,
    fellThroughReason: deal.fellThroughReason,
    allowedNextMilestones: rest.allowedNextMilestones,
    backups: backups.map((backup) => ({ ...backup, offer: toOfferView(backup.offer) })),
  };
}
