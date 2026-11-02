// The sandbox app: the outside world the platform talks to, in one container. It serves the stand-in
// CRM and email/SMS (T338), object storage (T252), an outage mode per service in front of each, and
// the inspection page at /. Its records live in the `sandbox` schema; storage objects are files.
import express, { type ErrorRequestHandler, type Express } from "express";
import { crmRoutes } from "./crm.js";
import { inspectionPage } from "./inspection.js";
import { messageRoutes } from "./messages.js";
import { simulation } from "./simulation.js";
import { storageCors, storageRoutes, type StorageConfig } from "./storage.js";
import type { SandboxStore } from "./store.js";

export type SandboxConfig = StorageConfig & {
  store: SandboxStore;
  /** How long slow mode waits before answering: 10 s in the demo, shorter in tests. */
  slowDelayMs: number;
};

/**
 * What a failure's log line may say: the error's class, its code, and where it was thrown. Never
 * its message, which can quote a value being stored, such as a seller's contact (T392).
 */
function safeSummary(err: unknown): string {
  if (!(err instanceof Error)) return "a non-Error value was thrown";
  const code = "code" in err && typeof err.code === "string" ? ` (${err.code})` : "";
  const frames = (err.stack ?? "").split("\n").filter((line) => line.trimStart().startsWith("at "));
  return [`${err.name}${code}`, ...frames].join("\n");
}

/** A bad JSON body keeps its 4xx; anything else is a 500 without internals, logged safely. */
const onError: ErrorRequestHandler = (err: { status?: number }, req, res, _next) => {
  const status = err.status && err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) {
    // The path, not the URL: an upload link's query carries its signature.
    process.stderr.write(`sandbox: ${req.method} ${req.path} failed: ${safeSummary(err)}\n`);
  }
  res.status(status).json({ error: status === 500 ? "Internal error" : "Invalid request" });
};

export function createApp(config: SandboxConfig): Express {
  const { store, internalToken, slowDelayMs } = config;
  const outages = simulation({ store, internalToken, slowDelayMs });
  const app = express();
  app.disable("x-powered-by");
  app.get("/", inspectionPage(store));
  app.use(outages.routes);
  app.use(crmRoutes({ store, internalToken, gate: outages.gate("crm") }));
  app.use(messageRoutes({ store, internalToken, gate: outages.gate("messaging") }));
  // CORS first: a browser must be able to read an outage's answer, or it sees only a network error.
  app.use(storageCors(config.webOrigins));
  app.use(["/storage/objects", "/internal/storage/objects"], outages.gate("storage"));
  app.use(storageRoutes(config));
  app.use(onError);
  return app;
}
