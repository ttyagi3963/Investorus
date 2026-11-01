// The Deal and the Decision the app passes around, shaped from the Prisma models (T304): the
// seller's recorded choice, and an accepted offer tracked to closing (data-model.md, DealStatus).
// The fall-through reason and the note are decrypted values; the repository encrypts them.

/** data-model.md, DealStatus. CLOSED, FELL_THROUGH, and RECONFIRM_DECLINED are final. */
export const DEAL_STATUSES = [
  "PENDING_RECONFIRMATION",
  "OFFER_ACCEPTED",
  "UNDER_CONTRACT",
  "INSPECTION",
  "CLOSING",
  "CLOSED",
  "FELL_THROUGH",
  "RECONFIRM_DECLINED",
] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export type Deal = {
  id: string;
  packageId: string;
  offerId: string;
  status: DealStatus;
  /** Free text; may hold seller details, so it is shown only to the agent. */
  fellThroughReason: string | null;
  promotedFromBackup: boolean;
  /** Set while a promoted backup has not yet reconfirmed. */
  reconfirmBy: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export const DECISION_TYPES = ["ACCEPT", "COUNTER", "DECLINE_ALL"] as const;
export type DecisionType = (typeof DECISION_TYPES)[number];

export type Decision = {
  id: string;
  packageId: string;
  round: number;
  type: DecisionType;
  offerId: string | null;
  actorUserId: string;
  /** Free text; may hold seller details, so it is shown only to the agent. */
  note: string | null;
  createdAt: Date;
};
