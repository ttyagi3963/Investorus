// The CRM port (T339; FR-077, contracts/providers.md): one-way updates of a listing's status. The
// sandbox stand-in is the prototype's CRM; HubSpot is a production implementation behind the same
// port. The worker alone holds it, so the CRM is reached only through the outbox (XVIII).
export type CrmListingRecord = {
  packageId: string;
  status: string;
  round: number;
  offerCount: number;
  acceptedPrice: number | null;
  sellerContact: { fullName: string; email: string | null; phone: string | null };
  /** When the change began. */
  occurredAt: Date;
  /**
   * The change's place in the platform's order of changes (T380): the CRM keeps the highest, so a
   * late retry or an out-of-order delivery never overwrites a newer state.
   */
  sequence: number;
};

export interface ICrmProvider {
  /**
   * APPLIED, or STALE when the CRM already holds a later-numbered update. Throws InfrastructureError when
   * the CRM is unavailable (retried) and DeliveryRejectedError when it refuses the update.
   */
  upsertListing(record: CrmListingRecord, idempotencyKey: string): Promise<"APPLIED" | "STALE">;
}
