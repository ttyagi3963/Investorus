// The seller's decision and the comparison behind it (T313, contracts/api.md): the agent compares
// the offers side by side, then records accept, counter, or decline all (201). One service call
// each; the services check who may do what.
import { toDecisionView } from "@clever/contracts/deal";
import { toOfferView } from "@clever/contracts/offer";
import type { IDecisionWorkflow, IOfferComparisonService } from "@clever/core";
import { Router } from "express";

export function createDecisionsRouter(
  comparison: IOfferComparisonService,
  decisions: IDecisionWorkflow,
): Router {
  const router = Router();
  router.get("/listing-packages/:id/offer-comparison", async (req, res) => {
    const { rows, assumptions } = await comparison.compare(
      res.locals.actor,
      req.params.id,
      req.query,
    );
    res.status(200).json({
      rows: rows.map((row) => ({ ...row, offer: toOfferView(row.offer) })),
      assumptions,
    });
  });
  router.post("/listing-packages/:id/decisions", async (req, res) => {
    const decision = await decisions.record(res.locals.actor, req.params.id, req.body);
    res.status(201).json(toDecisionView(decision));
  });
  return router;
}
