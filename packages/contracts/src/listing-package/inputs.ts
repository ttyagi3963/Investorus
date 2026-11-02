// The inputs for a draft package: create (POST /listing-packages: seller, property, and price in
// one request) and update (PATCH /listing-packages/:id), checked with Zod; errors name the field.
// The agent comes from the session, never from the body.
import { z } from "zod";
import { isoDate, isoDateTime } from "../common/dates.js";
import { price } from "../common/fields.js";
import { createPropertyInputSchema, updatePropertyInputSchema } from "../property/inputs.js";
import { createSellerInputSchema, updateSellerInputSchema } from "../seller/inputs.js";
import { OFFER_PROGRAMS } from "./programs.js";

const minAtMostMax = {
  message: "Must be at least the minimum price",
  path: ["priceExpectationMax"],
};
// The seller's terms, which publishing requires but a draft may leave out (FR-012).
const terms = {
  closingWindowStart: isoDate(),
  closingWindowEnd: isoDate(),
  currentlyListed: z.boolean(),
  eligiblePrograms: z.array(z.enum(OFFER_PROGRAMS)),
};
const windowInOrder = {
  message: "Must be on or after the start of the closing window",
  path: ["closingWindowEnd"],
};
const ordered = (p: { closingWindowStart?: string | null; closingWindowEnd?: string | null }) =>
  !p.closingWindowStart || !p.closingWindowEnd || p.closingWindowStart <= p.closingWindowEnd;

export const createListingPackageInputSchema = z
  .object({
    seller: createSellerInputSchema,
    property: createPropertyInputSchema,
    priceExpectationMin: price(),
    priceExpectationMax: price(),
    closingWindowStart: terms.closingWindowStart.optional(),
    closingWindowEnd: terms.closingWindowEnd.optional(),
    currentlyListed: terms.currentlyListed.optional(),
    eligiblePrograms: terms.eligiblePrograms.optional(),
  })
  .refine((p) => p.priceExpectationMin <= p.priceExpectationMax, minAtMostMax)
  .refine(ordered, windowInOrder);
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
    priceExpectationMin: price().optional(),
    priceExpectationMax: price().optional(),
    closingWindowStart: terms.closingWindowStart.nullable().optional(),
    closingWindowEnd: terms.closingWindowEnd.nullable().optional(),
    currentlyListed: terms.currentlyListed.nullable().optional(),
    eligiblePrograms: terms.eligiblePrograms.optional(),
  })
  .refine(
    (p) =>
      p.priceExpectationMin === undefined ||
      p.priceExpectationMax === undefined ||
      p.priceExpectationMin <= p.priceExpectationMax,
    minAtMostMax,
  )
  .refine(ordered, windowInOrder);
export type UpdateListingPackageInput = z.input<typeof updateListingPackageInputSchema>;

/** POST /listing-packages/:id/publication. The deadline defaults to now + 72 hours. */
export const publishInputSchema = z.object({
  version: z.number().int().positive(),
  offerDeadline: isoDateTime().optional(),
});
export type PublishInput = z.input<typeof publishInputSchema>;

/** POST /listing-packages/:id/withdrawal. */
export const withdrawInputSchema = z.object({ version: z.number().int().positive() });
export type WithdrawInput = z.input<typeof withdrawInputSchema>;

/**
 * POST /listing-packages/:id/reopening and PATCH /listing-packages/:id/offer-deadline (T307): the
 * new deadline, which the workflow checks against the clock.
 */
export const offerDeadlineInputSchema = z.object({
  version: z.number().int().positive(),
  offerDeadline: isoDateTime(),
});
export type OfferDeadlineInput = z.input<typeof offerDeadlineInputSchema>;
