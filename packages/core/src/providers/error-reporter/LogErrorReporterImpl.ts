// Reports an unexpected error as one structured pino `error` line, with its context passed through
// redactPii so no PII reaches the log (constitution XII).
import type { Logger } from "pino";
import { InfrastructureError } from "../../errors/InfrastructureError.js";
import { redactPii } from "../../errors/redact-pii.js";
import type { IErrorReporter } from "./IErrorReporter.js";

export class LogErrorReporterImpl implements IErrorReporter {
  constructor(private readonly logger: Pick<Logger, "error">) {}

  report(err: unknown, context: Record<string, unknown> = {}): void {
    const error =
      err instanceof Error
        ? {
            name: err.name,
            message: err.message,
            stack: err.stack,
            cause: err instanceof InfrastructureError ? String(err.underlyingCause) : undefined,
          }
        : { message: String(err) };
    this.logger.error({ err: error, context: redactPii(context) }, error.message);
  }
}
