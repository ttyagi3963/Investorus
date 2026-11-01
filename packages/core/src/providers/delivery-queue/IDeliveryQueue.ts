// The delivery queue ports (T339; constitution XVIII): the relay hands IDeliveryQueue the deliveries
// to send, by ID, and the BullMQ implementation uses each ID as the job ID, so queueing one twice
// adds one job; the worker runs IDeliveryConsumer, which hands each job to the dispatcher.
import type { DispatchResult } from "../../outbox/DeliveryDispatcher.js";

export interface IDeliveryQueue {
  enqueue(deliveryIds: string[]): Promise<void>;
}

export interface IDeliveryConsumer {
  startConsumer(
    dispatch: (deliveryId: string) => Promise<DispatchResult>,
    options: { concurrency: number; onSetAside: (deliveryId: string, error: string) => void },
  ): void;
  close(): Promise<void>;
}
