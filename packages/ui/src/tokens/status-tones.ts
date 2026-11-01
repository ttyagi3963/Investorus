// Which status color each domain status shows (T327; contracts/design-tokens.md, "Domain status →
// tone"), so a screen passes a status and never picks a color. The tones are the brand's status
// roles: draft (neutral), open (in progress), offers-in (needs attention soon), under-contract
// (done well), closed (finished), and error (failed or refused).
import type { BuyBoxStatus } from "@clever/contracts/buy-box";
import type { DealStatus } from "@clever/contracts/deal";
import type { ImportRowOutcome, ImportStatus } from "@clever/contracts/investor";
import type { PackageStatus } from "@clever/contracts/listing-package";
import type { OfferStatus } from "@clever/contracts/offer";

export type StatusTone = "draft" | "open" | "offers-in" | "under-contract" | "closed" | "error";

export const PACKAGE_STATUS_TONES: Record<PackageStatus, StatusTone> = {
  DRAFT: "draft",
  ACCEPTING_OFFERS: "open",
  NO_OFFERS_RECEIVED: "offers-in",
  OFFER_ACCEPTED: "under-contract",
  UNDER_CONTRACT: "under-contract",
  INSPECTION: "under-contract",
  CLOSING: "under-contract",
  CLOSED: "closed",
  FELL_THROUGH: "error",
  WITHDRAWN: "draft",
};

export const OFFER_STATUS_TONES: Record<OfferStatus, StatusTone> = {
  ACTIVE: "open",
  COUNTERED: "offers-in",
  BACKUP: "offers-in",
  ACCEPTED: "under-contract",
  DECLINED: "draft",
  WITHDRAWN: "draft",
  EXPIRED: "draft",
  FELL_THROUGH: "error",
  DECLINED_TO_RECONFIRM: "error",
};

export const DEAL_STATUS_TONES: Record<DealStatus, StatusTone> = {
  PENDING_RECONFIRMATION: "offers-in",
  OFFER_ACCEPTED: "under-contract",
  UNDER_CONTRACT: "under-contract",
  INSPECTION: "under-contract",
  CLOSING: "under-contract",
  CLOSED: "closed",
  FELL_THROUGH: "error",
  RECONFIRM_DECLINED: "error",
};

export const BUY_BOX_STATUS_TONES: Record<BuyBoxStatus, StatusTone> = {
  ACTIVE: "under-contract",
  PAUSED: "draft",
};

export const IMPORT_STATUS_TONES: Record<ImportStatus, StatusTone> = {
  QUEUED: "open",
  RUNNING: "open",
  COMPLETED: "under-contract",
  FAILED: "error",
};

export const IMPORT_OUTCOME_TONES: Record<ImportRowOutcome, StatusTone> = {
  IMPORTED: "under-contract",
  UPDATED: "open",
  REJECTED: "error",
};
