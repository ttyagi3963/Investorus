// The delivery queue ports (T339; constitution XVIII): the relay hands IDeliveryQueue the deliveries
// to send, by ID, and the BullMQ implementation uses each ID as the job ID, so queueing one twice
// adds one job; the worker runs IDeliveryConsumer, which hands each job to the dispatcher, and to
// its giveUp once a job has thrown on every try (T379).
import type { DeliveryDispatcher } from "../../outbox/DeliveryDispatcher.js";

export interface IDeliveryQueue {
  enqueue(deliveryIds: string[]): Promise<void>;
}

export interface IDeliveryConsumer {
  startConsumer(
    dispatcher: Pick<DeliveryDispatcher, "dispatch" | "giveUp">,
    options: { concurrency: number; onSetAside: (deliveryId: string, error: string) => void },
  ): void;
  close(): Promise<void>;
}
