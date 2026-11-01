// The worker's job handlers (T293, T306, T311, T321, T322, T340; constitution VIII), one per job type, so a type without a
// handler fails the build. Each checks its payload with Zod first (VI): it was written earlier and
// may come from an older version of the code. A bad payload is a ZodError, which is not retried.
import {
  closeOfferRoundPayloadSchema,
  expireOfferPayloadSchema,
  expireReconfirmationPayloadSchema,
  importInvestorsPayloadSchema,
  matchBuyBoxPayloadSchema,
  matchPackagePayloadSchema,
  sendMatchDigestsPayloadSchema,
  type JobType,
} from "@clever/contracts/jobs";
import type { IDealLifecycleWorkflow } from "../workflows/deal-lifecycle/DealLifecycleWorkflow.js";
import type { IInvestorImportWorkflow } from "../workflows/investor-import/InvestorImportWorkflow.js";
import type { IMatchDigestWorkflow } from "../workflows/match-digest/MatchDigestWorkflow.js";
import type { IMatchingWorkflow } from "../workflows/matching/MatchingWorkflow.js";
import type { IOfferRoundWorkflow } from "../workflows/offer-round/OfferRoundWorkflow.js";

export type JobHandler = (payload: unknown) => Promise<void>;

export function createJobHandlers(deps: {
  matching: IMatchingWorkflow;
  offerRound: IOfferRoundWorkflow;
  deals: Pick<IDealLifecycleWorkflow, "expireReconfirmation">;
  imports: Pick<IInvestorImportWorkflow, "run">;
  digests: Pick<IMatchDigestWorkflow, "send">;
}): Record<JobType, JobHandler> {
  return {
    MATCH_PACKAGE: async (payload) => {
      await deps.matching.evaluatePackage(matchPackagePayloadSchema.parse(payload));
    },
    MATCH_BUY_BOX: async (payload) => {
      await deps.matching.evaluateBuyBox(matchBuyBoxPayloadSchema.parse(payload));
    },
    IMPORT_INVESTORS: async (payload) => {
      await deps.imports.run(importInvestorsPayloadSchema.parse(payload));
    },
    CLOSE_OFFER_ROUND: async (payload) => {
      await deps.offerRound.closeRound(closeOfferRoundPayloadSchema.parse(payload));
    },
    EXPIRE_OFFER: async (payload) => {
      await deps.offerRound.expireOffer(expireOfferPayloadSchema.parse(payload));
    },
    EXPIRE_RECONFIRMATION: async (payload) => {
      await deps.deals.expireReconfirmation(expireReconfirmationPayloadSchema.parse(payload));
    },
    SEND_MATCH_DIGESTS: async (payload) => {
      await deps.digests.send(sendMatchDigestsPayloadSchema.parse(payload));
    },
  };
}
