// The input for creating a draft package (POST /listing-packages): the seller, the property, and
// the price expectations in one request, checked with Zod; errors name the field. The agent comes
// from the session, never from the body.
import { z } from "zod";
import { createPropertyInputSchema } from "../property/inputs.js";
import { createSellerInputSchema } from "../seller/inputs.js";

export const createListingPackageInputSchema = z
  .object({
    seller: createSellerInputSchema,
    property: createPropertyInputSchema,
    priceExpectationMin: z.number().int().positive(),
    priceExpectationMax: z.number().int().positive(),
  })
  .refine((p) => p.priceExpectationMin <= p.priceExpectationMax, {
    message: "Must be at least the minimum price",
    path: ["priceExpectationMax"],
  });
export type CreateListingPackageInput = z.input<typeof createListingPackageInputSchema>;
