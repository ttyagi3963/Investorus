// What a listing must have before investors see it (FR-012), and when its agent may still change
// it (T375). Publishing checks the draft; an edit or a photo removal after publish checks the
// result, so a package investors can see always stays publishable.
import { BusinessRuleError, type FieldError } from "@clever/contracts/common";
import { EDITABLE_STATUSES, type ListingPackage } from "@clever/contracts/listing-package";
import type { Property } from "@clever/contracts/property";

const BUILDING_FACTS: (keyof Property)[] = ["beds", "baths", "sqft", "yearBuilt", "condition"];

/** The property facts each type must have before investors see it (FR-012). */
const REQUIRED_FACTS: Record<Property["propertyType"], (keyof Property)[]> = {
  LAND: ["lotSqft"],
  MULTI_FAMILY: [...BUILDING_FACTS, "units"],
  SINGLE_FAMILY: BUILDING_FACTS,
  CONDO: BUILDING_FACTS,
  TOWNHOME: BUILDING_FACTS,
  MANUFACTURED: BUILDING_FACTS,
};

/** Every field publishing needs that the package leaves empty, each named so the form can link to it. */
export function missingToPublish(
  pkg: ListingPackage,
  property: Property,
  photoCount: number,
): FieldError[] {
  const errors: FieldError[] = [];
  const need = (field: string, message: string) => errors.push({ field, message });
  if (photoCount === 0) need("photos", "Add at least one photo");
  if (pkg.closingWindowStart === null) need("closingWindowStart", "Enter the closing window");
  if (pkg.closingWindowEnd === null) need("closingWindowEnd", "Enter the closing window");
  if (pkg.currentlyListed === null) need("currentlyListed", "Say whether the home is listed");
  if (pkg.eligiblePrograms.length === 0) need("eligiblePrograms", "Choose at least one program");
  for (const fact of REQUIRED_FACTS[property.propertyType]) {
    if (property[fact] === null) need(`property.${fact}`, "Required to publish this type of home");
  }
  return errors;
}

/** Refuses a change to the details or photos of a package whose facts are settled. */
export function assertEditable(pkg: ListingPackage): void {
  if (!(EDITABLE_STATUSES as readonly string[]).includes(pkg.status)) {
    throw new BusinessRuleError(
      "This package's details and photos cannot change in its current status",
      "PACKAGE_LOCKED",
    );
  }
}
