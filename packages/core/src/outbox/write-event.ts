// Appends one outbox event inside the caller's change (T337; constitution XVIII): the payload is
// checked against its schema before it is stored, and the event carries the request's trace ID so
// its deliveries can be followed in the logs.
import {
  aggregateOf,
  outboxEventInputSchema,
  type OutboxEventInput,
} from "@clever/contracts/events";
import { currentTraceId } from "../infra/trace-context.js";
import type { UnitOfWorkRepositories } from "../unit-of-work/IUnitOfWork.js";

export async function writeEvent(
  repos: Pick<UnitOfWorkRepositories, "outbox">,
  event: OutboxEventInput,
): Promise<void> {
  const checked = outboxEventInputSchema.parse(event);
  await repos.outbox.append({
    type: checked.type,
    ...aggregateOf(checked),
    payload: checked.payload,
    correlationId: currentTraceId() ?? null,
  });
}
