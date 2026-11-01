// The notification port over Prisma (T288): the only file with Notification queries.
import type { Prisma } from "../../generated/prisma/client.js";
import type { INotificationRepository, NewNotification } from "./INotificationRepository.js";

export class PrismaNotificationRepositoryImpl implements INotificationRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}

  async create(notification: NewNotification): Promise<void> {
    await this.db.notification.create({ data: notification });
  }
}
