// The inputs for a draft package: create (POST /listing-packages: seller, property, and price in
// one request) and update (PATCH /listing-packages/:id), checked with Zod; errors name the field.
// The agent comes from the session, never from the body.
import { z } from "zod";
import { createPropertyInputSchema, updatePropertyInputSchema } from "../property/inputs.js";
import { createSellerInputSchema, updateSellerInputSchema } from "../seller/inputs.js";

const price = z.number().int().positive();
const minAtMostMax = {
  message: "Must be at least the minimum price",
  path: ["priceExpectationMax"],
};

export const createListingPackageInputSchema = z
  .object({
    seller: createSellerInputSchema,
    property: createPropertyInputSchema,
    priceExpectationMin: price,
    priceExpectationMax: price,
  })
  .refine((p) => p.priceExpectationMin <= p.priceExpectationMax, minAtMostMax);
export type CreateListingPackageInput = z.input<typeof createListingPackageInputSchema>;

/**
 * Every part is optional and a part left out stays unchanged. `version` is the one the agent read;
 * a stale one is refused (409), so two saves cannot overwrite each other. min ≤ max is checked here
 * when both are sent, and by the service against the stored price otherwise.
 */
export const updateListingPackageInputSchema = z
  .object({
    version: z.number().int().positive(),
    seller: updateSellerInputSchema.optional(),
    property: updatePropertyInputSchema.optional(),
    priceExpectationMin: price.optional(),
    priceExpectationMax: price.optional(),
  })
  .refine(
    (p) =>
      p.priceExpectationMin === undefined ||
      p.priceExpectationMax === undefined ||
      p.priceExpectationMin <= p.priceExpectationMax,
    minAtMostMax,
  );
export type UpdateListingPackageInput = z.input<typeof updateListingPackageInputSchema>;
