// The property details an agent types into a draft package (create) or changes later (update),
// checked with Zod against the data-model rules; errors name the field. City and state are not
// typed: the service derives them from the ZIP and rejects a ZIP outside the geo reference set.
import { z } from "zod";
import { dollars, wholeNumber } from "../common/fields.js";
import { PROPERTY_CONDITIONS, PROPERTY_TYPES } from "./enums.js";

const fields = {
  streetLine: z.string().trim().min(1, "Enter the street address"),
  zip: z.string().regex(/^\d{5}$/, "Use a 5-digit ZIP code"),
  neighborhood: z.string().trim().min(1, "Enter the neighborhood"),
  propertyType: z.enum(PROPERTY_TYPES, { message: "Choose a property type" }),
  beds: wholeNumber("Enter a whole number from 0 to 20", 0, 20),
  baths: z
    .number({ message: "Use whole or half baths from 0 to 20, for example 2.5" })
    .min(0, "Use whole or half baths from 0 to 20, for example 2.5")
    .max(20, "Use whole or half baths from 0 to 20, for example 2.5")
    .multipleOf(0.5, "Use whole or half baths from 0 to 20, for example 2.5"),
  sqft: wholeNumber("Enter 100 to 20,000 square feet", 100, 20_000),
  lotSqft: wholeNumber("Enter a lot size above 0", 1),
  units: wholeNumber("A multi-family home has 2 to 500 units", 2, 500),
  // "Not in the future" needs today's date, so the database CHECK enforces it (and the service
  // will, with the clock port); a schema must not read the wall clock (constitution XV).
  yearBuilt: wholeNumber("Enter a year from 1800 on", 1800),
  condition: z.enum(PROPERTY_CONDITIONS, { message: "Choose a condition" }),
  repairEstimate: dollars(),
};
const unitsMessage = { message: "Units apply only to multi-family homes", path: ["units"] };

export const createPropertyInputSchema = z
  .object({
    streetLine: fields.streetLine,
    zip: fields.zip,
    neighborhood: fields.neighborhood.optional(),
    propertyType: fields.propertyType,
    beds: fields.beds.optional(),
    baths: fields.baths.optional(),
    sqft: fields.sqft.optional(),
    lotSqft: fields.lotSqft.optional(),
    units: fields.units.optional(),
    yearBuilt: fields.yearBuilt.optional(),
    condition: fields.condition.optional(),
    repairEstimate: fields.repairEstimate.optional(),
  })
  .refine((p) => p.units === undefined || p.propertyType === "MULTI_FAMILY", unitsMessage);
export type CreatePropertyInput = z.input<typeof createPropertyInputSchema>;

/**
 * A field left out stays unchanged; `null` clears an optional fact (constitution V). The street,
 * ZIP, and type can change but not be cleared. "Units only for multi-family" is checked here when
 * both are sent, and by the service on the merged result otherwise (backed by the database CHECK).
 */
export const updatePropertyInputSchema = z
  .object({
    streetLine: fields.streetLine.optional(),
    zip: fields.zip.optional(),
    neighborhood: fields.neighborhood.nullable().optional(),
    propertyType: fields.propertyType.optional(),
    beds: fields.beds.nullable().optional(),
    baths: fields.baths.nullable().optional(),
    sqft: fields.sqft.nullable().optional(),
    lotSqft: fields.lotSqft.nullable().optional(),
    units: fields.units.nullable().optional(),
    yearBuilt: fields.yearBuilt.nullable().optional(),
    condition: fields.condition.nullable().optional(),
    repairEstimate: fields.repairEstimate.nullable().optional(),
  })
  .refine(
    (p) => p.units == null || p.propertyType === undefined || p.propertyType === "MULTI_FAMILY",
    unitsMessage,
  );
export type UpdatePropertyInput = z.input<typeof updatePropertyInputSchema>;
