// Stage 2 of matching (T287; FR-020): every criterion of one buy box against one listing. The box
// matches only if every criterion passes; each result is kept for the audit entry (XII).
import { CRITERION_KEYS, type BuyBox, type CriterionKey } from "@clever/contracts/buy-box";
import { EVALUATORS, type CriterionResult } from "./evaluators.js";
import type { ListingFacts } from "./listing-facts.js";

export type BuyBoxEvaluation = {
  matched: boolean;
  results: Record<CriterionKey, CriterionResult>;
};

/** `today` is `YYYY-MM-DD`, the day matching runs. */
export function evaluateBuyBox(
  box: BuyBox,
  listing: ListingFacts,
  today: string,
): BuyBoxEvaluation {
  const results = Object.fromEntries(
    CRITERION_KEYS.map((key) => [key, EVALUATORS[key](box, listing, today)]),
  ) as Record<CriterionKey, CriterionResult>;
  return { matched: CRITERION_KEYS.every((key) => results[key].passed), results };
}
