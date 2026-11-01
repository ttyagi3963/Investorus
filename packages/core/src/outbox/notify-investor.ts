// Tells an investor about a change (T337; FR-022, FR-023): the in-app notice is written in the
// change, and a notice type that matters outside the app is also queued for email, and for a text
// when it is urgent, through the outbox in the same transaction. Agents' notices stay in the app.
import type { NoticeChannel } from "@clever/contracts/events";
import type { NotificationType } from "@clever/contracts/notification";
import type { NewNotification } from "../repositories/notification/INotificationRepository.js";
import type { UnitOfWorkRepositories } from "../unit-of-work/IUnitOfWork.js";
import { writeEvent } from "./write-event.js";

/** Which notices also leave the app (contracts/events.md); the rest stay in the inbox. */
const OUTSIDE_CHANNELS: Partial<Record<NotificationType, NoticeChannel[]>> = {
  PACKAGE_MATCHED: ["EMAIL", "SMS"],
  PACKAGE_CHANGED: ["EMAIL"],
  PACKAGE_WITHDRAWN: ["EMAIL"],
  PACKAGE_CLOSED_TO_OFFERS: ["EMAIL"],
  OFFER_COUNTERED: ["EMAIL"],
  OFFER_ACCEPTED: ["EMAIL"],
  OFFER_BACKUP: ["EMAIL"],
  OFFER_DECLINED: ["EMAIL"],
  DEAL_FELL_THROUGH: ["EMAIL"],
  BACKUP_PROMOTED: ["EMAIL", "SMS"],
};

export type InvestorNotice = Omit<NewNotification, "userId" | "packageId"> & { packageId: string };

export async function notifyInvestor(
  repos: UnitOfWorkRepositories,
  investorId: string,
  notice: InvestorNotice,
  /** False for a buy-box-change match, which reaches email only in the daily digest (FR-023). */
  { outside = true }: { outside?: boolean } = {},
): Promise<void> {
  const userId = await repos.users.findIdByInvestorId(investorId);
  if (userId) await repos.notifications.create({ userId, ...notice });

  const channels = outside ? OUTSIDE_CHANNELS[notice.type] : undefined;
  if (!channels) return;
  await writeEvent(repos, {
    type: "investor.notice",
    payload: {
      packageId: notice.packageId,
      investorId,
      noticeType: notice.type,
      title: notice.title,
      body: notice.body,
      channels,
    },
  });
}
