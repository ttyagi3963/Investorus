// The notification port over Prisma (T288): the only file with Notification queries.
import type { Notification } from "@clever/contracts/notification";
import type { Prisma } from "../../generated/prisma/client.js";
import type { INotificationRepository, NewNotification } from "./INotificationRepository.js";

export class PrismaNotificationRepositoryImpl implements INotificationRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}

  async create(notification: NewNotification): Promise<void> {
    await this.db.notification.create({ data: notification });
  }

  async listForUser(userId: string): Promise<Notification[]> {
    return this.db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  }

  async markRead(userId: string, id: string, at: Date): Promise<boolean> {
    const { count } = await this.db.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: at },
    });
    if (count > 0) return true;
    return (await this.db.notification.count({ where: { id, userId } })) > 0;
  }
}
