// Public API of @clever/contracts/common: shapes every entity shares. Other packages import from
// here, never from the individual files.
export {
  BusinessRuleError,
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  type FieldError,
} from "./errors.js";
