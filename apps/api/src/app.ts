// The api app (T255): a fixed middleware order (the trace context, security headers, request
// logging with tokens redacted, a 1 MB JSON limit, the session check, idempotency), the routers at
// /api/v1, then the 404 and the error translator. It takes a container, so tests can pass fakes.
import express, { Router, type Express } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import type { AppContainer } from "./container.js";
import { authenticate } from "./middleware/authenticate.js";
import { errorTranslator, notFound } from "./middleware/errors.js";
import { idempotency } from "./middleware/idempotency.js";
import { trace } from "./middleware/trace.js";
import { createHealthRouter } from "./routes/health.router.js";
import { createInvestorRouter } from "./routes/investor.router.js";
import { createListingPackagesRouter } from "./routes/listing-packages.router.js";
import { createNotificationsRouter } from "./routes/notifications.router.js";
import { createOffersRouter } from "./routes/offers.router.js";
import { createPhotosRouter } from "./routes/photos.router.js";
import { createSessionsRouter } from "./routes/sessions.router.js";

export function createApp(c: AppContainer): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(trace);
  app.use(helmet());
  app.use(pinoHttp({ logger: c.logger, genReqId: (_req, res) => res.locals.traceId }));
  app.use(express.json({ limit: "1mb" }));
  app.use(authenticate(c.auth));
  app.use(idempotency(c.idempotency, c.reporter));

  const v1 = Router();
  v1.use(createHealthRouter(c.checkDatabase));
  v1.use(createSessionsRouter(c.auth));
  v1.use(createListingPackagesRouter(c.packages, c.publication, c.presentPackage));
  v1.use(createPhotosRouter(c.photos));
  v1.use(createInvestorRouter(c.investorPackages, c.signPhotos));
  v1.use(createOffersRouter(c.offers));
  v1.use(createNotificationsRouter(c.notifications));
  app.use("/api/v1", v1);

  app.use(notFound);
  app.use(errorTranslator(c.reporter));
  return app;
}
