// Public API of @clever/contracts/deal. Other packages import from here, never from the
// individual files, so the files can change without breaking callers.
export {
  DEAL_STATUSES,
  DECISION_TYPES,
  type Deal,
  type DealStatus,
  type Decision,
  type DecisionType,
} from "./deal.js";
export {
  DEAL_MILESTONES,
  createDecisionSchema,
  fallThroughInputSchema,
  milestoneInputSchema,
  promoteBackupSchema,
  reconfirmationSchema,
  type CreateDecisionInput,
  type DealMilestone,
} from "./inputs.js";
export { toDecisionView, type DealParts, type DecisionView } from "./views.js";
