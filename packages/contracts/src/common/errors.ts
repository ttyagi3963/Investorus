// The expected business rejections every layer shares (constitution VII). Each carries its HTTP
// status and a stable code, so the api's error translator can answer without knowing the cause.

export type FieldError = { field: string; message: string };

export abstract class DomainError extends Error {
  abstract readonly status: number;
  abstract readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
    if (details) this.details = details;
  }
}

/** 400: input that breaks a rule, with each failing field named (FR-012). */
export class ValidationError extends DomainError {
  readonly status = 400;
  readonly code = "VALIDATION_FAILED";
  constructor(message: string, fields: FieldError[] = []) {
    super(message, { fields });
  }
}

/** 403: the caller is signed in but may not do this. */
export class ForbiddenError extends DomainError {
  readonly status = 403;
  readonly code = "FORBIDDEN";
}

/** 404: not found, also used when the caller may not know the thing exists. */
export class NotFoundError extends DomainError {
  readonly status = 404;
  readonly code = "NOT_FOUND";
}

/** 409: a business rule refuses the change; `code` names which (e.g. DUPLICATE_ACTIVE_LISTING). */
export class BusinessRuleError extends DomainError {
  readonly status = 409;
  readonly code: string;
  constructor(message: string, code = "BUSINESS_RULE", details?: Record<string, unknown>) {
    super(message, details);
    this.code = code;
  }
}

/** 409: the record changed since the caller read it (a stale `version`), or an illegal transition. */
export class ConflictError extends DomainError {
  readonly status = 409;
  readonly code = "CONFLICT";
}
