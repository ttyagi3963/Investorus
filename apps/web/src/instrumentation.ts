// Stops the web server at startup when a required setting is missing or invalid (constitution XII).
// Next runs register() when the server starts, never during `next build`, which has no settings.
// Next also compiles this file for the Edge runtime, so the Node-only check is imported only on Node.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkSettingsOrExit } = await import("./check-settings");
  checkSettingsOrExit();
}
