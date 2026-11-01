-- The IMPORT_INVESTORS job type (T322): read one uploaded legacy investor file. It arrives with its
-- handler, because a job type without one fails the build.

-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'IMPORT_INVESTORS';
