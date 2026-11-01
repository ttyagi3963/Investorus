// The signed-in user's in-app inbox (T298, contracts/api.md): list their notifications, newest
// first, and mark one read (204).
import { toNotificationView } from "@clever/contracts/notification";
import type { INotificationService } from "@clever/core";
import { Router } from "express";

export function createNotificationsRouter(notifications: INotificationService): Router {
  const router = Router();
  router.get("/notifications", async (_req, res) => {
    const list = await notifications.listMine(res.locals.actor);
    res.status(200).json(list.map(toNotificationView));
  });
  router.post("/notifications/:id/read", async (req, res) => {
    await notifications.markRead(res.locals.actor, req.params.id);
    res.status(204).end();
  });
  return router;
}
