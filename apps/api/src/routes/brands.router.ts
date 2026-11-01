// The brands (T348; contracts/api.md): the list for the switcher and the host mapping, and a brand's
// theme, both public because the sign-in page needs them; the theme is cached by its version (ETag
// and a short max-age), so the web app re-reads it only after a change. Operations replace a brand's
// tokens. One service call each; the service checks who may change a brand.
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
    if (req.headers["if-none-match"] === etag) return void res.status(304).end();
    res.status(200).json(theme);
  });
  router.put("/ops/brands/:id/theme", async (req, res) => {
    res.status(200).json(await brands.updateTheme(res.locals.actor, req.params.id, req.body));
  });
  return router;
}
