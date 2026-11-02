// Sends one delivery (T339; FR-070, FR-071, FR-077, contracts/events.md). A first transaction starts
// the attempt and reads what the send needs: the event, the investor's contact, or for the CRM the
// seller's contact, a read it audits (PII_ACCESSED). The send happens outside any transaction, with
// the delivery's ID as its Idempotency-Key. A second transaction records the outcome: SENT (a
// stale CRM update counts), RETRYING with the next try's time, or NEEDS_ATTENTION when the service
// refused it, the investor cannot be reached, or the last allowed attempt failed. Each outcome
// names its attempt, so a run that lost its claim (the stale sweep gave the delivery to a newer
// run) records nothing and is SKIPPED (T379). The caller (the worker's queue consumer) waits
// `delayMs` before the next try, and calls giveUp when every try threw; this class never sleeps.
import type { DeliveryRetryPolicy } from "@clever/contracts/config";
import { outboxEventInputSchema, type OutboxEventInput } from "@clever/contracts/events";
import { DeliveryRejectedError } from "../errors/DeliveryRejectedError.js";
import { InfrastructureError } from "../errors/InfrastructureError.js";
import type { IClock } from "../providers/clock/IClock.js";
import type { ICrmProvider } from "../providers/crm/ICrmProvider.js";
import type { IMessagingProvider } from "../providers/messaging/IMessagingProvider.js";
import type { DeliveryWithEvent } from "../repositories/delivery/IDeliveryRepository.js";
import type { IUnitOfWork, UnitOfWorkRepositories } from "../unit-of-work/IUnitOfWork.js";
import { digestEmail, noticeEmail, noticeSms } from "./message-templates.js";
import { retryDelayMs } from "./retry-delay.js";

export type DispatchResult =
  | { outcome: "SENT" }
  /** Already sent, set aside, gone, or taken over by a newer run: a late job does nothing. */
  | { outcome: "SKIPPED" }
  | { outcome: "RETRY"; delayMs: number; error: string }
  | { outcome: "NEEDS_ATTENTION"; error: string };

export type DeliveryDispatcherDeps = {
  crm: ICrmProvider;
  messaging: IMessagingProvider;
  clock: IClock;
  retry: DeliveryRetryPolicy;
  /** The brand whose name the emails and texts carry (DEFAULT_BRAND_ID). */
  brandId: string;
  random?: () => number;
};

/** The send, prepared inside the first transaction and run after it commits. */
type Send = () => Promise<void>;

const describe = (err: unknown) => (err instanceof Error ? err.message : "Unknown failure");

export class DeliveryDispatcher {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly deps: DeliveryDispatcherDeps,
  ) {}

  async dispatch(deliveryId: string): Promise<DispatchResult> {
    const prepared = await this.uow.run(async (repos) => {
      const delivery = await repos.deliveries.findWithEvent(deliveryId);
      const attempt = delivery && (await repos.deliveries.markSending(deliveryId));
      if (!delivery || !attempt) return null;
      try {
        return { kind: "send" as const, attempt, send: await this.prepare(repos, delivery) };
      } catch (err) {
        // Nothing to send to (an investor without an email, an unreadable event). Returned, not
        // thrown, so the attempt this transaction started is kept and can be set aside.
        if (err instanceof DeliveryRejectedError) {
          return { kind: "rejected" as const, attempt, error: err.message };
        }
        throw err;
      }
    });
    if (!prepared) return { outcome: "SKIPPED" };
    const { attempt } = prepared;
    if (prepared.kind === "rejected") return this.setAside(deliveryId, attempt, prepared.error);

    try {
      await prepared.send();
    } catch (err) {
      const error = describe(err);
      if (err instanceof DeliveryRejectedError || attempt >= this.deps.retry.attempts) {
        return this.setAside(deliveryId, attempt, error);
      }
      const delayMs = retryDelayMs(this.deps.retry, attempt, this.deps.random);
      const nextAttemptAt = new Date(this.deps.clock.now().getTime() + delayMs);
      const recorded = await this.uow.run((repos) =>
        repos.deliveries.markRetrying(deliveryId, attempt, error, nextAttemptAt),
      );
      return recorded ? { outcome: "RETRY", delayMs, error } : { outcome: "SKIPPED" };
    }

    const recorded = await this.uow.run((repos) =>
      repos.deliveries.markSent(deliveryId, attempt, this.deps.clock.now()),
    );
    return recorded ? { outcome: "SENT" } : { outcome: "SKIPPED" };
  }

  /**
   * Sets the delivery aside when its job used every try without an outcome (each dispatch threw,
   * say on a database outage), so it shows in operations' queue instead of looping unseen.
   */
  async giveUp(deliveryId: string, error: string): Promise<void> {
    await this.uow.run((repos) => repos.deliveries.giveUp(deliveryId, error));
  }

  private async setAside(
    deliveryId: string,
    attempt: number,
    error: string,
  ): Promise<DispatchResult> {
    const recorded = await this.uow.run((repos) =>
      repos.deliveries.markNeedsAttention(deliveryId, attempt, error),
    );
    return recorded ? { outcome: "NEEDS_ATTENTION", error } : { outcome: "SKIPPED" };
  }

  private async prepare(repos: UnitOfWorkRepositories, delivery: DeliveryWithEvent): Promise<Send> {
    const parsed = outboxEventInputSchema.safeParse({
      type: delivery.event.type,
      payload: delivery.event.payload,
    });
    if (!parsed.success) throw new DeliveryRejectedError("The event no longer matches its schema");
    const event = parsed.data;
    const key = delivery.id;

    if (delivery.target === "CRM") {
      return this.prepareCrm(repos, event, delivery.event, key);
    }
    const contact = await repos.investors.findContact(delivery.recipientRef);
    const brand = await repos.brands.findById(this.deps.brandId);
    // A setting error, not this message's fault: thrown (rolled back and retried), never set aside.
    if (!brand) throw new InfrastructureError(`The ${this.deps.brandId} brand does not exist`);
    if (event.type === "investor.notice") {
      if (delivery.target === "EMAIL") {
        if (!contact) throw new DeliveryRejectedError("The investor has no email address");
        const message = noticeEmail(contact.email, event.payload, brand.name);
        return () => this.deps.messaging.sendEmail(message, key);
      }
      if (!contact?.phone) throw new DeliveryRejectedError("The investor has no phone number");
      const message = noticeSms(contact.phone, event.payload, brand.name);
      return () => this.deps.messaging.sendSms(message, key);
    }
    if (event.type === "investor.match_digest" && delivery.target === "EMAIL") {
      if (!contact) throw new DeliveryRejectedError("The investor has no email address");
      const message = digestEmail(contact.email, event.payload.matches, brand.name);
      return () => this.deps.messaging.sendEmail(message, key);
    }
    throw new DeliveryRejectedError(`No ${delivery.target} delivery for ${event.type}`);
  }

  private async prepareCrm(
    repos: UnitOfWorkRepositories,
    event: OutboxEventInput,
    { occurredAt, sequence }: { occurredAt: Date; sequence: number },
    key: string,
  ): Promise<Send> {
    if (
      event.type !== "package.status_changed" &&
      event.type !== "offer.submitted" &&
      event.type !== "offer.withdrawn"
    ) {
      throw new DeliveryRejectedError(`No CRM delivery for ${event.type}`);
    }
    const { packageId, crm } = event.payload;
    const pkg = await repos.packages.findById(packageId);
    const seller = pkg && (await repos.sellers.findById(pkg.sellerId));
    if (!seller) throw new DeliveryRejectedError("The listing's seller no longer exists");
    // The CRM's copy is the one place outside the platform that holds the seller's contact (XII).
    await repos.audit.append({
      actorType: "SYSTEM",
      actorId: null,
      action: "PII_ACCESSED",
      entityType: "ListingPackage",
      entityId: packageId,
      outcome: "SUCCESS",
      details: { purpose: "CRM_SYNC", deliveryId: key },
    });
    const record = {
      packageId,
      ...crm,
      sellerContact: { fullName: seller.fullName, email: seller.email, phone: seller.phone },
      occurredAt,
      sequence,
    };
    return async () => {
      await this.deps.crm.upsertListing(record, key);
    };
  }
}
