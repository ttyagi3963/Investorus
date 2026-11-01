// The logger factory every app uses: pino JSON lines, with the request headers that carry a session
// token or cookie redacted by path (pino-http logs them), on top of redactPii for contexts.
import { pino, type DestinationStream, type Logger } from "pino";

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
  };
  return destination ? pino(options, destination) : pino(options);
}
