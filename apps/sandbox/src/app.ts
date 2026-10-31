// Sprint 0 shell (T232): the inspection page placeholder that the container healthcheck reads.
// T070 adds the sandbox schema and store, and T071 the CRM, messaging, and storage routes.
import express, { type Express } from "express";

const PAGE = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Sandbox</title></head>
  <body>
    <h1>Sandbox</h1>
    <p>Stand-in CRM, messaging, and storage services. The inspection page arrives with T071.</p>
  </body>
</html>
`;

export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.get("/", (_req, res) => {
    res.status(200).type("html").send(PAGE);
  });
  return app;
}
