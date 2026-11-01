// Entry point (T294): check the settings, build the container, write the heartbeat file (a
// liveness signal, since the worker has no port), and run the job loop. On SIGTERM or SIGINT the
// loop finishes its running job, then the database pool closes.
import { writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { createContainer } from "./container.js";
import { parseEnv } from "./env.js";
import { startHeartbeat } from "./heartbeat.js";
import { startJobLoop } from "./job-runner.js";

const env = parseEnv(process.env);
const container = createContainer(env);
const stopHeartbeat = startHeartbeat(
  () => writeFileSync(env.WORKER_HEARTBEAT_FILE, String(Date.now())),
  10_000,
);
const loop = startJobLoop({ ...container, workerId: `${hostname()}-${process.pid}` });
container.logger.info("worker started");

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    stopHeartbeat();
    void loop
      .stop()
      .then(() => container.dispose())
      .then(() => process.exit(0));
  });
}
