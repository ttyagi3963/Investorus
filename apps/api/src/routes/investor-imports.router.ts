// Operations' legacy investor import (T323, contracts/api.md): an upload link for the CSV (201),
// starting the import of the uploaded file (202, the job and batch IDs), and the batch with each
// row's result. One workflow call each; the workflow checks who may do what.
import { toImportBatchView } from "@clever/contracts/investor";
import type { IInvestorImportWorkflow } from "@clever/core";
import { Router } from "express";

export function createInvestorImportsRouter(imports: IInvestorImportWorkflow): Router {
  const router = Router();
  router.post("/ops/investor-imports/uploads", async (req, res) => {
    res.status(201).json(await imports.requestUpload(res.locals.actor, req.body));
  });
  router.post("/ops/investor-imports", async (req, res) => {
    res.status(202).json(await imports.start(res.locals.actor, req.body));
  });
  router.get("/ops/investor-imports/:batchId", async (req, res) => {
    const detail = await imports.getBatch(res.locals.actor, req.params.batchId);
    res.status(200).json(toImportBatchView(detail));
  });
  return router;
}
