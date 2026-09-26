-- Waiver signing links for staff-created profiles. Additive only.
ALTER TABLE "Athlete" ADD COLUMN "waiverTokenHash" TEXT;
ALTER TABLE "Athlete" ADD COLUMN "waiverTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "Athlete" ADD COLUMN "waiverLinkSentAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Athlete_waiverTokenHash_key" ON "Athlete"("waiverTokenHash");
