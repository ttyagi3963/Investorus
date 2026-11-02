// The web server's settings (T261, T327, T349, T356, T372, T389): the api's internal URL, whether the
// cookies are Secure (auto: when the browser came over HTTPS), the brand a request renders when neither its cookie nor its host names one,
// the sandbox's address in the browser, which the home page links to, and the api's storage choice,
// whose origin the page policy allows photos from.
// Parsed by instrumentation.ts when the server starts, not at import, because `next build` imports
// this file without them.
import { z } from "zod";

const webEnvSchema = z
  .object({
    API_URL: z.url(),
    COOKIE_SECURE: z.enum(["auto", "true", "false"]).default("auto"),
    DEFAULT_BRAND_ID: z.string().min(1),
    PUBLIC_SANDBOX_URL: z.url(),
  })
  .and(
    // The same choice the api reads (apps/api/src/env.ts), so the browser may reach the bucket.
    z.discriminatedUnion("STORAGE_PROVIDER", [
      z.object({ STORAGE_PROVIDER: z.literal("sandbox") }),
      z.object({
        STORAGE_PROVIDER: z.literal("s3"),
        S3_BUCKET: z.string().min(1),
        S3_REGION: z.string().min(1),
      }),
    ]),
  );
export type WebEnv = z.infer<typeof webEnvSchema>;

let cached: WebEnv | undefined;

export function serverEnv(): WebEnv {
  return (cached ??= webEnvSchema.parse(process.env));
}

/** Where the browser uploads and reads photos: the sandbox, or the S3 bucket's own host. */
export function storageOrigin(env: WebEnv): string {
  return env.STORAGE_PROVIDER === "s3"
    ? `https://${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com`
    : new URL(env.PUBLIC_SANDBOX_URL).origin;
}
