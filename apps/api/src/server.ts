// Entry point (T255): check the settings, build the container, listen on 0.0.0.0 (PORT, default
// 4000), and on SIGTERM or SIGINT stop taking requests and close the database pool, within a time
// limit (T391). A missing setting stops the process first.
import { createApp } from "./app.js";
import { createContainer } from "./container.js";
import { parseEnv } from "./env.js";

/** Under compose's 10-second stop grace, so the api exits on its own before it is killed. */
const SHUTDOWN_LIMIT_MS = 8_000;

const env = parseEnv(process.env);
const container = createContainer(env);
const server = createApp(container).listen(env.PORT, "0.0.0.0", () => {
  container.logger.info(`api listening on 0.0.0.0:${env.PORT}`);
});

let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    setTimeout(() => {
      container.logger.error(`shutdown took over ${SHUTDOWN_LIMIT_MS} ms; exiting`);
      process.exit(1);
    }, SHUTDOWN_LIMIT_MS).unref();
    new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
      .then(() => container.dispose())
      .then(
        () => process.exit(0),
        (err: unknown) => {
          container.reporter.report(err, { during: "shutdown" });
          process.exit(1);
        },
      );
  });
}
