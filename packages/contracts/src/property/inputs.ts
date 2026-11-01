// The property details an agent types into a draft package (create) or changes later (update),
// checked with Zod against the data-model rules; errors name the field. City and state are not
// typed: the service derives them from the ZIP and rejects a ZIP outside the geo reference set.
import { z } from "zod";
import { PROPERTY_CONDITIONS, PROPERTY_TYPES } from "./enums.js";

const fields = {
  streetLine: z.string().trim().min(1),
  zip: z.string().regex(/^\d{5}$/, "Use a 5-digit ZIP code"),
  neighborhood: z.string().trim().min(1),
  propertyType: z.enum(PROPERTY_TYPES),
  beds: z.number().int().min(0).max(20),
  baths: z.number().min(0).max(20).multipleOf(0.5),
  sqft: z.number().int().min(100).max(20_000),
  lotSqft: z.number().int().positive(),
  units: z.number().int().min(2).max(500),
  // "Not in the future" needs today's date, so the database CHECK enforces it (and the service
  // will, with the clock port); a schema must not read the wall clock (constitution XV).
  yearBuilt: z.number().int().min(1800),
  condition: z.enum(PROPERTY_CONDITIONS),
  repairEstimate: z.number().int().min(0),
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
