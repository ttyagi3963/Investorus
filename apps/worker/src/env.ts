// The worker's settings, checked once at startup (T294, constitution XII): a missing or invalid
// value stops the process with every bad name printed, instead of failing on the first job.
import { z } from "zod";

export const workerEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PII_ENCRYPTION_KEY: z.string().regex(/^v\d+:/, "Must be <version>:<base64 key>"),
  LOG_LEVEL: z.string().default("info"),
  WORKER_HEARTBEAT_FILE: z.string().default("/tmp/worker-heartbeat"),
});
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
