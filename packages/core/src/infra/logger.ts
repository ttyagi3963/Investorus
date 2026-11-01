// The logger factory every app uses: pino JSON lines, with the request headers that carry a session
// token or cookie redacted by path (pino-http logs them), on top of redactPii for contexts.
import { pino, type Logger } from "pino";

export function createLogger(name: string, level = "info"): Logger {
  return pino({
    name,
    level,
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'],
      censor: "[REDACTED]",
    },
  });
}
