// The agent's packages (T256, T298, T313, contracts/api.md): list, create (201), read (operations
// too, T386), edit, publish, withdraw, reopen, extend the deadline, and the timeline of what
// happened. Each route makes one service call and maps the
// result to its view; `presentPackage` and `presentSummary` (built in the container) add the
// photos' public addresses on the way.
import { toTimelineEntryView } from "@clever/contracts/audit";
import {
  type AgentPackageParts,
  type AgentPackageSummary,
  type AgentPackageSummaryParts,
  type AgentPackageView,
} from "@clever/contracts/listing-package";
import type { IListingPackageService, IPublicationWorkflow } from "@clever/core";
import { Router } from "express";

export function createListingPackagesRouter(
  packages: IListingPackageService,
  publication: IPublicationWorkflow,
  presentPackage: (parts: AgentPackageParts) => AgentPackageView,
  presentSummary: (parts: AgentPackageSummaryParts) => AgentPackageSummary,
): Router {
  const router = Router();
  router.get("/listing-packages", async (_req, res) => {
    const list = await packages.list(res.locals.actor);
    res.status(200).json(list.map(presentSummary));
  });
  router.post("/listing-packages", async (req, res) => {
    const created = await packages.create(res.locals.actor, req.body);
    res.status(201).json(presentPackage(created));
  });
  router.get("/listing-packages/:id", async (req, res) => {
    const found = await packages.get(res.locals.actor, req.params.id);
    res.status(200).json(presentPackage(found));
  });
  router.patch("/listing-packages/:id", async (req, res) => {
    const updated = await packages.update(res.locals.actor, req.params.id, req.body);
    res.status(200).json(presentPackage(updated));
  });
  router.post("/listing-packages/:id/publication", async (req, res) => {
    const published = await publication.publish(res.locals.actor, req.params.id, req.body);
    res.status(200).json(presentPackage(published));
  });
  router.post("/listing-packages/:id/withdrawal", async (req, res) => {
    const withdrawn = await publication.withdraw(res.locals.actor, req.params.id, req.body);
    res.status(200).json(presentPackage(withdrawn));
  });
  router.post("/listing-packages/:id/reopening", async (req, res) => {
    const reopened = await publication.reopen(res.locals.actor, req.params.id, req.body);
    res.status(200).json(presentPackage(reopened));
  });
  router.patch("/listing-packages/:id/offer-deadline", async (req, res) => {
    const extended = await publication.extendDeadline(res.locals.actor, req.params.id, req.body);
    res.status(200).json(presentPackage(extended));
  });
  router.get("/listing-packages/:id/timeline", async (req, res) => {
    const entries = await packages.timeline(res.locals.actor, req.params.id);
    res.status(200).json(entries.map(toTimelineEntryView));
  });
  return router;
}
