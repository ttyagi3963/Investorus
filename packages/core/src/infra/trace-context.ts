// The request's trace context (T283): the trace ID of the request or job being handled, kept in
// AsyncLocalStorage so the logger, the audit log, and the job table read it without any code
// passing it along. OpenTelemetry keeps its context the same way, so its SDK can replace this.
import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage<{ traceId: string }>();

/** Runs `work`, and everything it awaits or schedules, inside the trace `traceId`. */
export function runWithTrace<T>(traceId: string, work: () => T): T {
  return storage.run({ traceId }, work);
}

/** The trace ID of the request or job being handled, if any. */
export function currentTraceId(): string | undefined {
  return storage.getStore()?.traceId;
}
