// The api's settings, checked once at startup (T073, constitution XII): a missing or invalid value
// stops the process with every bad name printed, instead of failing on the first request.
import { z } from "zod";

export const apiEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  PII_ENCRYPTION_KEY: z.string().regex(/^v\d+:/, "Must be <version>:<base64 key>"),
  ADDRESS_HASH_KEY: z.string().min(16),
  STORAGE_PROVIDER: z.literal("sandbox"),
  SANDBOX_URL: z.url(),
  PUBLIC_SANDBOX_URL: z.url(),
  SANDBOX_INTERNAL_TOKEN: z.string().min(16),
  STORAGE_SIGNING_KEY: z.string().min(16),
  LOG_LEVEL: z.string().default("info"),
  PORT: z.coerce.number().int().positive().default(4000),
});
export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function parseEnv(env: NodeJS.ProcessEnv): ApiEnv {
  const parsed = apiEnvSchema.safeParse(env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    process.stderr.write(`api: missing or invalid settings: ${names}\n`);
    process.exit(1);
  }
  return parsed.data;
}
