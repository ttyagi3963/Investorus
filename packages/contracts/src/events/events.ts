// The outbox events (T336; constitution XVIII, contracts/events.md), shaped from the OutboxEvent and
// Delivery tables: what each change tells the outside world, and which targets hear it. A payload
// is checked with Zod when it is written and again when the worker reads it, and never carries a
// seller's name, contact details, or street (FR-032; events.pii.test.ts).
import { z } from "zod";
import { PACKAGE_STATUSES } from "../listing-package/listing-package.js";
import { NOTIFICATION_TYPES } from "../notification/notification.js";
import { PROPERTY_TYPES } from "../property/enums.js";

export const DELIVERY_TARGETS = ["CRM", "EMAIL", "SMS"] as const;
export type DeliveryTarget = (typeof DELIVERY_TARGETS)[number];

export const DELIVERY_STATUSES = [
  "PENDING",
  "SENDING",
  "SENT",
  "RETRYING",
  "NEEDS_ATTENTION",
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

const id = z.string().min(1);

/** The listing as the CRM should show it after the change; the CRM keeps the newest by event time. */
export const crmSnapshotSchema = z.object({
  status: z.enum(PACKAGE_STATUSES),
  round: z.number().int().positive(),
  offerCount: z.number().int().min(0),
  acceptedPrice: z.number().int().positive().nullable(),
});
export type CrmSnapshot = z.infer<typeof crmSnapshotSchema>;

/** The outside channels an investor notice can also go to; in-app is written in the change itself. */
export const NOTICE_CHANNELS = ["EMAIL", "SMS"] as const;
export type NoticeChannel = (typeof NOTICE_CHANNELS)[number];

export const outboxEventInputSchema = z.discriminatedUnion("type", [
  /** Any package status change, including those a deal's milestones cause (FR-077). */
  z.object({
    type: z.literal("package.status_changed"),
    payload: z.object({
      packageId: id,
      from: z.enum(PACKAGE_STATUSES),
      crm: crmSnapshotSchema,
    }),
  }),
  /** A new offer: the CRM's offer count changes. */
  z.object({
    type: z.literal("offer.submitted"),
    payload: z.object({ packageId: id, offerId: id, investorId: id, crm: crmSnapshotSchema }),
  }),
  /** An in-app notice to an investor that should also arrive by email, and by text if urgent. */
  z.object({
    type: z.literal("investor.notice"),
    payload: z.object({
      packageId: id,
      investorId: id,
      noticeType: z.enum(NOTIFICATION_TYPES),
      title: z.string().min(1),
      body: z.string().min(1),
      channels: z.array(z.enum(NOTICE_CHANNELS)).min(1),
    }),
  }),
  /** The daily email listing the packages an investor's new or edited buy boxes matched (FR-023). */
  z.object({
    type: z.literal("investor.match_digest"),
    payload: z.object({
      investorId: id,
      digestDate: z.iso.date(),
      matches: z
        .array(
          z.object({
            packageId: id,
            city: z.string(),
            state: z.string(),
            zip: z.string(),
            propertyType: z.enum(PROPERTY_TYPES),
            priceMin: z.number().int().positive(),
            priceMax: z.number().int().positive(),
          }),
        )
        .min(1),
    }),
  }),
]);
export type OutboxEventInput = z.infer<typeof outboxEventInputSchema>;
export type OutboxEventType = OutboxEventInput["type"];

/** The record an event belongs to, for the operations timeline. */
export function aggregateOf(event: OutboxEventInput): {
  aggregateType: "ListingPackage" | "Investor";
  aggregateId: string;
} {
  return event.type === "investor.match_digest"
    ? { aggregateType: "Investor", aggregateId: event.payload.investorId }
    : { aggregateType: "ListingPackage", aggregateId: event.payload.packageId };
}

/** One delivery the relay creates: a target and who receives it (an investor or the package). */
export type DeliveryPlan = { target: DeliveryTarget; recipientRef: string };

/** Who hears an event. SMS is planned here and skipped by the relay for investors with no phone. */
export function deliveriesOf(event: OutboxEventInput): DeliveryPlan[] {
  switch (event.type) {
    case "package.status_changed":
    case "offer.submitted":
      return [{ target: "CRM", recipientRef: event.payload.packageId }];
    case "investor.notice":
      return event.payload.channels.map((target) => ({
        target,
        recipientRef: event.payload.investorId,
      }));
    case "investor.match_digest":
      return [{ target: "EMAIL", recipientRef: event.payload.investorId }];
  }
}
