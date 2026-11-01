-- The daily match digest's job type (T340; FR-023), in its own migration: Postgres adds an enum
-- value only outside the transaction that first uses it.

-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'SEND_MATCH_DIGESTS';
