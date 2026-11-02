// The sandbox's settings, checked at startup (T252, T338): a missing or empty value stops the process
// with its name printed, instead of failing on the first request (constitution XII). DATABASE_URL is
// the platform's database; the sandbox uses only its own `sandbox` schema there. WEB_ORIGIN lists the
// web app's addresses, comma-separated (one per brand host, T372), that may upload from the browser.
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SANDBOX_STORAGE_DIR: z.string().min(1),
  STORAGE_SIGNING_KEY: z.string().min(16),
  SANDBOX_INTERNAL_TOKEN: z.string().min(16),
  WEB_ORIGIN: z
    .string()
    .transform((value) => value.split(",").map((origin) => origin.trim()))
    .pipe(z.array(z.url()).min(1)),
  PORT: z.coerce.number().int().positive().default(4100),
});
export type SandboxEnv = z.infer<typeof envSchema>;

export function parseEnv(env: NodeJS.ProcessEnv): SandboxEnv {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    process.stderr.write(`sandbox: missing or invalid settings: ${names}\n`);
    process.exit(1);
  }
  return parsed.data;
}
