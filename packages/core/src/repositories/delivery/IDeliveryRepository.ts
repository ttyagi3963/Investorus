// The delivery port (T339; data-model.md Delivery): the relay creates and queues deliveries, and the
// dispatcher moves each through PENDING → SENDING → SENT, or RETRYING → NEEDS_ATTENTION. The claim
// methods lock rows with SKIP LOCKED, so two workers never take the same delivery, and an attempt's
// outcome is recorded only by the run that started it (T379), so a run that lost its claim cannot.
import type { DeliveryPlan, DeliveryStatus, DeliveryTarget } from "@clever/contracts/events";

/** Which deliveries set aside an operator's "retry all" takes back: optionally only one target's,
 * and optionally only those about one package. */
export type RetryAllFilter = { target?: DeliveryTarget; packageId?: string };

export type Delivery = {
  id: string;
  outboxEventId: string;
  target: DeliveryTarget;
  recipientRef: string;
  status: DeliveryStatus;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: Date | null;
  queuedAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** A delivery with the event it carries, as the dispatcher reads it. */
export type DeliveryWithEvent = Delivery & {
  event: { type: string; payload: unknown; occurredAt: Date; sequence: number };
};

export interface IDeliveryRepository {
  /** One row per plan; a plan the event already has is skipped, so a second relay adds nothing. */
  createForEvent(outboxEventId: string, plans: DeliveryPlan[]): Promise<void>;
  /**
   * Puts back on the way to the queue every delivery whose job may be gone (Redis lost it, or the
   * worker died mid-send): PENDING queued before `before` and never started, RETRYING overdue since
   * before `before`, and SENDING untouched since before `before`. Their attempts are kept; the
   * idempotency key makes a resend safe. Returns how many.
   */
  requeueStale(before: Date): Promise<number>;
  /**
   * Marks queued at `at` the oldest PENDING deliveries not yet on the queue, skipping rows another
   * relay holds, and returns their IDs. The caller queues them after this commits.
   */
  claimUnqueued(limit: number, at: Date): Promise<string[]>;
  /** Takes back a claim the queue refused, so the next relay pass claims those deliveries again. */
  releaseQueued(ids: string[], at: Date): Promise<void>;
  findWithEvent(id: string): Promise<DeliveryWithEvent | null>;
  /**
   * Starts an attempt; only a PENDING or RETRYING delivery can. Returns the attempt's number, which
   * the outcome below must name, or null when the delivery cannot start one.
   */
  markSending(id: string): Promise<number | null>;
  /** The outcomes of an attempt: false when `attempt` is no longer the delivery's current one. */
  markSent(id: string, attempt: number, at: Date): Promise<boolean>;
  markRetrying(id: string, attempt: number, error: string, nextAttemptAt: Date): Promise<boolean>;
  markNeedsAttention(id: string, attempt: number, error: string): Promise<boolean>;
  /**
   * Sets aside a delivery not yet sent or set aside, whatever its attempt: its job used every try
   * without the dispatcher deciding (each one threw), so operations must look at it.
   */
  giveUp(id: string, error: string): Promise<void>;
  /**
   * An operator's retry (FR-071): a delivery set aside goes back to PENDING with no attempts and
   * off the queue, so the relay queues it again. False when it was not set aside.
   */
  resetForRetry(id: string): Promise<boolean>;
  /**
   * resetForRetry for every delivery set aside that the filter selects, in one statement however
   * many there are (T386). Returns how many.
   */
  resetAllForRetry(filter: RetryAllFilter): Promise<number>;
}
