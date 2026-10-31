// Entry point. Sprint 0 shell (T232): listen on 0.0.0.0:4100. T070 adds env parsing, the
// sandbox schema, and the store.
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4100);
const server = createApp().listen(port, "0.0.0.0", () => {
  process.stdout.write(`sandbox listening on 0.0.0.0:${port}\n`);
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
