// The one place unexpected errors are sent (constitution XII: observability hooks only at the error
// translator's unexpected branch). Today it writes a log line; a vendor such as Sentry would be
// another implementation of this port.

export interface IErrorReporter {
  report(err: unknown, context?: Record<string, unknown>): void;
}
