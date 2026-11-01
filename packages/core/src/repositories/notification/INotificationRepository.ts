// The notification port (T288): in-app messages, written in the same transaction as the change
// they report. Title and body never carry seller details.
import type { Notification } from "@clever/contracts/notification";

export type NewNotification = Omit<Notification, "id" | "readAt" | "createdAt">;

export interface INotificationRepository {
  create(notification: NewNotification): Promise<void>;
  /** The user's notifications, newest first. */
  listForUser(userId: string): Promise<Notification[]>;
  /** Marks the user's own notification read; false when they have no such notification. */
  markRead(userId: string, id: string, at: Date): Promise<boolean>;
}
