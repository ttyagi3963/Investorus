// The durable job envelope (T281; constitution VIII), shaped from the Prisma `Job` model, and the
// payload schema per job type. A payload is checked with Zod when the worker reads it (VI): it was
// written earlier and may come from an older version of the code.
import { z } from "zod";

export const JOB_TYPES = ["MATCH_PACKAGE"] as const;
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
});
export type MatchPackagePayload = z.infer<typeof matchPackagePayloadSchema>;
