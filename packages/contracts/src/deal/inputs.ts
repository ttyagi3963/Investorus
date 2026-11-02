// The seller's decision as the agent records it (T309; FR-052): accept one offer, counter one with
// new terms, or decline every open offer. ACCEPT and COUNTER name the offer and its version (so an
// offer revised since the agent read it is refused); DECLINE_ALL names the package's version.
import { z } from "zod";
import { createOfferInputSchema } from "../offer/inputs.js";

const version = z.number().int().positive();
const note = z.string().max(1_000, "Use 1,000 characters or fewer").optional();

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

/** The milestones a deal moves through after acceptance, in order (FR-055). */
export const DEAL_MILESTONES = ["UNDER_CONTRACT", "INSPECTION", "CLOSING", "CLOSED"] as const;
export type DealMilestone = (typeof DEAL_MILESTONES)[number];

/** POST /deals/:dealId/milestones (T311). */
export const milestoneInputSchema = z.object({ milestone: z.enum(DEAL_MILESTONES), version });
export type MilestoneInput = z.input<typeof milestoneInputSchema>;

/** POST /deals/:dealId/fall-through (T311): a reason is required (FR-056). */
export const fallThroughInputSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Say why the deal fell through")
    .max(500, "Use 500 characters or fewer"),
  version,
});
export type FallThroughInput = z.input<typeof fallThroughInputSchema>;

/** POST /listing-packages/:id/backup-promotions (T311): the backup and the package's version. */
export const promoteBackupSchema = z.object({ offerId: z.string(), version });
export type PromoteBackupInput = z.input<typeof promoteBackupSchema>;

/** POST /offers/:offerId/reconfirmation (T311): the promoted backup's answer (FR-057). */
export const reconfirmationSchema = z.object({ action: z.enum(["CONFIRM", "DECLINE"]) });
export type ReconfirmationInput = z.input<typeof reconfirmationSchema>;
