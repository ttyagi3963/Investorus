// The agent's packages (T256, T298, contracts/api.md): list, create (201), read, edit, publish,
// withdraw, and the timeline of what happened. Each route makes one service call and maps the
// result to its view; `presentPackage` (built in the container) signs the photos' short-lived read
// links on the way.
import { toTimelineEntryView } from "@clever/contracts/audit";
import {
  toAgentPackageSummary,
  type AgentPackageParts,
  type AgentPackageView,
} from "@clever/contracts/listing-package";
import type { IListingPackageService, IPublicationWorkflow } from "@clever/core";
import { Router } from "express";

export function createListingPackagesRouter(
  packages: IListingPackageService,
  publication: IPublicationWorkflow,
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
  router.post("/listing-packages/:id/publication", async (req, res) => {
    const published = await publication.publish(res.locals.actor, req.params.id, req.body);
    res.status(200).json(await presentPackage(published));
  });
  router.post("/listing-packages/:id/withdrawal", async (req, res) => {
    const withdrawn = await publication.withdraw(res.locals.actor, req.params.id, req.body);
    res.status(200).json(await presentPackage(withdrawn));
  });
  router.get("/listing-packages/:id/timeline", async (req, res) => {
    const entries = await packages.timeline(res.locals.actor, req.params.id);
    res.status(200).json(entries.map(toTimelineEntryView));
  });
  return router;
}
