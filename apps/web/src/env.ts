// The web server's settings (T261, T327, T349, T356, T372): the api's internal URL, whether the
// cookies are Secure (auto: when the browser came over HTTPS), the brand a request renders when neither its cookie nor its host names one, and
// the sandbox's address in the browser, which the home page links to.
// Parsed by instrumentation.ts when the server starts, not at import, because `next build` imports
// this file without them.
import { z } from "zod";

const webEnvSchema = z.object({
  API_URL: z.url(),
  COOKIE_SECURE: z.enum(["auto", "true", "false"]).default("auto"),
  DEFAULT_BRAND_ID: z.string().min(1),
  PUBLIC_SANDBOX_URL: z.url(),
});
export type WebEnv = z.infer<typeof webEnvSchema>;

let cached: WebEnv | undefined;

export function serverEnv(): WebEnv {
  return (cached ??= webEnvSchema.parse(process.env));
}
