// The sandbox app: the outside world the platform talks to, in one container. Today it serves the
// inspection page placeholder and object storage (T252); CRM, messaging, and outage simulation
// arrive with T070 and T071.
import express, { type Express } from "express";
import { storageRoutes, type StorageConfig } from "./storage.js";

const PAGE = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Sandbox</title></head>
  <body>
    <h1>Sandbox</h1>
    <p>Stand-in CRM, messaging, and storage services. The inspection page arrives with T071.</p>
  </body>
</html>
`;

export function createApp(config: StorageConfig): Express {
  const app = express();
  app.disable("x-powered-by");
  app.get("/", (_req, res) => {
    res.status(200).type("html").send(PAGE);
  });
  app.use(storageRoutes(config));
  return app;
}
