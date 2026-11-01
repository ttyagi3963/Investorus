// The web server's startup check (instrumentation.ts): parses the settings, and on failure prints why
// and exits, because Next only logs a register() error and keeps serving. Node runtime only.
import { serverEnv } from "./env";

export function checkSettingsOrExit(): void {
  try {
    serverEnv();
  } catch (error) {
    process.stderr.write(`Invalid web settings: ${String(error)}\n`);
    process.exit(1);
  }
}
