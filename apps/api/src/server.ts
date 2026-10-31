// Entry point. Sprint 0 shell (T232): listen on 0.0.0.0 so the port is reachable from outside
// the container. T081 adds env parsing, the container, and dispose on shutdown.
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4000);
const server = createApp().listen(port, "0.0.0.0", () => {
  process.stdout.write(`api listening on 0.0.0.0:${port}\n`);
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
