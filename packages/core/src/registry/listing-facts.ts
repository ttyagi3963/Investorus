// The listing facts every criterion reads (T287; constitution XIX), one flat object per listing
// version with no seller PII: matching evaluates it, and it is stored as the ListingVersion
// snapshot, so a match always names what the investor was shown.
import { MATERIAL_FIELDS, type ListingField } from "@clever/contracts/buy-box";
import type { ListingPackage, OfferProgram } from "@clever/contracts/listing-package";
import type { Property, PropertyCondition, PropertyType } from "@clever/contracts/property";

export type ListingFacts = {
  zip: string;
  state: string;
  propertyType: PropertyType;
  priceExpectationMax: number;
  yearBuilt: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  units: number | null;
  condition: PropertyCondition | null;
  repairEstimate: number | null;
  /** `YYYY-MM-DD` */
  closingWindowStart: string | null;
  /** `YYYY-MM-DD` */
  closingWindowEnd: string | null;
  currentlyListed: boolean | null;
  eligiblePrograms: OfferProgram[];
};

// Fails the build if the facts and the registry's ListingField list ever disagree.
type SameKeys<A, B> = [Exclude<keyof A, B>, Exclude<B, keyof A>] extends [never, never]
  ? true
  : never;
const factsCoverRegistry: SameKeys<ListingFacts, ListingField> = true;
void factsCoverRegistry;

export function toListingFacts(pkg: ListingPackage, property: Property): ListingFacts {
  return {
    zip: property.zip,
    state: property.state,
    propertyType: property.propertyType,
    priceExpectationMax: pkg.priceExpectationMax,
    yearBuilt: property.yearBuilt,
    beds: property.beds,
    baths: property.baths,
    sqft: property.sqft,
    units: property.units,
    condition: property.condition,
    repairEstimate: property.repairEstimate,
    closingWindowStart: pkg.closingWindowStart,
    closingWindowEnd: pkg.closingWindowEnd,
    currentlyListed: pkg.currentlyListed,
    eligiblePrograms: pkg.eligiblePrograms,
  };
}

/** True when a field some criterion reads differs between two versions of the listing. */
export const isMaterialChange = (before: ListingFacts, after: ListingFacts) =>
  MATERIAL_FIELDS.some((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
