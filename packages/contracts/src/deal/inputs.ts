// The seller's decision as the agent records it (T309; FR-052): accept one offer, counter one with
// new terms, or decline every open offer. ACCEPT and COUNTER name the offer and its version (so an
// offer revised since the agent read it is refused); DECLINE_ALL names the package's version.
import { z } from "zod";
import { createOfferInputSchema } from "../offer/inputs.js";

const version = z.number().int().positive();
const note = z.string().max(1_000).optional();

/** POST /listing-packages/:id/decisions */
export const createDecisionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ACCEPT"), offerId: z.string(), version, note }),
  z.object({
    type: z.literal("COUNTER"),
    offerId: z.string(),
    version,
    counterTerms: createOfferInputSchema,
    note,
  }),
  z.object({ type: z.literal("DECLINE_ALL"), version, note }),
]);
export type CreateDecisionInput = z.input<typeof createDecisionSchema>;
