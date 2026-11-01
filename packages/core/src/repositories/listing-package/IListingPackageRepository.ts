// The listing-package port (T247). Every read takes the agent, so a query can only return that
// agent's packages (FR-080), and an update names the version it read, so a stale edit is refused.
import type { ListingPackage } from "@clever/contracts/listing-package";

export type NewListingPackage = {
  agentId: string;
  sellerId: string;
  propertyId: string;
  addressHash: string;
  priceExpectationMin: number;
  priceExpectationMax: number;
};
export type ListingPackagePatch = Partial<
  Pick<NewListingPackage, "addressHash" | "priceExpectationMin" | "priceExpectationMax">
>;

export interface IListingPackageRepository {
  create(pkg: NewListingPackage): Promise<ListingPackage>;
  findForAgent(agentId: string, id: string): Promise<ListingPackage | null>;
  listByAgent(agentId: string): Promise<ListingPackage[]>;
  /** The package that already has this address, whichever agent owns it (the FR-013 block). */
  findByAddressHash(addressHash: string): Promise<Pick<ListingPackage, "id" | "agentId"> | null>;
  /**
   * Applies the patch and moves to the next version, only if the stored version is `version`;
   * otherwise throws ConflictError. An empty patch still moves the version (the seller or the
   * property changed).
   */
  update(id: string, version: number, patch: ListingPackagePatch): Promise<ListingPackage>;
}
