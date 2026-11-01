// The CRM on the sandbox (T339; contracts/providers.md, CRM_PROVIDER=sandbox): PUT
// /crm/listings/:packageId with the delivery's Idempotency-Key. 200 APPLIED, or 409 STALE when the
// CRM already holds a newer update, which counts as delivered.
import { z } from "zod";
import { sendToSandbox, type SandboxTarget } from "../sandbox-delivery.js";
import type { CrmListingRecord, ICrmProvider } from "./ICrmProvider.js";

const answer = z.union([
  z.object({ result: z.literal("APPLIED") }),
  z.object({ code: z.literal("STALE") }),
]);

export class SandboxCrmProviderImpl implements ICrmProvider {
  private readonly target: SandboxTarget;

  constructor(options: {
    internalUrl: string;
    internalToken: string;
    fetch?: typeof globalThis.fetch;
  }) {
    this.target = {
      baseUrl: options.internalUrl,
      internalToken: options.internalToken,
      fetch: options.fetch ?? globalThis.fetch,
    };
  }

  async upsertListing(record: CrmListingRecord, idempotencyKey: string) {
    const { packageId, occurredAt, ...fields } = record;
    const { status } = await sendToSandbox(
      this.target,
      `/crm/listings/${encodeURIComponent(packageId)}`,
      "PUT",
      { ...fields, occurredAt: occurredAt.toISOString() },
      idempotencyKey,
      answer,
      [409],
    );
    return status === 409 ? "STALE" : "APPLIED";
  }
}
