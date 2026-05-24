-- waiverSignedAt on Athlete: timestamp of the formal waiver acknowledgment
-- on the verify page. NULL means they haven't completed the activation step
-- (or registered before this feature existed and were grandfathered in).
ALTER TABLE "Athlete" ADD COLUMN "waiverSignedAt" TIMESTAMP(3);

-- Grandfather existing verified athletes: assume they signed when they
-- registered (close enough for legacy rows).
UPDATE "Athlete"
  SET "waiverSignedAt" = "createdAt"
  WHERE "emailVerified" = true AND "waiverSignedAt" IS NULL;
