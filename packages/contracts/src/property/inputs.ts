// The property details an agent types into a draft package, checked with Zod against the
// data-model rules; errors name the field. City and state are not typed: the service derives
// them from the ZIP and rejects a ZIP outside the geo reference set.
import { z } from "zod";
import { PROPERTY_CONDITIONS, PROPERTY_TYPES } from "./enums.js";

export const createPropertyInputSchema = z
  .object({
    streetLine: z.string().trim().min(1),
    zip: z.string().regex(/^\d{5}$/, "Use a 5-digit ZIP code"),
    neighborhood: z.string().trim().min(1).optional(),
    propertyType: z.enum(PROPERTY_TYPES),
    beds: z.number().int().min(0).max(20).optional(),
    baths: z.number().min(0).max(20).multipleOf(0.5).optional(),
    sqft: z.number().int().min(100).max(20_000).optional(),
    lotSqft: z.number().int().positive().optional(),
    units: z.number().int().min(2).max(500).optional(),
    yearBuilt: z
      .number()
      .int()
      .min(1800)
      .refine((year) => year <= new Date().getFullYear(), "Cannot be in the future")
      .optional(),
    condition: z.enum(PROPERTY_CONDITIONS).optional(),
    repairEstimate: z.number().int().min(0).optional(),
  })
  .refine((p) => p.units === undefined || p.propertyType === "MULTI_FAMILY", {
    message: "Units apply only to multi-family homes",
    path: ["units"],
  });
export type CreatePropertyInput = z.input<typeof createPropertyInputSchema>;
