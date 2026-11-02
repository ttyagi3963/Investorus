// Turns any error into the api's `{ error, code, details? }` response (constitution VII): invalid
// input names its fields, expected errors keep their status, and anything unexpected gets a generic
// message and goes to the error reporter, so internals never reach the caller (XII).
import { DomainError } from "@clever/contracts/common";
import { ZodError } from "zod";
import type { IErrorReporter } from "../providers/error-reporter/IErrorReporter.js";
import { InfrastructureError } from "./InfrastructureError.js";

export type ErrorBody = {
  error: string;
  code: string;
  details?: { fields?: { field: string; message: string }[] } & Record<string, unknown>;
};

export function translateError(
  err: unknown,
  { reporter }: { reporter: IErrorReporter },
): { status: number; body: ErrorBody } {
  if (err instanceof ZodError) {
    const fields = err.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
    return {
      status: 400,
      body: {
        error: "Some fields need fixing. See the messages below.",
        code: "VALIDATION_FAILED",
        details: { fields },
      },
    };
  }
  if (err instanceof DomainError) {
    const body: ErrorBody = { error: err.message, code: err.code };
    if (err.details) body.details = err.details;
    return { status: err.status, body };
  }
  reporter.report(err);
  if (err instanceof InfrastructureError) {
    return {
      status: err.status,
      body: { error: "A service is unavailable. Try again shortly.", code: "UNAVAILABLE" },
    };
  }
  return { status: 500, body: { error: "Internal server error", code: "INTERNAL" } };
}
