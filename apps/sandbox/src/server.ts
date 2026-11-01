// Entry point: check the settings, then listen on 0.0.0.0 (PORT, default 4100). A missing setting
// stops the process before it listens.
import { createApp } from "./app.js";
import { parseEnv } from "./env.js";

const env = parseEnv(process.env);
const app = createApp({
  storageDir: env.SANDBOX_STORAGE_DIR,
  signingKey: env.STORAGE_SIGNING_KEY,
  internalToken: env.SANDBOX_INTERNAL_TOKEN,
  webOrigin: env.WEB_ORIGIN,
  now: () => new Date(),
});
const server = app.listen(env.PORT, "0.0.0.0", () => {
  process.stdout.write(`sandbox listening on 0.0.0.0:${env.PORT}\n`);
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
