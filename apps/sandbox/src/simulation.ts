// Outage simulation (T338): one mode per stand-in service, stored in sandbox.simulation_modes and
// switched by operations through the api. A gate in front of a service's routes applies its mode:
// down → 503, slow → a delay before the normal answer, garbage → 200 with a body that is not JSON.
import { setTimeout as delay } from "node:timers/promises";
import express, { Router, type RequestHandler } from "express";
import { z } from "zod";
import { requireInternalToken } from "./auth.js";
import { MODES, SERVICES, type Modes, type SandboxStore, type Service } from "./store.js";

/** How long a read of the modes is reused; a change made here clears it at once. */
const CACHE_MS = 1_000;

/** What garbage mode answers: a 200 whose JSON is cut off, as a broken upstream might send. */
const GARBAGE = '{"result": "APPL';

export type SimulationConfig = { store: SandboxStore; internalToken: string; slowDelayMs: number };

export function simulation({ store, internalToken, slowDelayMs }: SimulationConfig) {
  let cache: { modes: Modes; readAt: number } | null = null;
  const currentModes = async () => {
    if (cache && Date.now() - cache.readAt < CACHE_MS) return cache.modes;
    cache = { modes: await store.getModes(), readAt: Date.now() };
    return cache.modes;
  };

  /** Applies the service's current mode before its route runs. */
  const gate =
    (service: Service): RequestHandler =>
    async (_req, res, next) => {
      const mode = (await currentModes())[service];
      if (mode === "down") return void res.status(503).json({ error: "Simulated outage" });
      if (mode === "garbage") return void res.status(200).type("application/json").send(GARBAGE);
      if (mode === "slow") await delay(slowDelayMs);
      next();
    };

  const routes = Router();
  routes.get("/simulation", async (_req, res) => {
    res.status(200).json(await currentModes());
  });
  routes.put(
    "/simulation/:service",
    requireInternalToken(internalToken),
    express.json({ limit: "1kb" }),
    async (req, res) => {
      const service = z.enum(SERVICES).safeParse(req.params.service);
      const body = z.object({ mode: z.enum(MODES) }).safeParse(req.body);
      if (!service.success) return void res.status(404).json({ error: "Unknown service" });
      if (!body.success) return void res.status(400).json({ error: "Invalid mode" });
      await store.setMode(service.data, body.data.mode);
      cache = null;
      res.status(200).json(await currentModes());
    },
  );

  return { gate, routes };
}
