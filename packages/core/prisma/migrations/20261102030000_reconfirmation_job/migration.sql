-- The promoted backup's timer (T311; FR-057): EXPIRE_RECONFIRMATION runs at a deal's reconfirmBy,
-- scheduled in the change that promotes the backup; the one-live-job index keeps it queued once.

-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'EXPIRE_RECONFIRMATION';
