// The api's last two handlers (T253): an unknown route is a 404, and every error from a route or
// middleware goes through core's translateError, which names invalid fields, keeps domain statuses,
// and gives anything unexpected a generic message (constitution VII). Routes never catch errors.
import { translateError, type IErrorReporter } from "@clever/core";
import type { ErrorRequestHandler, RequestHandler } from "express";

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
};

export function errorTranslator(reporter: IErrorReporter): ErrorRequestHandler {
  return (err, _req, res, _next) => {
    const { status, body } = translateError(err, { reporter });
    res.status(status).json(body);
  };
}
