// The investor's server state (T302, constitution XIII): their matched packages and one package,
// under `["investor", ...]` keys, so making or revising an offer refreshes both.
import { useQuery } from "@tanstack/react-query";
import { investor } from "../../lib/bff-client";

export const investorKeys = {
  all: ["investor"] as const,
  one: (id: string) => ["investor", id] as const,
};

export function useMatchedPackages() {
  return useQuery({ queryKey: investorKeys.all, queryFn: () => investor.packages() });
}

export function useInvestorPackage(id: string) {
  return useQuery({ queryKey: investorKeys.one(id), queryFn: () => investor.package(id) });
}
