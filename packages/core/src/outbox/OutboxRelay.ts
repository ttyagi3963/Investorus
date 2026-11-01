// The outbox relay (T339; constitution XVIII, contracts/events.md), run by the worker every second.
// First it turns each unrelayed event into one delivery per target and recipient (no SMS for an
// investor without a phone) and marks the event relayed, in one transaction. Then it queues every
// PENDING delivery not yet on the queue, which also re-queues deliveries an operator retried and
// any whose queueing failed while Redis was down. Before that it puts back every delivery whose job
// may be lost (Redis restarted without its data, or the worker died mid-send): one queued but not
// started, overdue for its retry, or sending for longer than the lease. An event whose payload no
// longer parses is marked relayed with no deliveries and reported, so it cannot block the rest.
import { deliveriesOf, outboxEventInputSchema } from "@clever/contracts/events";
import type { IClock } from "../providers/clock/IClock.js";
import type { IDeliveryQueue } from "../providers/delivery-queue/IDeliveryQueue.js";
import type { IUnitOfWork } from "../unit-of-work/IUnitOfWork.js";

const BATCH = 100;
/** Longer than the longest retry wait (60 s) plus a send's timeout, with room to spare. */
const LEASE_MS = 2 * 60 * 1_000;

export type RelayResult = {
  relayed: number;
  queued: number;
  /** Deliveries put back because their job may have been lost. */
  recovered: number;
  unreadable: string[];
};

export class OutboxRelay {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly deps: { queue: IDeliveryQueue; clock: IClock },
  ) {}

  async tick(): Promise<RelayResult> {
    const unreadable: string[] = [];
    const relayed = await this.uow.run(async (repos) => {
      const events = await repos.outbox.claimUnrelayed(BATCH);
      for (const row of events) {
        const parsed = outboxEventInputSchema.safeParse({ type: row.type, payload: row.payload });
        if (!parsed.success) {
          unreadable.push(row.id);
          continue;
        }
        const plans = [];
        for (const plan of deliveriesOf(parsed.data)) {
          if (plan.target === "SMS") {
            const contact = await repos.investors.findContact(plan.recipientRef);
            if (!contact?.phone) continue;
          }
          plans.push(plan);
        }
        if (plans.length > 0) await repos.deliveries.createForEvent(row.id, plans);
      }
      if (events.length > 0) {
        await repos.outbox.markRelayed(
          events.map((e) => e.id),
          this.deps.clock.now(),
        );
      }
      return events.length;
    });

    const recovered = await this.uow.run((repos) =>
      repos.deliveries.requeueStale(new Date(this.deps.clock.now().getTime() - LEASE_MS)),
    );

    // Queued inside the transaction holding the rows: if Redis refuses, nothing is marked queued.
    const queued = await this.uow.run(async (repos) => {
      const ids = await repos.deliveries.claimUnqueued(BATCH);
      if (ids.length === 0) return 0;
      await this.deps.queue.enqueue(ids);
      await repos.deliveries.markQueued(ids, this.deps.clock.now());
      return ids.length;
    });
    return { relayed, queued, recovered, unreadable };
  }
}
