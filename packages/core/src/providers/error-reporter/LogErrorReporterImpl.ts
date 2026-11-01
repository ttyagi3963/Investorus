// Reports an unexpected error as one structured pino `error` line. Its context goes through
// redactPii and its message, stack, and cause through scrubPiiText, because an error often quotes
// the value that broke it (constitution XII, XX.1).
import type { Logger } from "pino";
import { InfrastructureError } from "../../errors/InfrastructureError.js";
import { redactPii, scrubPiiText } from "../../errors/redact-pii.js";
import type { IErrorReporter } from "./IErrorReporter.js";

export class LogErrorReporterImpl implements IErrorReporter {
  constructor(private readonly logger: Pick<Logger, "error">) {}

  report(err: unknown, context: Record<string, unknown> = {}): void {
    const error =
      err instanceof Error
        ? {
            name: err.name,
            message: scrubPiiText(err.message),
            stack: err.stack === undefined ? undefined : scrubPiiText(err.stack),
            cause:
              err instanceof InfrastructureError
                ? scrubPiiText(String(err.underlyingCause))
                : undefined,
          }
        : { name: "NonError", message: scrubPiiText(String(err)) };
    this.logger.error({ err: error, context: redactPii(context) }, error.message);
  }
}
