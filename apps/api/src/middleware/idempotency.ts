// Idempotency for every POST, PUT, and PATCH a signed-in user sends (T285, T323; XX.2): the first
// request with a key runs and its answer is stored; a retry with the same key and body gets that
// answer back (`Idempotent-Replay: true`) without running the change again. A duplicate sent while
// the first still runs gets 409 (`Retry-After: 1`), the key with another body 422, and a key store
// outage 503 (`Retry-After: 5`), so a change never runs unprotected. A 5xx is not stored. The
// request runs under its claim (T367), so its writes mark the claim committed in their own
// transaction: after a crash, a retry runs the change only if nothing committed, and is otherwise
// told it was already applied (409 IDEMPOTENCY_ALREADY_APPLIED); it is never run twice.
// Sign-in has no user yet and is not covered, so a session token is never stored.
import { createHash } from "node:crypto";
import { BusinessRuleError, DomainError, ValidationError } from "@clever/contracts/common";
import {
  InfrastructureError,
  runWithIdempotencyClaim,
  type IErrorReporter,
  type IIdempotencyStore,
} from "@clever/core";
import type { RequestHandler } from "express";

const COVERED_METHODS = new Set(["POST", "PUT", "PATCH"]);
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
          `Send an Idempotency-Key header (up to ${MAX_KEY_LENGTH} characters) with every POST, PUT, and PATCH`,
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
        else res.type("application/json").send(claim.body);
        return;
      case "in-progress":
        res.set("Retry-After", "1");
        return next(
          new BusinessRuleError(
            "This request is still being processed. Try again shortly.",
            "IDEMPOTENCY_IN_PROGRESS",
          ),
        );
      case "applied":
        return next(
          new BusinessRuleError(
            "This request was already applied, but its answer was lost. Reload to see the result.",
            "IDEMPOTENCY_ALREADY_APPLIED",
          ),
        );
      case "mismatch":
        return next(
          new IdempotencyKeyReusedError(
            "This Idempotency-Key was already used for another request",
          ),
        );
    }
    const { token } = claim;

    // Every answer leaves through res.end, so the key is settled there, before the answer is sent:
    // a retry after the answer arrives is always a replay. If storing fails, the answer is still
    // sent, because the change already ran, and the failure is reported.
    const end = res.end.bind(res) as (...args: unknown[]) => typeof res;
    res.end = ((...args: unknown[]) => {
      const [chunk] = args;
      const body =
        typeof chunk === "string" ? chunk : Buffer.isBuffer(chunk) ? chunk.toString("utf8") : null;
      const settled =
        res.statusCode >= 500
          ? store.release(userId, key, token)
          : store.complete(userId, key, token, res.statusCode, body);
      void settled.catch((err: unknown) => reporter.report(err)).finally(() => end(...args));
      return res;
    }) as typeof res.end;
    runWithIdempotencyClaim({ userId, key, token }, () => next());
  };
}
