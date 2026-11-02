// Entry point: check the settings, create the `sandbox` schema and its tables, then listen on
// 0.0.0.0 (PORT, default 4100). A missing setting or an unreachable database stops the process
// before it listens; SIGTERM stops taking requests, then closes the database pool, within a time
// limit (T391).
import pg from "pg";
import { createApp } from "./app.js";
import { parseEnv } from "./env.js";
import { createStore } from "./store.js";

const SLOW_MODE_DELAY_MS = 10_000;
/** Under compose's 10-second stop grace; a request held by slow mode would otherwise outlast it. */
const SHUTDOWN_LIMIT_MS = 8_000;

const env = parseEnv(process.env);
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 5 });
// An idle connection that drops (for example a database restart) must not crash the process.
pool.on("error", (error) =>
  process.stderr.write(`sandbox: database pool error: ${error.message}\n`),
);
const store = createStore(pool);
await store.ensureSchema();

const app = createApp({
  storageDir: env.SANDBOX_STORAGE_DIR,
  signingKey: env.STORAGE_SIGNING_KEY,
  internalToken: env.SANDBOX_INTERNAL_TOKEN,
  webOrigins: env.WEB_ORIGIN,
  now: () => new Date(),
  store,
  slowDelayMs: SLOW_MODE_DELAY_MS,
});
const server = app.listen(env.PORT, "0.0.0.0", () => {
  process.stdout.write(`sandbox listening on 0.0.0.0:${env.PORT}\n`);
});

let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    setTimeout(() => {
      process.stderr.write(`sandbox: shutdown took over ${SHUTDOWN_LIMIT_MS} ms; exiting\n`);
      process.exit(1);
    }, SHUTDOWN_LIMIT_MS).unref();
    server.close(() => void pool.end().finally(() => process.exit(0)));
  });
}
