// The api's last two handlers (T253): an unknown route is a 404, and every error from a route or
// middleware goes through core's translateError, which names invalid fields, keeps domain statuses,
// and gives anything unexpected a generic message (constitution VII). Routes never catch errors.
// The JSON body parser's own errors are the caller's mistakes, so they become domain errors first.
// Every error body names the request's trace ID as `requestId`, so a user can quote it (T283).
import { DomainError, ValidationError } from "@clever/contracts/common";
import { translateError, type IErrorReporter } from "@clever/core";
import type { ErrorRequestHandler, RequestHandler } from "express";

/** 413: a request body over the api's 1 MB limit. */
class PayloadTooLargeError extends DomainError {
  readonly status = 413;
  readonly code = "PAYLOAD_TOO_LARGE";
}

/** express.json() marks its errors with a `type`; anything else passes through unchanged. */
function fromBodyParser(err: unknown): unknown {
  const type = (err as { type?: unknown } | null)?.type;
  if (type === "entity.parse.failed")
    return new ValidationError("The request body is not valid JSON");
  if (type === "entity.too.large") return new PayloadTooLargeError("The request body is too large");
  return err;
}

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "Not found", code: "NOT_FOUND", requestId: res.locals.traceId });
};

export function errorTranslator(reporter: IErrorReporter): ErrorRequestHandler {
  return (err, _req, res, _next) => {
    const { status, body } = translateError(fromBodyParser(err), { reporter });
    res.status(status).json({ ...body, requestId: res.locals.traceId });
  };
}
