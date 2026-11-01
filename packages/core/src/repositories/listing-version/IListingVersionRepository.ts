// The listing version port (T288): what a package said at each listing version (append-only), so
// matching evaluates exactly the facts the investor will be shown.
import type { ListingFacts } from "../../registry/listing-facts.js";

export type ListingVersionRecord = {
  packageId: string;
  listingVersion: number;
  round: number;
  snapshot: ListingFacts;
  evaluatorVersion: number;
};

export interface IListingVersionRepository {
  append(version: ListingVersionRecord): Promise<void>;
  find(packageId: string, listingVersion: number): Promise<ListingVersionRecord | null>;
}
