// Public API of @clever/contracts/notification. Other packages import from here, never from the
// individual files, so the files can change without breaking callers.
export {
  NOTIFICATION_TYPES,
  toNotificationView,
  type Notification,
  type NotificationType,
  type NotificationView,
} from "./notification.js";
