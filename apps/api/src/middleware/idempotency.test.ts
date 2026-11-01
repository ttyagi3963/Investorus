// Pins how the idempotency middleware settles a claimed key (T285, XX.2): every way a route answers,
// a 204 included, completes the key; and when storing the answer fails, the answer is still sent,
// because the change already ran, and the failure is reported.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { idempotency } from "./idempotency.js";

function appWith(complete: (...args: unknown[]) => Promise<void>, report: () => void) {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.actor = { userId: "user-a", role: "AGENT", agentId: "agent-a" };
    next();
  });
  const store = { claim: async () => ({ kind: "claimed" as const }), complete, release: vi.fn() };
  app.use(idempotency(store, { report }));
  app.post("/created", (_req, res) => void res.status(201).json({ id: "p1" }));
  app.post("/empty", (_req, res) => void res.status(204).end());
  return app;
}

describe("idempotency middleware", () => {
  it("completes the key for a JSON answer and for an empty one", async () => {
    const complete = vi.fn().mockResolvedValue(undefined);
    const app = appWith(complete, vi.fn());
    await request(app).post("/created").set("Idempotency-Key", "k1").send({}).expect(201);
    await request(app).post("/empty").set("Idempotency-Key", "k2").send({}).expect(204);
    expect(complete.mock.calls).toEqual([
      ["user-a", "k1", 201, JSON.stringify({ id: "p1" })],
      ["user-a", "k2", 204, null],
    ]);
  });

  it("still sends the answer when storing it fails, and reports the failure", async () => {
    const report = vi.fn();
    const app = appWith(() => Promise.reject(new Error("store down")), report);
    const res = await request(app).post("/created").set("Idempotency-Key", "k3").send({});
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: "p1" });
    expect(report).toHaveBeenCalledOnce();
  });
});
