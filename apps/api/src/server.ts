// Entry point (T255): check the settings, build the container, listen on 0.0.0.0 (PORT, default
// 4000), and close the database pool on shutdown. A missing setting stops the process first.
import { createApp } from "./app.js";
import { createContainer } from "./container.js";
import { parseEnv } from "./env.js";

const env = parseEnv(process.env);
const container = createContainer(env);
const server = createApp(container).listen(env.PORT, "0.0.0.0", () => {
  container.logger.info(`api listening on 0.0.0.0:${env.PORT}`);
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () =>
    server.close(() => void container.dispose().then(() => process.exit(0))),
  );
}
