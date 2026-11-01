-- The offer round's timers (T306): CLOSE_OFFER_ROUND runs at the deadline and EXPIRE_OFFER at an
-- offer's expiry. Both are scheduled with a future runAt in the change that sets the time, and
-- the existing one-live-job index keeps each dedupe key queued once.

-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'CLOSE_OFFER_ROUND';
ALTER TYPE "JobType" ADD VALUE 'EXPIRE_OFFER';
