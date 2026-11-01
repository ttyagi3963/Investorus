// The durable job envelope (T281; constitution VIII), shaped from the Prisma `Job` model, and the
// payload schema per job type. A payload is checked with Zod when the worker reads it (VI): it was
// written earlier and may come from an older version of the code.
import { z } from "zod";
import { MATCH_TRIGGERS } from "../match/match.js";

export const JOB_TYPES = [
  "MATCH_PACKAGE",
  "MATCH_BUY_BOX",
  "CLOSE_OFFER_ROUND",
  "EXPIRE_OFFER",
  "EXPIRE_RECONFIRMATION",
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = ["QUEUED", "PROCESSING", "COMPLETED", "FAILED"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export type Job = {
  id: string;
  type: JobType;
  status: JobStatus;
  dedupeKey: string;
  payload: unknown;
  runAt: Date;
  retryCount: number;
  maxRetries: number;
  /** Redacted; set when the last run failed. */
  error: string | null;
  /** The request that enqueued the job, logged with every line of its run. */
  correlationId: string | null;
};

/** MATCH_PACKAGE: match one listing version of a package against every active buy box. */
export const matchPackagePayloadSchema = z.object({
  packageId: z.string().min(1),
  round: z.number().int().positive(),
  listingVersion: z.number().int().positive(),
  /** What shares the package with a newly matched investor: a publish, an edit, or a reopen. */
  trigger: z.enum(MATCH_TRIGGERS),
});
export type MatchPackagePayload = z.infer<typeof matchPackagePayloadSchema>;

/** MATCH_BUY_BOX: match one saved version of a buy box against every package taking offers. */
export const matchBuyBoxPayloadSchema = z.object({
  buyBoxId: z.string().min(1),
  version: z.number().int().positive(),
});
export type MatchBuyBoxPayload = z.infer<typeof matchBuyBoxPayloadSchema>;

/** CLOSE_OFFER_ROUND: end a round's offers at its deadline (the deadline names which one). */
export const closeOfferRoundPayloadSchema = z.object({
  packageId: z.string().min(1),
  round: z.number().int().positive(),
  offerDeadline: z.iso.datetime(),
});
export type CloseOfferRoundPayload = z.infer<typeof closeOfferRoundPayloadSchema>;

/** EXPIRE_OFFER: expire one revision of an offer at its expiry. */
export const expireOfferPayloadSchema = z.object({
  offerId: z.string().min(1),
  revision: z.number().int().positive(),
});
export type ExpireOfferPayload = z.infer<typeof expireOfferPayloadSchema>;

/** EXPIRE_RECONFIRMATION: end a promoted backup's time to reconfirm (FR-057). */
export const expireReconfirmationPayloadSchema = z.object({ dealId: z.string().min(1) });
export type ExpireReconfirmationPayload = z.infer<typeof expireReconfirmationPayloadSchema>;
