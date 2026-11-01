// Public API of @clever/contracts/events. Other packages import from here, never from the
// individual files, so the files can change without breaking callers.
export {
  aggregateOf,
  crmSnapshotSchema,
  deliveriesOf,
  DELIVERY_STATUSES,
  DELIVERY_TARGETS,
  NOTICE_CHANNELS,
  outboxEventInputSchema,
  type CrmSnapshot,
  type DeliveryPlan,
  type DeliveryStatus,
  type DeliveryTarget,
  type NoticeChannel,
  type OutboxEventInput,
  type OutboxEventType,
} from "./events.js";
