// The brands (T348; contracts/api.md): the list for the switcher and the host mapping, and a brand's
// theme, both public because the sign-in page needs them. The theme carries its version as an ETag
// (a caller holding it gets a 304) and a short max-age; the web app keeps its own copy in Next's
// data cache. Operations read and replace
// a brand's tokens (T353). One service call each; the service checks who may change a brand.
import type { IBrandService } from "@clever/core";
import { Router } from "express";

export function createBrandsRouter(brands: IBrandService): Router {
  const router = Router();
  router.get("/brands", async (_req, res) => {
    res.status(200).json(await brands.list());
  });
  router.get("/brands/:id/theme", async (req, res) => {
    const theme = await brands.getTheme(req.params.id);
    const etag = `"${theme.brandId}-v${theme.tokenVersion}"`;
    res.set({ ETag: etag, "Cache-Control": "public, max-age=60" });
    // Express compares If-None-Match with the ETag set above as RFC 9110 asks: weakly, and against
    // each tag of a list (T386).
    if (req.fresh) return void res.status(304).end();
    res.status(200).json(theme);
  });
  router.get("/ops/brands/:id/tokens", async (req, res) => {
    res.status(200).json(await brands.getTokens(res.locals.actor, req.params.id));
  });
  router.put("/ops/brands/:id/theme", async (req, res) => {
    res.status(200).json(await brands.updateTheme(res.locals.actor, req.params.id, req.body));
  });
  return router;
}
