// Stops the web server at startup when a required setting is missing or invalid (constitution XII).
// Next runs register() when the server starts, never during `next build`, which has no settings.
// Next logs the error but keeps serving, so this exits to make the failure visible.
import { serverEnv } from "./env";

export function register(): void {
  try {
    serverEnv();
  } catch (error) {
    process.stderr.write(`Invalid web settings: ${String(error)}\n`);
    process.exit(1);
  }
}
