// The delivery port (T339; data-model.md Delivery): the relay creates and queues deliveries, and the
// dispatcher moves each through PENDING → SENDING → SENT, or RETRYING → NEEDS_ATTENTION. The claim
// methods lock rows with SKIP LOCKED, so two workers never take the same delivery.
import type { DeliveryPlan, DeliveryStatus, DeliveryTarget } from "@clever/contracts/events";

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
  /** PENDING deliveries not yet on the queue, oldest first, locked for this transaction. */
  claimUnqueued(limit: number): Promise<string[]>;
  markQueued(ids: string[], at: Date): Promise<void>;
  findWithEvent(id: string): Promise<DeliveryWithEvent | null>;
  /** Counts the attempt; only a PENDING or RETRYING delivery can start one. */
  markSending(id: string): Promise<boolean>;
  markSent(id: string, at: Date): Promise<void>;
  markRetrying(id: string, error: string, nextAttemptAt: Date): Promise<void>;
  markNeedsAttention(id: string, error: string): Promise<void>;
  /**
   * An operator's retry (FR-071): a delivery set aside goes back to PENDING with no attempts and
   * off the queue, so the relay queues it again. False when it was not set aside.
   */
  resetForRetry(id: string): Promise<boolean>;
}
