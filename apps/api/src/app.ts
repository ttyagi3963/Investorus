// Sprint 0 shell (T232): only the health route, so the container has something to check.
// T081 replaces this with createApp(container) and the routers mounted at /api/v1.
import express, { type Express } from "express";

export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.get("/api/v1/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });
  return app;
}
