// The agent's draft packages (T256, contracts/api.md): list, create (201), read, and edit. Each route
// makes one service call and maps the result to its view; photos get short-lived read links, signed
// first because S3 signs asynchronously.
import {
  toAgentPackageSummary,
  toAgentPackageView,
  type AgentPackageParts,
} from "@clever/contracts/listing-package";
import type { IListingPackageService } from "@clever/core";
import { Router } from "express";

export function createListingPackagesRouter(
  packages: IListingPackageService,
  photoUrl: (storageKey: string) => Promise<string>,
): Router {
  const router = Router();
  const view = async (parts: AgentPackageParts) => {
    const urls = new Map(
      await Promise.all(
        parts.photos.map(async (p) => [p.storageKey, await photoUrl(p.storageKey)] as const),
      ),
    );
    return toAgentPackageView(parts, (key) => urls.get(key) ?? "");
  };
  router.get("/listing-packages", async (_req, res) => {
    const list = await packages.list(res.locals.actor);
    res.status(200).json(list.map(toAgentPackageSummary));
  });
  router.post("/listing-packages", async (req, res) => {
    const created = await packages.create(res.locals.actor, req.body);
    res.status(201).json(await view(created));
  });
  router.get("/listing-packages/:id", async (req, res) => {
    const found = await packages.get(res.locals.actor, req.params.id);
    res.status(200).json(await view(found));
  });
  router.patch("/listing-packages/:id", async (req, res) => {
    const updated = await packages.update(res.locals.actor, req.params.id, req.body);
    res.status(200).json(await view(updated));
  });
  return router;
}
