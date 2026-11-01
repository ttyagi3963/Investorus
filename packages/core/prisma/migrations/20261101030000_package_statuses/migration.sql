-- The publishing and withdrawal statuses (T280). On their own migration because Postgres cannot
-- use a new enum value in the same transaction that adds it, and the next migration's partial
-- address index uses WITHDRAWN.

-- AlterEnum
ALTER TYPE "PackageStatus" ADD VALUE 'ACCEPTING_OFFERS';
ALTER TYPE "PackageStatus" ADD VALUE 'WITHDRAWN';
