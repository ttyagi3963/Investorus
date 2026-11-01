// The agent's draft packages (T256, contracts/api.md): list, create (201), read, and edit. Each route
// makes one service call and maps the result to its view; `presentPackage` (built in the container)
// signs the photos' short-lived read links on the way.
import {
  toAgentPackageSummary,
  type AgentPackageParts,
  type AgentPackageView,
} from "@clever/contracts/listing-package";
import type { IListingPackageService } from "@clever/core";
import { Router } from "express";

export function createListingPackagesRouter(
  packages: IListingPackageService,
  presentPackage: (parts: AgentPackageParts) => Promise<AgentPackageView>,
): Router {
  const router = Router();
  router.get("/listing-packages", async (_req, res) => {
    const list = await packages.list(res.locals.actor);
    res.status(200).json(list.map(toAgentPackageSummary));
  });
  router.post("/listing-packages", async (req, res) => {
    const created = await packages.create(res.locals.actor, req.body);
    res.status(201).json(await presentPackage(created));
  });
  router.get("/listing-packages/:id", async (req, res) => {
    const found = await packages.get(res.locals.actor, req.params.id);
    res.status(200).json(await presentPackage(found));
  });
  router.patch("/listing-packages/:id", async (req, res) => {
    const updated = await packages.update(res.locals.actor, req.params.id, req.body);
    res.status(200).json(await presentPackage(updated));
  });
  return router;
}
