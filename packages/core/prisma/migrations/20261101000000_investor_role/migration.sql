-- The INVESTOR login role (T278). On its own migration because Postgres cannot use a new enum
-- value in the same transaction that adds it, and the next migration's CHECK uses it.

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'INVESTOR';
