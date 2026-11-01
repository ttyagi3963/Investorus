// Entry point (T294, T339, T348): check the settings, build the container, stop if the default
// brand the messages carry is not in the database, write the heartbeat file (a
// liveness signal, since the worker has no port), and run the job loop, the outbox relay, and the
// delivery consumer. On SIGTERM or SIGINT each finishes the work in hand and takes no more, then the
// queue and the database pool close.
import { writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { createContainer } from "./container.js";
import { parseEnv } from "./env.js";
import { startHeartbeat } from "./heartbeat.js";
import { startJobLoop } from "./job-runner.js";
import { startRelayLoop } from "./relay-loop.js";

/** Deliveries sent at once; each waits on an outside service, so a few run side by side. */
const DELIVERY_CONCURRENCY = 5;

const env = parseEnv(process.env);
const container = await createContainer(env);
if (!(await container.uow.run((repos) => repos.brands.findById(env.DEFAULT_BRAND_ID)))) {
  container.logger.fatal(
    { brand_id: env.DEFAULT_BRAND_ID },
    "DEFAULT_BRAND_ID names no brand in the database; check .env and seed/brands/",
  );
  await container.dispose();
  process.exit(1);
}
// The daily match digest keeps itself scheduled; this queues the first run (keyed, so once).
await container.digests.ensureScheduled();
const stopHeartbeat = startHeartbeat(
  () => writeFileSync(env.WORKER_HEARTBEAT_FILE, String(Date.now())),
  10_000,
);
const loop = startJobLoop({ ...container, workerId: `${hostname()}-${process.pid}` });
const relay = startRelayLoop(container);
container.deliveries.startConsumer((id) => container.dispatcher.dispatch(id), {
  concurrency: DELIVERY_CONCURRENCY,
  onSetAside: (deliveryId, error) =>
    container.logger.warn({ delivery_id: deliveryId, error }, "delivery needs attention"),
});
container.logger.info("worker started");

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    stopHeartbeat();
    void Promise.all([loop.stop(), relay.stop()])
      .then(() => container.dispose())
      .then(() => process.exit(0));
  });
}
