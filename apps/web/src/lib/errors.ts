// Turns a failed call into what a screen shows (T300): the api's own message for the caller's
// mistakes, a fallback for outages, and the request ID either way, so a user can quote it to
// support and support can find the whole request in the logs.
import { ApiError } from "@clever/contracts/client";

export type ErrorInfo = { message: string; requestId?: string };

export function describeError(err: unknown, fallback: string): ErrorInfo {
  if (!(err instanceof ApiError)) return { message: fallback };
  const message = err.status < 500 ? err.message : fallback;
  return err.requestId ? { message, requestId: err.requestId } : { message };
}

/** The same as one line of text, for a message that is a plain string. */
export function errorText(err: unknown, fallback: string): string {
  const { message, requestId } =
    err instanceof Error && !(err instanceof ApiError)
      ? { message: err.message, requestId: undefined }
      : describeError(err, fallback);
  return requestId ? `${message} (request ID ${requestId})` : message;
}

/**
 * True when the api says the thing no longer exists (404). React Query keeps the last good data when
 * a refetch fails, which is right for an outage but wrong for a deleted record, so a page checks this
 * before showing data it remembered.
 */
export function isGone(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}
