// The deal after acceptance (T313, contracts/api.md): the agent reads it, records milestones, marks
// a fall-through, and promotes a backup (201); the promoted investor reconfirms. One service call
// each; the workflow checks who may do what.
import { toDealView } from "@clever/contracts/deal";
import { toOfferView } from "@clever/contracts/offer";
import type { IDealLifecycleWorkflow } from "@clever/core";
import { Router } from "express";

export function createDealsRouter(deals: IDealLifecycleWorkflow): Router {
  const router = Router();
  router.get("/listing-packages/:id/deal", async (req, res) => {
    res.status(200).json(toDealView(await deals.get(res.locals.actor, req.params.id)));
  });
  router.post("/deals/:dealId/milestones", async (req, res) => {
    const parts = await deals.recordMilestone(res.locals.actor, req.params.dealId, req.body);
    res.status(200).json(toDealView(parts));
  });
  router.post("/deals/:dealId/fall-through", async (req, res) => {
    const parts = await deals.fallThrough(res.locals.actor, req.params.dealId, req.body);
    res.status(200).json(toDealView(parts));
  });
  router.post("/listing-packages/:id/backup-promotions", async (req, res) => {
    const parts = await deals.promoteBackup(res.locals.actor, req.params.id, req.body);
    res.status(201).json(toDealView(parts));
  });
  router.post("/offers/:offerId/reconfirmation", async (req, res) => {
    const offer = await deals.reconfirm(res.locals.actor, req.params.offerId, req.body);
    res.status(200).json(toOfferView(offer));
  });
  return router;
}
