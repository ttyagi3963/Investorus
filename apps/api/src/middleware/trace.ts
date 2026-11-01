// The api's first middleware (T283): takes the trace ID from the caller's W3C `traceparent`, or
// creates one when it is missing or malformed, returns it as `X-Request-Id`, and runs the rest of
// the request inside that trace, so every log line and audit entry carries it.
import { newTraceId, traceIdFrom } from "@clever/contracts/common";
import { runWithTrace } from "@clever/core";
import type { RequestHandler } from "express";

export const trace: RequestHandler = (req, res, next) => {
  const traceId = traceIdFrom(req.get("traceparent")) ?? newTraceId();
  res.locals.traceId = traceId;
  res.setHeader("X-Request-Id", traceId);
  runWithTrace(traceId, next);
};
