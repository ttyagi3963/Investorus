// The agent's package data as React Query server state (constitution XIII): the list for the
// dashboard and one package for the edit page, under `["listing-packages", id]` keys, so a save or
// a photo change refreshes both by invalidating them.
import { useQuery } from "@tanstack/react-query";
import { listingPackages } from "../../lib/bff-client";

export const packageKeys = {
  all: ["listing-packages"] as const,
  one: (id: string) => ["listing-packages", id] as const,
};

export function usePackages() {
  return useQuery({ queryKey: packageKeys.all, queryFn: () => listingPackages.list() });
}

export function usePackage(id: string) {
  return useQuery({ queryKey: packageKeys.one(id), queryFn: () => listingPackages.get(id) });
}
