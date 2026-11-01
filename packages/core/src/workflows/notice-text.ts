// Shared wording for the in-app notifications the workflows write (T291, T293). A listing is named
// by its city, state, and ZIP only, never its street, so no notice carries seller details (XII).
import type { Property } from "@clever/contracts/property";

export const placeOf = (property: Property | null) =>
  property ? `${property.city}, ${property.state} ${property.zip}` : "your area";
