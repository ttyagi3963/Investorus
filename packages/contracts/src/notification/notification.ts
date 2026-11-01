// The in-app Notification, shaped from the Prisma `Notification` model (T281), and the view the
// inbox shows (GET /notifications). Title and body are written without seller details.

export const NOTIFICATION_TYPES = [
  "PACKAGE_MATCHED",
  "PACKAGE_CHANGED",
  "PACKAGE_WITHDRAWN",
  "OFFER_ROUND_CLOSED",
  "OFFER_DEADLINE_EXTENDED",
  "OFFER_EXPIRED",
  "OFFER_COUNTERED",
  "COUNTER_ANSWERED",
  "OFFER_ACCEPTED",
  "OFFER_BACKUP",
  "OFFER_DECLINED",
  "PACKAGE_CLOSED_TO_OFFERS",
  "DEAL_MILESTONE",
  "DEAL_FELL_THROUGH",
  "BACKUP_PROMOTED",
  "BACKUP_RECONFIRMED",
  "RECONFIRMATION_DECLINED",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type Notification = {
  id: string;
  userId: string;
  type: NotificationType;
  packageId: string | null;
  title: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
};

export type NotificationView = {
  id: string;
  type: NotificationType;
  packageId: string | null;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
};

export function toNotificationView(n: Notification): NotificationView {
  return {
    id: n.id,
    type: n.type,
    packageId: n.packageId,
    title: n.title,
    body: n.body,
    read: n.readAt !== null,
    createdAt: n.createdAt.toISOString(),
  };
}
