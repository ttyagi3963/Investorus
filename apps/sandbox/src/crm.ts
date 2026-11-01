// The stand-in CRM (T338; contracts/providers.md): the worker sends each listing's status snapshot,
// keyed by its delivery ID, and an update older than the stored one is refused with 409 STALE, so
// a delayed retry never overwrites a newer status. The read-out serves the api's CRM comparison.
import express, { Router, type RequestHandler } from "express";
import { z } from "zod";
import { requireInternalToken } from "./auth.js";
import { idempotencyKey } from "./idempotency.js";
import type { SandboxStore } from "./store.js";

const crmUpdateSchema = z.object({
  status: z.string(),
  round: z.number().int().min(1),
  offerCount: z.number().int().min(0),
  acceptedPrice: z.number().int().nullable(),
  sellerContact: z.object({
    fullName: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  occurredAt: z.iso.datetime({ offset: true }),
});

export type CrmConfig = { store: SandboxStore; internalToken: string; gate: RequestHandler };

export function crmRoutes({ store, internalToken, gate }: CrmConfig): Router {
  const router = Router();

  router.put(
    "/crm/listings/:packageId",
    gate,
    requireInternalToken(internalToken),
    express.json({ limit: "16kb" }),
    async (req, res) => {
      const key = idempotencyKey(req, res);
      if (!key) return;
      const update = crmUpdateSchema.safeParse(req.body);
      if (!update.success) return void res.status(400).json({ error: "Invalid CRM update" });
      const answer = await store.applyCrmUpdate(key, String(req.params.packageId), update.data);
      res.status(answer.status).json(answer.body);
    },
  );

  router.get("/crm/listings", async (_req, res) => {
    res.status(200).json({ listings: await store.listCrmListings() });
  });

  return router;
}
