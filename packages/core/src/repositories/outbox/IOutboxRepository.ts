// The outbox port (T337; constitution XVIII): a change appends the events the outside world must
// hear about, inside its own transaction; the worker's relay claims unrelayed events with SKIP
// LOCKED and marks them relayed once their deliveries exist (T339).
export type NewOutboxEvent = {
  type: string;
  aggregateType: string;
  aggregateId: string;
  /** Already checked against the event's schema; never carries seller PII. */
  payload: unknown;
  correlationId: string | null;
};

export type UnrelayedEvent = { id: string; type: string; payload: unknown };

export interface IOutboxRepository {
  append(event: NewOutboxEvent): Promise<void>;
  /** The oldest events not yet relayed, locked for this transaction. */
  claimUnrelayed(limit: number): Promise<UnrelayedEvent[]>;
  markRelayed(ids: string[], at: Date): Promise<void>;
}
