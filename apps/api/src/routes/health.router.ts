// GET /health (T254): answers 200 once the database answers `SELECT 1`; a database failure becomes
// an InfrastructureError and so a 503 through the error translator.
import { Router } from "express";

export function createHealthRouter(checkDatabase: () => Promise<void>): Router {
  const router = Router();
  router.get("/health", async (_req, res) => {
    await checkDatabase();
    res.status(200).json({ status: "ok", db: "ok" });
  });
  return router;
}
