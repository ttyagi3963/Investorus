// The sandbox's settings, checked at startup (T252): a missing or empty value stops the process with
// its name printed, instead of failing on the first request (constitution XII).
import { z } from "zod";

const envSchema = z.object({
  SANDBOX_STORAGE_DIR: z.string().min(1),
  STORAGE_SIGNING_KEY: z.string().min(16),
  SANDBOX_INTERNAL_TOKEN: z.string().min(16),
  WEB_ORIGIN: z.url(),
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
