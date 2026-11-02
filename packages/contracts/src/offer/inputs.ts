// The offer inputs (T281): create (POST /listing-packages/:id/offers) and revise (PATCH
// /offers/:offerId), checked with Zod against the data-model rules; errors name the field. The
// dates against "today" and "now" need the clock, so the service checks those.
import { z } from "zod";
import { CONTINGENCIES, PAYMENT_TYPES } from "./offer.js";

const terms = z
  .object({
    price: z.number().int().positive(),
    paymentType: z.enum(PAYMENT_TYPES),
    closingDate: z.iso.date(),
    earnestMoney: z.number().int().min(0),
    // Each counts once: the comparison ranks certainty by how many there are (FR-050).
    contingencies: z
      .array(z.enum(CONTINGENCIES))
      .refine((list) => new Set(list).size === list.length, "List each contingency once"),
    feesAndConcessions: z.number().int().min(0),
    expiresAt: z.iso.datetime(),
  })
  .refine((t) => t.paymentType !== "FINANCED" || t.contingencies.includes("FINANCING"), {
    message: "A financed offer needs the financing contingency",
    path: ["contingencies"],
  });

export const createOfferInputSchema = terms;
export type CreateOfferInput = z.input<typeof createOfferInputSchema>;

/** A revision restates every term and names the version the investor read. */
export const reviseOfferInputSchema = terms.and(z.object({ version: z.number().int().positive() }));
export type ReviseOfferInput = z.input<typeof reviseOfferInputSchema>;

/** POST /offers/:offerId/withdrawal (T307): names the version the investor read. */
export const withdrawOfferInputSchema = z.object({ version: z.number().int().positive() });
export type WithdrawOfferInput = z.input<typeof withdrawOfferInputSchema>;

/** POST /offers/:offerId/counter-response (T310): take the agent's counter, or keep your own terms. */
export const counterResponseSchema = z.object({
  action: z.enum(["ACCEPT", "DECLINE"]),
  version: z.number().int().positive(),
});
export type CounterResponseInput = z.input<typeof counterResponseSchema>;
