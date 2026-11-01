// The deal port (T309, T311; FR-053 to FR-057): an accepted offer tracked to closing. At most one
// deal per package is active, which the database enforces, so two concurrent accepts cannot both
// win. The fall-through reason is free text, so the adapter stores it encrypted (XII).
import type { Deal } from "@clever/contracts/deal";

export type NewDeal = Pick<Deal, "packageId" | "offerId" | "status"> &
  Partial<Pick<Deal, "promotedFromBackup" | "reconfirmBy">>;
export type DealPatch = Partial<Pick<Deal, "status" | "fellThroughReason" | "reconfirmBy">>;

/** What a second accept is told, whether it raced the first or came after it. */
export const ALREADY_ACCEPTED = "This package already has an accepted offer";

export interface IDealRepository {
  /**
   * Creates the deal. Throws BusinessRuleError PACKAGE_HAS_ACCEPTED_OFFER when the package already
   * has an active deal (the partial unique index: a concurrent accept waits, then fails here).
   */
  create(deal: NewDeal): Promise<Deal>;
  findById(id: string): Promise<Deal | null>;
  /** The deal made from this offer, if any (an offer is accepted or promoted at most once). */
  findByOffer(offerId: string): Promise<Deal | null>;
  /** The package's deal that is not final (not CLOSED, FELL_THROUGH, or RECONFIRM_DECLINED). */
  findActiveByPackage(packageId: string): Promise<Deal | null>;
  /** The package's newest deal, final or not. */
  findLatestByPackage(packageId: string): Promise<Deal | null>;
  /**
   * Applies the patch and moves to the next version, only if the stored version is `version`;
   * otherwise throws ConflictError.
   */
  update(id: string, version: number, patch: DealPatch): Promise<Deal>;
}
