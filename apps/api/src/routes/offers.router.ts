// Offers (T298, contracts/api.md): an investor makes one (201) and revises it (200); the package's
// agent lists them. One service call each; the service checks who may do what.
import { toOfferView } from "@clever/contracts/offer";
import type { IOfferService } from "@clever/core";
import { Router } from "express";

export function createOffersRouter(offers: IOfferService): Router {
  const router = Router();
  router.post("/listing-packages/:id/offers", async (req, res) => {
    res
      .status(201)
      .json(toOfferView(await offers.create(res.locals.actor, req.params.id, req.body)));
  });
  router.get("/listing-packages/:id/offers", async (req, res) => {
    const list = await offers.listForPackage(res.locals.actor, req.params.id);
    res.status(200).json(list.map(toOfferView));
  });
  router.patch("/offers/:offerId", async (req, res) => {
    const revised = await offers.revise(res.locals.actor, req.params.offerId, req.body);
    res.status(200).json(toOfferView(revised));
  });
  return router;
}
