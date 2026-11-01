// The operations console (T341; contracts/api.md): packages and one package's trace, why an investor
// was or was not matched, deliveries with retry and retry-all (202: the relay sends them), the CRM
// comparison, and the stand-in services' outage modes. One service call per route; the services
// check that the caller is operations.
import type { IDeliveryOpsService, IOpsQueryService, IOutsideServicesService } from "@clever/core";
import { Router } from "express";

export function createOpsRouter(services: {
  queries: IOpsQueryService;
  deliveries: IDeliveryOpsService;
  outside: IOutsideServicesService;
}): Router {
  const { queries, deliveries, outside } = services;
  const router = Router();
  router.get("/ops/listing-packages", async (_req, res) => {
    res.status(200).json(await queries.listPackages(res.locals.actor));
  });
  router.get("/ops/listing-packages/:id/trace", async (req, res) => {
    res.status(200).json(await queries.trace(res.locals.actor, req.params.id));
  });
  router.get("/ops/listing-packages/:id/matches/:investorId", async (req, res) => {
    const { id, investorId } = req.params;
    res.status(200).json(await queries.explainMatch(res.locals.actor, id, investorId));
  });
  router.get("/ops/deliveries", async (req, res) => {
    res.status(200).json(await deliveries.list(res.locals.actor, req.query));
  });
  router.post("/ops/deliveries/retry-all", async (req, res) => {
    res.status(202).json(await deliveries.retryAll(res.locals.actor, req.body));
  });
  router.post("/ops/deliveries/:id/retry", async (req, res) => {
    await deliveries.retry(res.locals.actor, req.params.id);
    res.status(202).end();
  });
  router.get("/ops/crm-comparison", async (_req, res) => {
    res.status(200).json(await outside.crmComparison(res.locals.actor));
  });
  router.get("/ops/simulations", async (_req, res) => {
    res.status(200).json(await outside.simulations(res.locals.actor));
  });
  router.put("/ops/simulations/:service", async (req, res) => {
    res
      .status(200)
      .json(await outside.setSimulation(res.locals.actor, req.params.service, req.body));
  });
  return router;
}
