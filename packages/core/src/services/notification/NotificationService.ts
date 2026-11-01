// The in-app inbox (T297): a signed-in user lists their own notifications, newest first, and marks
// one read. Another user's notification is "not found".
import type { Actor } from "@clever/contracts/auth";
import { NotFoundError } from "@clever/contracts/common";
import type { Notification } from "@clever/contracts/notification";
import type { IClock } from "../../providers/clock/IClock.js";
import type { IUnitOfWork } from "../../unit-of-work/IUnitOfWork.js";

export interface INotificationService {
  listMine(actor: Actor): Promise<Notification[]>;
  markRead(actor: Actor, id: string): Promise<void>;
}

export class NotificationService implements INotificationService {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly deps: { clock: IClock },
  ) {}

  listMine(actor: Actor): Promise<Notification[]> {
    return this.uow.run((repos) => repos.notifications.listForUser(actor.userId));
  }

  async markRead(actor: Actor, id: string): Promise<void> {
    const found = await this.uow.run((repos) =>
      repos.notifications.markRead(actor.userId, id, this.deps.clock.now()),
    );
    if (!found) throw new NotFoundError("Notification not found");
  }
}
