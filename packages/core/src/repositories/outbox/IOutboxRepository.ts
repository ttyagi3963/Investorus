// The outbox port (T337; constitution XVIII): a change appends the events the outside world must
// hear about, inside its own transaction. The relay's reads and writes arrive with T339.
export type NewOutboxEvent = {
  type: string;
  aggregateType: string;
  aggregateId: string;
  /** Already checked against the event's schema; never carries seller PII. */
  payload: unknown;
  correlationId: string | null;
};

export interface IOutboxRepository {
  append(event: NewOutboxEvent): Promise<void>;
}
