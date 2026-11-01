// The decision port (T309; FR-052): the seller's recorded choices, append-only. The note is free
// text the agent writes, so the adapter stores it encrypted (XII).
import type { Decision } from "@clever/contracts/deal";

export type NewDecision = Omit<Decision, "id" | "createdAt">;

export interface IDecisionRepository {
  append(decision: NewDecision): Promise<Decision>;
}
