// The in-app Notification, shaped from the Prisma `Notification` model (T281), and the view the
// inbox shows (GET /notifications). Title and body are written without seller details.

export const NOTIFICATION_TYPES = [
  "PACKAGE_MATCHED",
  "PACKAGE_CHANGED",
  "PACKAGE_WITHDRAWN",
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
