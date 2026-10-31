// The Property the app passes around, shaped from the Prisma `Property` model with streetLine
// decrypted and baths as a number. addressHash stays in the repository (it is only for lookups).
import type { PropertyCondition, PropertyType } from "./enums.js";

export type Property = {
  id: string;
  streetLine: string;
  zip: string;
  city: string;
  state: string;
  neighborhood: string | null;
  propertyType: PropertyType;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lotSqft: number | null;
  units: number | null;
  yearBuilt: number | null;
  condition: PropertyCondition | null;
  repairEstimate: number | null;
  createdAt: Date;
  updatedAt: Date;
};
