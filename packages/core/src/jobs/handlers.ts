// The worker's job handlers (T293; constitution VIII), one per job type, so a type without a
// handler fails the build. Each checks its payload with Zod first (VI): it was written earlier and
// may come from an older version of the code. A bad payload is a ZodError, which is not retried.
import { matchPackagePayloadSchema, type JobType } from "@clever/contracts/jobs";
import type { IMatchingWorkflow } from "../workflows/matching/MatchingWorkflow.js";

export type JobHandler = (payload: unknown) => Promise<void>;

export function createJobHandlers(deps: {
  matching: IMatchingWorkflow;
}): Record<JobType, JobHandler> {
  return {
    MATCH_PACKAGE: async (payload) => {
      const { packageId, round, listingVersion } = matchPackagePayloadSchema.parse(payload);
      await deps.matching.evaluatePackage(packageId, round, listingVersion);
    },
  };
}
