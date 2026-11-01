// The sandbox's answer to a delivery, sorted the way the dispatcher retries (contracts/events.md):
// a 5xx, a timeout, a 408 or 429, or a body that is not what the route promises is temporary
// (InfrastructureError, retried); any other 4xx is a refusal (DeliveryRejectedError). Shared by the
// sandbox CRM and messaging providers, which differ only in their routes and bodies.
import type { z } from "zod";
import { DeliveryRejectedError } from "../errors/DeliveryRejectedError.js";
import { InfrastructureError } from "../errors/InfrastructureError.js";
import { sandboxRequest } from "./sandbox-http.js";

export type SandboxTarget = {
  baseUrl: string;
  internalToken: string;
  fetch: typeof globalThis.fetch;
};

/** Sends one keyed delivery and returns the response's status and checked body. */
export async function sendToSandbox<T>(
  target: SandboxTarget,
  path: string,
  method: "PUT" | "POST",
  body: unknown,
  idempotencyKey: string,
  schema: z.ZodType<T>,
  /** Statuses other than 2xx that carry an answer, such as the CRM's 409 STALE. */
  accepted: readonly number[] = [],
): Promise<{ status: number; body: T }> {
  const res = await sandboxRequest(target.fetch, `${target.baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
      "x-sandbox-token": target.internalToken,
    },
    body: JSON.stringify(body),
  });
  if (res.status === 408 || res.status === 429) {
    throw new InfrastructureError(`The sandbox answered ${res.status} to ${method} ${path}`, 503);
  }
  if (!res.ok && !accepted.includes(res.status)) {
    throw new DeliveryRejectedError(`The sandbox refused ${method} ${path} (${res.status})`);
  }
  const parsed = schema.safeParse(await res.json().catch(() => undefined));
  if (!parsed.success) {
    throw new InfrastructureError(`The sandbox sent a malformed answer to ${method} ${path}`, 502);
  }
  return { status: res.status, body: parsed.data };
}
