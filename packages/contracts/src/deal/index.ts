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
  type FallThroughInput,
  type MilestoneInput,
  type PromoteBackupInput,
  type ReconfirmationInput,
} from "./inputs.js";
export {
  toDealView,
  toDecisionView,
  type BackupView,
  type DealParts,
  type DealView,
  type DecisionView,
} from "./views.js";
