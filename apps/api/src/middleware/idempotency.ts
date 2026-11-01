// Idempotency for every POST and PATCH a signed-in user sends (T285; constitution XX.2): the first
// request with a key runs and its answer is stored; a retry with the same key and body gets that
// answer back (`Idempotent-Replay: true`) without running the change again. A duplicate sent while
// the first still runs gets 409 (`Retry-After: 1`), the key with another body 422, and a key store
// outage 503 (`Retry-After: 5`), so a change never runs unprotected. A 5xx is not stored.
// Sign-in has no user yet and is not covered, so a session token is never stored.
import { createHash } from "node:crypto";
import { BusinessRuleError, DomainError, ValidationError } from "@clever/contracts/common";
import { InfrastructureError, type IErrorReporter, type IIdempotencyStore } from "@clever/core";
import type { RequestHandler } from "express";

const COVERED_METHODS = new Set(["POST", "PATCH"]);
const MAX_KEY_LENGTH = 255;

/** 422: the key was already used for a different request. */
class IdempotencyKeyReusedError extends DomainError {
  readonly status = 422;
  readonly code = "IDEMPOTENCY_KEY_REUSED";
}

export function idempotency(store: IIdempotencyStore, reporter: IErrorReporter): RequestHandler {
  return async (req, res, next) => {
    if (!COVERED_METHODS.has(req.method) || !res.locals.actor) return next();
    const key = req.get("Idempotency-Key")?.trim();
    if (!key || key.length > MAX_KEY_LENGTH) {
      return next(
        new ValidationError(
          `Send an Idempotency-Key header (up to ${MAX_KEY_LENGTH} characters) with every POST and PATCH`,
        ),
      );
    }
    const { userId } = res.locals.actor;
    const bodyHash = createHash("sha256")
      .update(JSON.stringify(req.body ?? null))
      .digest("hex");

    let claim;
    try {
      claim = await store.claim({
        userId,
        key,
        method: req.method,
        path: req.originalUrl,
        bodyHash,
      });
    } catch (err) {
      res.set("Retry-After", "5");
      return next(
        err instanceof InfrastructureError
          ? err
          : new InfrastructureError("The idempotency key store failed", 503, err),
      );
    }

    switch (claim.kind) {
      case "replay":
        res.set("Idempotent-Replay", "true").status(claim.status);
        if (claim.body === null) res.end();
        else res.json(claim.body);
        return;
      case "in-progress":
        res.set("Retry-After", "1");
        return next(
          new BusinessRuleError(
            "This request is still being processed. Try again shortly.",
            "IDEMPOTENCY_IN_PROGRESS",
          ),
        );
      case "mismatch":
        return next(
          new IdempotencyKeyReusedError(
            "This Idempotency-Key was already used for another request",
          ),
        );
    }

    // The answer is stored before it is sent, so a retry after it arrives is always a replay.
    const send = res.json.bind(res);
    res.json = (body: unknown) => {
      const stored =
        res.statusCode >= 500
          ? store.release(userId, key)
          : store.complete(userId, key, res.statusCode, body);
      void stored.catch((err: unknown) => reporter.report(err)).finally(() => send(body));
      return res;
    };
    next();
  };
}
