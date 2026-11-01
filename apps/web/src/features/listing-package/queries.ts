// The agent's package data as React Query server state (constitution XIII): the list for the
// dashboard, one package for the edit page, and its timeline and offers (T301), all under
// `["listing-packages", ...]` keys, so a save, a publish, or a photo change refreshes them together.
import { useQuery } from "@tanstack/react-query";
import { listingPackages } from "../../lib/bff-client";

export const packageKeys = {
  all: ["listing-packages"] as const,
  one: (id: string) => ["listing-packages", id] as const,
  timeline: (id: string) => ["listing-packages", id, "timeline"] as const,
  offers: (id: string) => ["listing-packages", id, "offers"] as const,
};

export function usePackages() {
  return useQuery({ queryKey: packageKeys.all, queryFn: () => listingPackages.list() });
}

export function usePackage(id: string) {
  return useQuery({ queryKey: packageKeys.one(id), queryFn: () => listingPackages.get(id) });
}

export function usePackageTimeline(id: string) {
  return useQuery({
    queryKey: packageKeys.timeline(id),
    queryFn: () => listingPackages.timeline(id),
  });
}

export function usePackageOffers(id: string) {
  return useQuery({ queryKey: packageKeys.offers(id), queryFn: () => listingPackages.offers(id) });
}
