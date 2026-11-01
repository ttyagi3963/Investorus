// An investor's own buy boxes (T323, contracts/api.md): list, read, create (201), and save (PUT,
// which also pauses and resumes). One service call each; the service checks who may do what.
import { toBuyBoxView } from "@clever/contracts/buy-box";
import type { IBuyBoxService } from "@clever/core";
import { Router } from "express";

export function createBuyBoxesRouter(buyBoxes: IBuyBoxService): Router {
  const router = Router();
  router.get("/investor/buy-boxes", async (_req, res) => {
    res.status(200).json((await buyBoxes.list(res.locals.actor)).map(toBuyBoxView));
  });
  router.post("/investor/buy-boxes", async (req, res) => {
    res.status(201).json(toBuyBoxView(await buyBoxes.create(res.locals.actor, req.body)));
  });
  router.get("/investor/buy-boxes/:id", async (req, res) => {
    res.status(200).json(toBuyBoxView(await buyBoxes.get(res.locals.actor, req.params.id)));
  });
  router.put("/investor/buy-boxes/:id", async (req, res) => {
    const box = await buyBoxes.update(res.locals.actor, req.params.id, req.body);
    res.status(200).json(toBuyBoxView(box));
  });
  return router;
}
