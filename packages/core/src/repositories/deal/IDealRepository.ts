// The deal port (T309; FR-053): an accepted offer tracked to closing. At most one deal per package
// is active, which the database enforces, so two concurrent accepts cannot both win.
import type { Deal } from "@clever/contracts/deal";

export type NewDeal = Pick<Deal, "packageId" | "offerId" | "status">;

/** What a second accept is told, whether it raced the first or came after it. */
export const ALREADY_ACCEPTED = "This package already has an accepted offer";

export interface IDealRepository {
  /**
   * Creates the deal. Throws BusinessRuleError PACKAGE_HAS_ACCEPTED_OFFER when the package already
   * has an active deal (the partial unique index: a concurrent accept waits, then fails here).
   */
  create(deal: NewDeal): Promise<Deal>;
  /** The package's deal that is not final (not CLOSED, FELL_THROUGH, or RECONFIRM_DECLINED). */
  findActiveByPackage(packageId: string): Promise<Deal | null>;
}
