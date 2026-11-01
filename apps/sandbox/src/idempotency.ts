// Reads the Idempotency-Key header that every sandbox write needs (the worker sends the delivery's
// ID), so a retried delivery is applied once; a request without one gets 400.
import type { Request, Response } from "express";

/** The request's Idempotency-Key, or undefined after answering 400 when it is missing. */
export function idempotencyKey(req: Request, res: Response): string | undefined {
  const key = req.get("Idempotency-Key")?.trim();
  if (!key) {
    res.status(400).json({ error: "The Idempotency-Key header is required" });
    return undefined;
  }
  return key;
}
