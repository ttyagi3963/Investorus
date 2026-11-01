// The web server's settings (T261): the api's internal URL and whether the session cookie is Secure.
// Checked on first use rather than at import, because `next build` runs without them; a missing or
// invalid value then fails the request with its name instead of silently misrouting.
import { z } from "zod";

const webEnvSchema = z.object({
  API_URL: z.url(),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
});
export type WebEnv = z.infer<typeof webEnvSchema>;

let cached: WebEnv | undefined;

export function serverEnv(): WebEnv {
  return (cached ??= webEnvSchema.parse(process.env));
}
