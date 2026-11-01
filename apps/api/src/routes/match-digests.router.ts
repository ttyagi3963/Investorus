// Operations' "send the digest now" (T340; contracts/api.md): queues a daily match digest run at
// once (202, the job's ID). One workflow call; the workflow checks the caller is operations.
import type { IMatchDigestWorkflow } from "@clever/core";
import { Router } from "express";

export function createMatchDigestsRouter(digests: Pick<IMatchDigestWorkflow, "sendNow">): Router {
  const router = Router();
  router.post("/ops/match-digests", async (_req, res) => {
    res.status(202).json(await digests.sendNow(res.locals.actor));
  });
  return router;
}
