-- The Sprint 4 match trigger (T319): a match created because an investor saved a buy box. On its
-- own migration because Postgres cannot use a new enum value in the transaction that adds it.

-- AlterEnum
ALTER TYPE "MatchTrigger" ADD VALUE 'BUY_BOX_CHANGE';
