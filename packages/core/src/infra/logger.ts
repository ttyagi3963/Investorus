// The logger factory every app uses: pino JSON lines, with the request headers that carry a session
// token or cookie redacted by path (pino-http logs them), on top of redactPii for contexts. Each
// line logged inside a request or job carries its trace ID as `trace_id` (T283).
import { pino, type DestinationStream, type Logger } from "pino";
import { currentTraceId } from "./trace-context.js";

export function createLogger(
  name: string,
  { level = "info", destination }: { level?: string; destination?: DestinationStream } = {},
): Logger {
  const options = {
    name,
    level,
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'],
      censor: "[REDACTED]",
    },
    mixin: () => {
      const traceId = currentTraceId();
      return traceId ? { trace_id: traceId } : {};
    },
  };
  return destination ? pino(options, destination) : pino(options);
}
