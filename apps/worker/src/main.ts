// Entry point. Sprint 0 shell (T232): stays alive and writes a heartbeat file for the container
// healthcheck. T082 adds env parsing and the container, and T083 the job and outbox loops with
// graceful shutdown.
import { writeFileSync } from "node:fs";
import { startHeartbeat } from "./heartbeat.js";

const heartbeatFile = process.env.WORKER_HEARTBEAT_FILE ?? "/tmp/worker-heartbeat";
const stop = startHeartbeat(() => writeFileSync(heartbeatFile, String(Date.now())), 10_000);
process.stdout.write("worker started (no job loops yet; they arrive with T083)\n");

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    stop();
    process.exit(0);
  });
}
