// The api's settings, checked once at startup (T073, constitution XII): a missing or invalid value
// stops the process with every bad name printed, instead of failing on the first request. S3 needs
// S3_BUCKET and S3_REGION; its credentials come from the AWS environment variables, which the SDK
// reads itself, so they never pass through here or the committed .env.
import { z } from "zod";

export const apiEnvSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32),
    PII_ENCRYPTION_KEY: z.string().regex(/^v\d+:/, "Must be <version>:<base64 key>"),
    ADDRESS_HASH_KEY: z.string().min(16),
    STORAGE_PROVIDER: z.enum(["sandbox", "s3"]),
    S3_BUCKET: z.string().min(1).optional(),
    S3_REGION: z.string().min(1).optional(),
    SANDBOX_URL: z.url(),
    PUBLIC_SANDBOX_URL: z.url(),
    SANDBOX_INTERNAL_TOKEN: z.string().min(16),
    STORAGE_SIGNING_KEY: z.string().min(16),
    LOG_LEVEL: z.string().default("info"),
    PORT: z.coerce.number().int().positive().default(4000),
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_PROVIDER !== "s3") return;
    for (const name of ["S3_BUCKET", "S3_REGION"] as const) {
      if (!env[name]) ctx.addIssue({ code: "custom", path: [name], message: "Required for S3" });
    }
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
