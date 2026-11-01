// Guards the delivery rules (T339; FR-070, FR-071, FR-077, XII, contracts/events.md): a temporary
// failure is retried with a growing wait and set aside after the last allowed attempt; a refusal
// or an investor who cannot be reached is set aside at once; a CRM update carries the seller's
// contact read at send time, that read is audited, and STALE counts as delivered; a duplicate job
// sends nothing; and the relay makes each delivery once, with no text for an investor with no phone.
import type { DeliveryRetryPolicy } from "@clever/contracts/config";
import type { OutboxEventInput } from "@clever/contracts/events";
import { describe, expect, it, vi } from "vitest";
import { InMemoryUnitOfWork } from "../../test/doubles/InMemoryRepositories.js";
import { DeliveryRejectedError } from "../errors/DeliveryRejectedError.js";
import { InfrastructureError } from "../errors/InfrastructureError.js";
import type { ICrmProvider } from "../providers/crm/ICrmProvider.js";
import type { IMessagingProvider } from "../providers/messaging/IMessagingProvider.js";
import { DeliveryDispatcher } from "./DeliveryDispatcher.js";
import { OutboxRelay } from "./OutboxRelay.js";
import { writeEvent } from "./write-event.js";

const NOW = new Date("2026-11-04T12:00:00Z");
const RETRY: DeliveryRetryPolicy = {
  baseMs: 2_000,
  factor: 2,
  capMs: 60_000,
  jitter: 0,
  attempts: 3,
};
const NOTICE: OutboxEventInput = {
  type: "investor.notice",
  payload: {
    packageId: "package-1",
    investorId: "investor-1",
    noticeType: "PACKAGE_MATCHED",
    title: "A new listing matches your buy box",
    body: "A listing in Austin, TX 78745 matches Flips.",
    channels: ["EMAIL", "SMS"],
  },
};

function setup() {
  const uow = new InMemoryUnitOfWork();
  const messaging = { sendEmail: vi.fn(async () => {}), sendSms: vi.fn(async () => {}) };
  const crm = { upsertListing: vi.fn(async (): Promise<"APPLIED" | "STALE"> => "APPLIED") };
  const queue = { enqueue: vi.fn(async () => {}) };
  const clock = { now: () => NOW };
  const dispatcher = new DeliveryDispatcher(uow, {
    crm: crm as ICrmProvider,
    messaging: messaging as IMessagingProvider,
    clock,
    retry: RETRY,
  });
  const relay = new OutboxRelay(uow, { queue, clock });
  return { uow, messaging, crm, queue, dispatcher, relay };
}

/** Writes one event, relays it, and returns its deliveries by target. */
async function relayed(ctx: ReturnType<typeof setup>, event: OutboxEventInput) {
  await ctx.uow.run((repos) => writeEvent(repos, event));
  await ctx.relay.tick();
  const byTarget = (target: string) =>
    ctx.uow.repos.deliveries.rows.find((d) => d.target === target)!;
  return { email: byTarget("EMAIL"), sms: byTarget("SMS"), crm: byTarget("CRM") };
}

describe("DeliveryDispatcher", () => {
  it("retries a temporary failure with a growing wait, then sets it aside after the last try", async () => {
    const ctx = setup();
    ctx.uow.repos.investors.contacts.set("investor-1", { email: "i@example.test", phone: null });
    const { email } = await relayed(ctx, NOTICE);
    ctx.messaging.sendEmail.mockRejectedValue(new InfrastructureError("The sandbox answered 503"));

    const first = await ctx.dispatcher.dispatch(email.id);
    const second = await ctx.dispatcher.dispatch(email.id);
    const last = await ctx.dispatcher.dispatch(email.id);

    expect([first, second].map((r) => r.outcome === "RETRY" && r.delayMs)).toEqual([2_000, 4_000]);
    expect(last.outcome).toBe("NEEDS_ATTENTION");
    expect(email).toMatchObject({ status: "NEEDS_ATTENTION", attempts: 3 });
    expect(email.lastError).toContain("503");
  });

  it("sets a refusal, or an investor it cannot reach, aside without retrying", async () => {
    const ctx = setup();
    ctx.uow.repos.investors.contacts.set("investor-1", {
      email: "i@example.test",
      phone: "+15125550100",
    });
    const { email, sms } = await relayed(ctx, NOTICE);
    ctx.messaging.sendEmail.mockRejectedValue(
      new DeliveryRejectedError("The sandbox refused (400)"),
    );
    ctx.uow.repos.investors.contacts.set("investor-1", { email: "i@example.test", phone: null });

    expect((await ctx.dispatcher.dispatch(email.id)).outcome).toBe("NEEDS_ATTENTION");
    expect((await ctx.dispatcher.dispatch(sms.id)).outcome).toBe("NEEDS_ATTENTION");
    expect([email.attempts, sms.attempts]).toEqual([1, 1]);
    expect(ctx.messaging.sendSms).not.toHaveBeenCalled();
  });

  it("sends the CRM the seller's contact read at send time, audits the read, and takes STALE as sent", async () => {
    const ctx = setup();
    const seller = await ctx.uow.repos.sellers.create({
      fullName: "Pat Seller",
      email: null,
      phone: "+15125550199",
    });
    const pkg = await ctx.uow.repos.packages.create({
      agentId: "agent-1",
      sellerId: seller.id,
      propertyId: "property-1",
      addressHash: "hash-1",
      priceExpectationMin: 200_000,
      priceExpectationMax: 250_000,
      closingWindowStart: null,
      closingWindowEnd: null,
      currentlyListed: false,
      eligiblePrograms: ["CASH_OFFER"],
    });
    const { crm } = await relayed(ctx, {
      type: "package.status_changed",
      payload: {
        packageId: pkg.id,
        from: "DRAFT",
        crm: { status: "ACCEPTING_OFFERS", round: 1, offerCount: 0, acceptedPrice: null },
      },
    });
    ctx.crm.upsertListing.mockResolvedValue("STALE");

    expect((await ctx.dispatcher.dispatch(crm.id)).outcome).toBe("SENT");
    expect(ctx.crm.upsertListing).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ACCEPTING_OFFERS",
        sellerContact: { fullName: "Pat Seller", email: null, phone: "+15125550199" },
      }),
      crm.id,
    );
    expect(ctx.uow.repos.audit.entries).toContainEqual(
      expect.objectContaining({ action: "PII_ACCESSED", actorType: "SYSTEM", entityId: pkg.id }),
    );
  });

  it("sends nothing for a duplicate job once the delivery is sent", async () => {
    const ctx = setup();
    ctx.uow.repos.investors.contacts.set("investor-1", { email: "i@example.test", phone: null });
    const { email } = await relayed(ctx, NOTICE);

    await ctx.dispatcher.dispatch(email.id);
    const again = await ctx.dispatcher.dispatch(email.id);

    expect(again.outcome).toBe("SKIPPED");
    expect(ctx.messaging.sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe("OutboxRelay", () => {
  it("makes each delivery once and queues it once, with no text for an investor with no phone", async () => {
    const ctx = setup();
    ctx.uow.repos.investors.contacts.set("investor-1", { email: "i@example.test", phone: null });
    await ctx.uow.run((repos) => writeEvent(repos, NOTICE));

    await ctx.relay.tick();
    await ctx.relay.tick();

    expect(ctx.uow.repos.deliveries.rows.map((d) => d.target)).toEqual(["EMAIL"]);
    expect(ctx.queue.enqueue).toHaveBeenCalledTimes(1);
    expect(ctx.uow.repos.outbox.rows[0]?.relayedAt).toEqual(NOW);
  });
});
