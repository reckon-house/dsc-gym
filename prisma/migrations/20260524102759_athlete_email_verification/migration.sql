-- Athlete email verification: gates login until the email link is clicked.
-- Existing 27 athletes get emailVerified=true so they aren't locked out;
-- only NEW registrations require verification.

ALTER TABLE "Athlete" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Athlete" ADD COLUMN "emailVerificationToken" TEXT;
ALTER TABLE "Athlete" ADD COLUMN "emailVerificationExpiresAt" TIMESTAMP(3);

-- Grandfather in existing athletes — they registered before this feature existed.
UPDATE "Athlete" SET "emailVerified" = true WHERE "createdAt" < CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "Athlete_emailVerificationToken_key" ON "Athlete"("emailVerificationToken");
