-- Fourth migration (T242, T243): sign-in by email, and editable drafts.
-- Written by hand: Prisma would drop and re-add the column, losing every user; a rename keeps them.

-- RenameColumn (T242): the login name becomes the email; the unique index is renamed to match.
ALTER TABLE "User" RENAME COLUMN "username" TO "email";
ALTER INDEX "User_username_key" RENAME TO "User_email_key";

-- AddColumn (T243): optimistic concurrency for editing a draft package.
ALTER TABLE "ListingPackage" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
