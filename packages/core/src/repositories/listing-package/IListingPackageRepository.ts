// The listing-package port (T247). Every agent read takes the agent, so a query can only return
// that agent's packages (FR-080), and an update names the version it read, so a stale edit is
// refused. Matching, which runs as the system, reads a package by its ID alone (T288).
import type { ListingPackage, OfferProgram } from "@clever/contracts/listing-package";

export type NewListingPackage = {
  agentId: string;
  sellerId: string;
  propertyId: string;
  addressHash: string;
  priceExpectationMin: number;
  priceExpectationMax: number;
  /** `YYYY-MM-DD`. */
  closingWindowStart: string | null;
  closingWindowEnd: string | null;
  currentlyListed: boolean | null;
  eligiblePrograms: OfferProgram[];
};
export type ListingPackagePatch = Partial<
  Pick<
    NewListingPackage,
    | "addressHash"
    | "priceExpectationMin"
    | "priceExpectationMax"
    | "closingWindowStart"
    | "closingWindowEnd"
    | "currentlyListed"
    | "eligiblePrograms"
  > &
    Pick<ListingPackage, "status" | "round" | "offerDeadline" | "publishedAt" | "listingVersion">
>;

export interface IListingPackageRepository {
  create(pkg: NewListingPackage): Promise<ListingPackage>;
  findForAgent(agentId: string, id: string): Promise<ListingPackage | null>;
  /** For the system (matching), never for a request: it does not check the agent. */
  findById(id: string): Promise<ListingPackage | null>;
  listByAgent(agentId: string): Promise<ListingPackage[]>;
  /** For the system (matching a saved buy box): packages taking offers whose deadline is after `now`. */
  listOpenForOffers(now: Date): Promise<ListingPackage[]>;
  /**
   * The active package that already has this address, whichever agent owns it (the FR-013
   * block). A withdrawn package does not count.
   */
  findByAddressHash(addressHash: string): Promise<Pick<ListingPackage, "id" | "agentId"> | null>;
  /**
   * Applies the patch and moves to the next version, only if the stored version is `version`;
   * otherwise throws ConflictError. An empty patch still moves the version (the seller or the
   * property changed).
   */
  update(id: string, version: number, patch: ListingPackagePatch): Promise<ListingPackage>;
  /**
   * Holds the package's row until the transaction ends (SELECT ... FOR UPDATE), so two changes that
   * count its offers for the CRM run one after the other and each counts the other's offer.
   */
  lock(id: string): Promise<void>;
}
