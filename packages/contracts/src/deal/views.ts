// What the agent sees of a recorded decision (T309). The note is the agent's own words, so it is
// returned to them only; it never reaches an investor, a notice, or the audit log.
import type { Decision, DecisionType } from "./deal.js";

export type DecisionView = {
  id: string;
  type: DecisionType;
  offerId: string | null;
  note: string | null;
  createdAt: string;
};

export function toDecisionView(decision: Decision): DecisionView {
  return {
    id: decision.id,
    type: decision.type,
    offerId: decision.offerId,
    note: decision.note,
    createdAt: decision.createdAt.toISOString(),
  };
}
