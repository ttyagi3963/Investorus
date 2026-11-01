// The investor's buy boxes as server state (T324, constitution XIII), under `["buy-boxes", ...]`
// keys, so a save refreshes the list and the box.
import { useQuery } from "@tanstack/react-query";
import { buyBoxes } from "../../lib/bff-client";

export const buyBoxKeys = {
  all: ["buy-boxes"] as const,
  one: (id: string) => ["buy-boxes", id] as const,
};

export function useBuyBoxes() {
  return useQuery({ queryKey: buyBoxKeys.all, queryFn: () => buyBoxes.list() });
}

export function useBuyBox(id: string) {
  return useQuery({ queryKey: buyBoxKeys.one(id), queryFn: () => buyBoxes.get(id) });
}
