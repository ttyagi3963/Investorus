// POST /sessions signs in (201 `{ token, user }`) and GET /me returns the signed-in user (T254).
// Translation only: one service call each, no validation here (constitution II).
import type { IAuthService } from "@clever/core";
import { Router } from "express";

export function createSessionsRouter(auth: IAuthService): Router {
  const router = Router();
  router.post("/sessions", async (req, res) => {
    res.status(201).json(await auth.signIn(req.body));
  });
  router.get("/me", async (_req, res) => {
    res.status(200).json(await auth.me(res.locals.actor));
  });
  return router;
}
