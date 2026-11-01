// The worker's settings, checked once at startup (T294, T322, constitution XII): a missing or invalid
// value stops the process with every bad name printed, instead of failing on the first job. The
// storage settings are the api's, because the investor import reads the file the browser uploaded;
// S3's credentials come from the AWS environment variables, which the SDK reads itself. Deliveries
// (T339) need Redis and the CRM and messaging providers; only the sandbox ones exist, so any other
// provider name stops the worker at startup.
import { z } from "zod";

const common = z.object({
  DATABASE_URL: z.string().min(1),
  PII_ENCRYPTION_KEY: z.string().regex(/^v\d+:/, "Must be <version>:<base64 key>"),
  SANDBOX_URL: z.url(),
  PUBLIC_SANDBOX_URL: z.url(),
  SANDBOX_INTERNAL_TOKEN: z.string().min(16),
  STORAGE_SIGNING_KEY: z.string().min(16),
  LOG_LEVEL: z.string().default("info"),
  WORKER_HEARTBEAT_FILE: z.string().default("/tmp/worker-heartbeat"),
  REDIS_URL: z.url(),
  CRM_PROVIDER: z.literal("sandbox"),
  MESSAGING_PROVIDER: z.literal("sandbox"),
});

/** One branch per storage provider, so S3's bucket and region are required exactly when used. */
export const workerEnvSchema = z.discriminatedUnion("STORAGE_PROVIDER", [
  common.extend({ STORAGE_PROVIDER: z.literal("sandbox") }),
  common.extend({
    STORAGE_PROVIDER: z.literal("s3"),
    S3_BUCKET: z.string().min(1),
    S3_REGION: z.string().min(1),
  }),
]);
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function parseEnv(env: NodeJS.ProcessEnv): WorkerEnv {
  const parsed = workerEnvSchema.safeParse(env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    process.stderr.write(`worker: missing or invalid settings: ${names}\n`);
    process.exit(1);
  }
  return parsed.data;
}
