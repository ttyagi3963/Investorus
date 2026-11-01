// The agent's comparison and deal as React Query server state (T315, T316; constitution XIII), under
// the package's `["listing-packages", id, ...]` keys, so a decision, a milestone, or a promotion that
// refreshes the package refreshes these too.
import type { ComparisonSort } from "@clever/contracts/offer";
import { useQuery } from "@tanstack/react-query";
import { listingPackages } from "../../lib/bff-client";
import { packageKeys } from "../listing-package/queries";

export const comparisonKey = (id: string, sort: ComparisonSort) =>
  [...packageKeys.one(id), "comparison", sort] as const;
export const dealKey = (id: string) => [...packageKeys.one(id), "deal"] as const;

export function useComparison(id: string, sort: ComparisonSort) {
  return useQuery({
    queryKey: comparisonKey(id, sort),
    queryFn: () => listingPackages.comparison(id, sort),
  });
}

export function useDeal(id: string, enabled = true) {
  return useQuery({ queryKey: dealKey(id), queryFn: () => listingPackages.deal(id), enabled });
}
