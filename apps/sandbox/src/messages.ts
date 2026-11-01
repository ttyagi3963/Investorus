// The stand-in email and SMS providers (T338; contracts/providers.md): each message the worker
// sends is captured, once per Idempotency-Key, so the reviewer can read it on the inspection page
// instead of it reaching a real inbox or phone.
import express, { Router, type RequestHandler } from "express";
import { z } from "zod";
import { requireInternalToken } from "./auth.js";
import { idempotencyKey } from "./idempotency.js";
import type { MessageInput, SandboxStore } from "./store.js";

const emailSchema = z.object({ to: z.email(), subject: z.string(), body: z.string() });
const smsSchema = z.object({ to: z.e164(), body: z.string() });
const limitSchema = z.coerce.number().int().min(1).max(500).default(100);

export type MessagesConfig = { store: SandboxStore; internalToken: string; gate: RequestHandler };

export function messageRoutes({ store, internalToken, gate }: MessagesConfig): Router {
  const router = Router();
  const capture =
    (toMessage: (body: unknown) => MessageInput | null): RequestHandler =>
    async (req, res) => {
      const key = idempotencyKey(req, res);
      if (!key) return;
      const message = toMessage(req.body);
      if (!message) return void res.status(400).json({ error: "Invalid message" });
      const answer = await store.captureMessage(key, message);
      res.status(answer.status).json(answer.body);
    };
  const guarded = [gate, requireInternalToken(internalToken), express.json({ limit: "64kb" })];

  router.post(
    "/messages/email",
    ...guarded,
    capture((body) => {
      const email = emailSchema.safeParse(body);
      if (!email.success) return null;
      const { to, subject, body: text } = email.data;
      return { channel: "email", recipient: to, subject, body: text };
    }),
  );
  router.post(
    "/messages/sms",
    ...guarded,
    capture((body) => {
      const sms = smsSchema.safeParse(body);
      if (!sms.success) return null;
      return { channel: "sms", recipient: sms.data.to, subject: null, body: sms.data.body };
    }),
  );

  router.get("/messages", async (req, res) => {
    const limit = limitSchema.safeParse(req.query.limit);
    if (!limit.success) return void res.status(400).json({ error: "limit must be 1 to 500" });
    res.status(200).json({ messages: await store.listMessages(limit.data) });
  });

  return router;
}
