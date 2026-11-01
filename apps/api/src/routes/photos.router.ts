// A package's photos (T256): ask for an upload link (201), attach the uploaded file (201), and
// remove one (204). The browser uploads to storage itself; these routes never see the file.
import type { IPhotoService } from "@clever/core";
import { Router } from "express";

export function createPhotosRouter(photos: IPhotoService): Router {
  const router = Router();
  router.post("/listing-packages/:id/photo-uploads", async (req, res) => {
    res.status(201).json(await photos.requestUpload(res.locals.actor, req.params.id, req.body));
  });
  router.post("/listing-packages/:id/photos", async (req, res) => {
    res.status(201).json(await photos.attach(res.locals.actor, req.params.id, req.body));
  });
  router.delete("/listing-packages/:id/photos/:photoId", async (req, res) => {
    await photos.remove(res.locals.actor, req.params.id, req.params.photoId);
    res.status(204).end();
  });
  return router;
}
