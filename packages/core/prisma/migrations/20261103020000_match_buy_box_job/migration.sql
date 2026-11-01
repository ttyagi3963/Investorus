-- The MATCH_BUY_BOX job type (T321): match a saved buy box against every package still taking
-- offers. It arrives with its handler, because a job type without one fails the build.

-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'MATCH_BUY_BOX';
