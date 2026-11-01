// The relay loop (T339; constitution XVIII): a second after each tick ends, the outbox relay turns
// new events into deliveries and queues the unqueued ones, so ticks never overlap or pile up. A
// failed tick is reported and the next one tries again: nothing is lost while the database or
// Redis is down. Stopping waits for the tick in progress.
import type { IErrorReporter, OutboxRelay } from "@clever/core";
import type { Logger } from "pino";

const INTERVAL_MS = 1_000;

export function startRelayLoop(deps: {
  relay: OutboxRelay;
  logger: Logger;
  reporter: IErrorReporter;
}): { stop: () => Promise<void> } {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let current: Promise<void> = Promise.resolve();

  const tick = async () => {
    try {
      const { relayed, queued, recovered, unreadable } = await deps.relay.tick();
      if (relayed > 0 || queued > 0) deps.logger.info({ relayed, queued }, "outbox relayed");
      if (recovered > 0) deps.logger.warn({ recovered }, "deliveries whose job was lost re-queued");
      for (const eventId of unreadable) {
        deps.logger.error({ event_id: eventId }, "outbox event no longer matches its schema");
      }
    } catch (err) {
      deps.reporter.report(err, { component: "outbox-relay" });
    }
  };
  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(() => {
      current = tick().then(schedule);
    }, INTERVAL_MS);
  };
  schedule();

  return {
    stop: async () => {
      stopped = true;
      clearTimeout(timer);
      await current;
    },
  };
}
