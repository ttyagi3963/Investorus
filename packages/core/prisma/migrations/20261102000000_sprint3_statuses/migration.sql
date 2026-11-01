-- The Sprint 3 enum values (T304): the package, offer, match-trigger, and notification values for
-- deadlines, decisions, and deals; each job type arrives with its handler. On their own migration
-- because Postgres cannot use a new enum value in the transaction that adds it, and the next
-- migration's indexes use them.

-- AlterEnum
ALTER TYPE "MatchTrigger" ADD VALUE 'REOPEN';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'OFFER_ROUND_CLOSED';
ALTER TYPE "NotificationType" ADD VALUE 'OFFER_DEADLINE_EXTENDED';
ALTER TYPE "NotificationType" ADD VALUE 'OFFER_EXPIRED';
ALTER TYPE "NotificationType" ADD VALUE 'OFFER_COUNTERED';
ALTER TYPE "NotificationType" ADD VALUE 'COUNTER_ANSWERED';
ALTER TYPE "NotificationType" ADD VALUE 'OFFER_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE 'OFFER_BACKUP';
ALTER TYPE "NotificationType" ADD VALUE 'OFFER_DECLINED';
ALTER TYPE "NotificationType" ADD VALUE 'PACKAGE_CLOSED_TO_OFFERS';
ALTER TYPE "NotificationType" ADD VALUE 'DEAL_MILESTONE';
ALTER TYPE "NotificationType" ADD VALUE 'DEAL_FELL_THROUGH';
ALTER TYPE "NotificationType" ADD VALUE 'BACKUP_PROMOTED';
ALTER TYPE "NotificationType" ADD VALUE 'BACKUP_RECONFIRMED';
ALTER TYPE "NotificationType" ADD VALUE 'RECONFIRMATION_DECLINED';

-- AlterEnum
ALTER TYPE "OfferStatus" ADD VALUE 'COUNTERED';
ALTER TYPE "OfferStatus" ADD VALUE 'BACKUP';
ALTER TYPE "OfferStatus" ADD VALUE 'ACCEPTED';
ALTER TYPE "OfferStatus" ADD VALUE 'WITHDRAWN';
ALTER TYPE "OfferStatus" ADD VALUE 'EXPIRED';
ALTER TYPE "OfferStatus" ADD VALUE 'FELL_THROUGH';
ALTER TYPE "OfferStatus" ADD VALUE 'DECLINED_TO_RECONFIRM';

-- AlterEnum
ALTER TYPE "PackageStatus" ADD VALUE 'NO_OFFERS_RECEIVED';
ALTER TYPE "PackageStatus" ADD VALUE 'OFFER_ACCEPTED';
ALTER TYPE "PackageStatus" ADD VALUE 'UNDER_CONTRACT';
ALTER TYPE "PackageStatus" ADD VALUE 'INSPECTION';
ALTER TYPE "PackageStatus" ADD VALUE 'CLOSING';
ALTER TYPE "PackageStatus" ADD VALUE 'CLOSED';
ALTER TYPE "PackageStatus" ADD VALUE 'FELL_THROUGH';
